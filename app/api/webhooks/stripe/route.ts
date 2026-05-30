import { NextResponse } from "next/server";
import Stripe from "stripe";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { createNotification, getUserIdsByRoles } from "@/lib/notifications";
import { toISO } from "../../sales/_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StripeConfig = {
  tenantId: string;
  secretKey: string;
  webhookSecret: string;
};

async function loadStripeConfigs(): Promise<StripeConfig[]> {
  const tenantsSnap = await adminDb.collection("tenants").get();
  const configs: StripeConfig[] = [];

  for (const tenant of tenantsSnap.docs) {
    const tenantId = tenant.id;
    const stripeSnap = await adminDb.collection("tenants").doc(tenantId).collection("integrations").doc("stripe").get();
    if (!stripeSnap.exists) continue;
    const data = stripeSnap.data() || {};
    if (!data.enabled || !data.secretKey || !data.webhookSecret) continue;
    configs.push({
      tenantId,
      secretKey: String(data.secretKey),
      webhookSecret: String(data.webhookSecret),
    });
  }

  return configs;
}

export async function POST(req: Request) {
  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return NextResponse.json({ ok: false, error: "Missing signature." }, { status: 400 });
    }

    const body = await req.text();
    const configs = await loadStripeConfigs();
    let matchedEvent: Stripe.Event | null = null;
    let matchedConfig: StripeConfig | null = null;

    for (const config of configs) {
      try {
        const stripe = new Stripe(config.secretKey, { apiVersion: "2024-06-20" });
        const event = stripe.webhooks.constructEvent(body, signature, config.webhookSecret);
        matchedEvent = event;
        matchedConfig = config;
        break;
      } catch {
        continue;
      }
    }

    if (!matchedEvent || !matchedConfig) {
      return NextResponse.json({ ok: false, error: "Signature verification failed." }, { status: 400 });
    }

    if (matchedEvent.type !== "checkout.session.completed" && matchedEvent.type !== "payment_intent.succeeded") {
      return NextResponse.json({ ok: true, received: true });
    }

    const eventObject = matchedEvent.data.object as Stripe.Checkout.Session | Stripe.PaymentIntent;
    const sessionId =
      "id" in eventObject && matchedEvent.type === "checkout.session.completed" ? eventObject.id : null;
    const paymentIntentId =
      "id" in eventObject && matchedEvent.type === "payment_intent.succeeded" ? eventObject.id : null;

    if (!sessionId && !paymentIntentId) {
      return NextResponse.json({ ok: true, received: true });
    }

    const requestSnap = sessionId
      ? await adminDb
          .collection("paymentRequests")
          .where("stripeCheckoutSessionId", "==", sessionId)
          .limit(1)
          .get()
      : null;

    const requestDoc = requestSnap?.docs?.[0];
    if (!requestDoc) {
      return NextResponse.json({ ok: true, received: true });
    }

    const requestData = requestDoc.data() || {};
    const tenantId = String(requestData.tenantId || matchedConfig.tenantId || "");
    const leadId = String(requestData.leadId || "");
    const amountUsd = Number(requestData.amountUsd || 0);

    await requestDoc.ref.set(
      {
        status: "paid",
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const paymentRef = adminDb.collection("payments").doc();
    await paymentRef.set({
      id: paymentRef.id,
      tenantId,
      invoiceId: requestDoc.id,
      leadId,
      amountUsd,
      currency: "USD",
      provider: "stripe",
      providerPaymentId: paymentIntentId || sessionId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const leadSnap = leadId ? await adminDb.collection("leads").doc(leadId).get() : null;
    const lead = leadSnap?.exists ? leadSnap.data() || {} : {};
    const companyName = String(lead.companyName || "");
    const contactName = String(lead.contactName || lead.name || "");
    const ownerId = String(lead.ownerId || "");

    const [managerIds, adminIds, financeIds] = await Promise.all([
      getUserIdsByRoles(["sales_manager"], tenantId),
      getUserIdsByRoles(["admin", "super_admin"], tenantId),
      getUserIdsByRoles(["finance"], tenantId),
    ]);

    const notificationTargets = new Set([ownerId, ...managerIds, ...adminIds, ...financeIds].filter(Boolean));
    const message = `Payment received: $${amountUsd.toLocaleString()} — ${companyName || "Lead"}${
      contactName ? ` (${contactName})` : ""
    }`;

    await Promise.all(
      Array.from(notificationTargets).map((uid) => {
        const roleLink = managerIds.includes(uid)
          ? `/sales_manager/leads?open=${leadId}`
          : adminIds.includes(uid)
          ? `/admin/finance/invoices?open=${requestDoc.id}`
          : financeIds.includes(uid)
          ? `/finance/invoices?open=${requestDoc.id}`
          : `/sales/leads?open=${leadId}`;
        return createNotification({
          toUserId: uid,
          title: "Payment received",
          body: message,
          type: "success",
          entityType: "payment",
          entityId: paymentRef.id,
          deepLink: roleLink,
        });
      })
    );

    await adminDb.collection("events").add({
      type: "sales.payment_received",
      title: "Payment received",
      description: message,
      entityType: "payment",
      entityId: paymentRef.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      metadata: {
        leadId,
        invoiceId: requestDoc.id,
        paidAt: toISO(new Date()),
      },
    });

    return NextResponse.json({ ok: true, received: true });
  } catch (err) {
    console.error("stripe webhook error:", err);
    return NextResponse.json({ ok: false, error: "Webhook error." }, { status: 500 });
  }
}
