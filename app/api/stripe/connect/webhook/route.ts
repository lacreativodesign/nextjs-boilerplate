import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as admin from "firebase-admin";
import Stripe from "stripe";
import { adminDb } from "../../../../../lib/firebaseAdmin";
import { createRoleNotifications } from "../../../../../lib/notifications";
import { writeAuditLog } from "../../../../../lib/tenant/audit";
import { isPlanAccessError, requireModule } from "../../../../lib/plan-enforcement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HANDLED_EVENTS = new Set(["payment_intent.succeeded", "invoice.paid", "customer.created"]);

function getStripeClient() {
  const secretKey = process.env.STRIPE_CONNECT_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_CONNECT_SECRET_KEY is not configured.");
  }
  return new Stripe(secretKey, { apiVersion: "2024-06-20" });
}

function getWebhookSecret() {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_CONNECT_WEBHOOK_SECRET is not configured.");
  }
  return secret;
}

async function notifySignatureFailure(message: string) {
  await writeAuditLog({
    tenantId: null,
    actorUserId: "system",
    actorName: "system",
    actorRole: "system",
    actionType: "stripe_connect_webhook_signature_failed",
    entityType: "stripe_connect",
    entityId: "stripe_connect_webhook",
    metadata: { message },
  });

  await createRoleNotifications({
    tenantId: null,
    recipientTenantId: null,
    roles: ["super_admin"],
    title: "Stripe Connect webhook failed",
    body: "Stripe Connect webhook signature verification failed.",
    type: "warning",
    priority: "high",
    entityType: "tenant",
    entityId: "stripe_connect_webhook",
    createdBy: { uid: "system", name: "system" },
    metadata: { message },
  });
}

async function enforceModuleAccess(tenantId: string) {
  try {
    await requireModule(tenantId, "client_stripe_connect");
  } catch (err) {
    if (isPlanAccessError(err)) {
      return { ok: false as const, status: 403, error: "MODULE_DISABLED" };
    }
    return { ok: false as const, status: 500, error: "Unable to validate module access." };
  }
  return { ok: true as const };
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  if (!signature) {
    await notifySignatureFailure("Missing Stripe signature.");
    return NextResponse.json({ ok: false, error: "Missing signature." }, { status: 400 });
  }

  try {
    const stripe = getStripeClient();
    const event = stripe.webhooks.constructEvent(body, signature, getWebhookSecret());

    if (!HANDLED_EVENTS.has(event.type)) {
      return NextResponse.json({ ok: true });
    }

    const stripeAccountId = event.account;
    if (!stripeAccountId) {
      return NextResponse.json({ ok: false, error: "Missing Stripe account." }, { status: 400 });
    }

    const tenantSnap = await adminDb
      .collection("tenants")
      .where("stripeConnect.accountId", "==", stripeAccountId)
      .limit(1)
      .get();

    if (tenantSnap.empty) {
      return NextResponse.json({ ok: true });
    }

    const tenantDoc = tenantSnap.docs[0];
    const tenantId = tenantDoc.id;

    const moduleAccess = await enforceModuleAccess(tenantId);
    if (!moduleAccess.ok) {
      return NextResponse.json({ ok: false, error: moduleAccess.error }, { status: moduleAccess.status });
    }

    const tenantData = tenantDoc.data() || {};
    const stripeConnect = (tenantData.stripeConnect || {}) as Record<string, any>;
    if (stripeConnect.status !== "connected") {
      return NextResponse.json({ ok: true });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const paymentRef = adminDb.collection("payments").doc(`stripe_connect_${paymentIntent.id}`);
      await paymentRef.set(
        {
          tenantId,
          source: "stripe_connect",
          stripeAccountId,
          stripePaymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount_received || paymentIntent.amount || 0,
          currency: paymentIntent.currency || "usd",
          status: "succeeded",
          createdAt: now,
        },
        { merge: true }
      );

      if (!stripeConnect.firstPaymentAt) {
        await adminDb.collection("tenants").doc(tenantId).set(
          {
            "stripeConnect.firstPaymentAt": now,
          },
          { merge: true }
        );

        await writeAuditLog({
          tenantId,
          actorUserId: "system",
          actorName: "system",
          actorRole: "system",
          actionType: "stripe_connect_first_payment",
          entityType: "payment",
          entityId: paymentRef.id,
          metadata: { stripePaymentIntentId: paymentIntent.id },
        });

        await createRoleNotifications({
          tenantId,
          roles: ["admin"],
          title: "First Stripe Connect payment received",
          body: "Your first Stripe Connect payment has been recorded in Bizosto.",
          type: "success",
          priority: "normal",
          entityType: "payment",
          entityId: paymentRef.id,
          createdBy: { uid: "system", name: "system" },
          metadata: { stripePaymentIntentId: paymentIntent.id },
        });
      }
    }

    if (event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice;
      const invoiceRef = adminDb.collection("stripeConnectInvoices").doc(`stripe_connect_${invoice.id}`);
      await invoiceRef.set(
        {
          tenantId,
          stripeAccountId,
          stripeInvoiceId: invoice.id,
          amountPaid: invoice.amount_paid || 0,
          currency: invoice.currency || "usd",
          status: invoice.status || "paid",
          createdAt: now,
        },
        { merge: true }
      );
    }

    if (event.type === "customer.created") {
      const customer = event.data.object as Stripe.Customer;
      const customerRef = adminDb
        .collection("stripeConnectCustomers")
        .doc(`stripe_connect_${customer.id}`);
      await customerRef.set(
        {
          tenantId,
          stripeAccountId,
          stripeCustomerId: customer.id,
          email: customer.email || null,
          name: customer.name || null,
          createdAt: now,
        },
        { merge: true }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const message = err?.message || "Stripe webhook error.";
    await notifySignatureFailure(message);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
