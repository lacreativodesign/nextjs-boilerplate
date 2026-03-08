import { NextResponse } from "next/server";
import Stripe from "stripe";
import { adminDb } from "@/lib/firebaseAdmin";
import { getStripeClient } from "@/lib/payments/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getConnectWebhookSecret(): string {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_CONNECT_WEBHOOK_SECRET is not configured.");
  }
  return secret;
}

async function findTenantByAccountId(accountId: string) {
  const query = await adminDb
    .collection("tenants")
    .where("stripeConnectAccountId", "==", accountId)
    .limit(1)
    .get();

  if (query.empty) {
    return null;
  }

  return query.docs[0];
}

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    console.error("[STRIPE_CONNECT] Missing webhook signature.");
    return NextResponse.json({ ok: false, received: true });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(body, signature, getConnectWebhookSecret());
  } catch (error) {
    console.error("[STRIPE_CONNECT] Webhook signature verification failed", error);
    return NextResponse.json({ ok: false, received: true });
  }

  try {
    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;
      const accountId = account.id;
      const tenantDoc = await findTenantByAccountId(accountId);

      if (tenantDoc) {
        const now = new Date().toISOString();
        await tenantDoc.ref.set(
          {
            stripeConnectChargesEnabled: Boolean(account.charges_enabled),
            stripeConnectPayoutsEnabled: Boolean(account.payouts_enabled),
            stripeConnectStatus: account.charges_enabled ? "active" : "restricted",
            updatedAt: now,
          },
          { merge: true },
        );
      }

      return NextResponse.json({ ok: true, received: true });
    }

    if (event.type === "account.application.deauthorized") {
      const data = event.data.object as { id?: string; account?: string; stripe_user_id?: string };
      const accountId = data.account || data.stripe_user_id || data.id;

      if (accountId) {
        const tenantDoc = await findTenantByAccountId(accountId);
        if (tenantDoc) {
          const now = new Date().toISOString();
          await tenantDoc.ref.set(
            {
              stripeConnectStatus: "disconnected",
              stripeConnectAccountId: null,
              stripeConnectEmail: null,
              stripeConnectBusinessName: null,
              stripeConnectConnectedAt: null,
              stripeConnectChargesEnabled: false,
              stripeConnectPayoutsEnabled: false,
              updatedAt: now,
            },
            { merge: true },
          );

          await adminDb.collection("audit_logs").add({
            tenantId: tenantDoc.id,
            action: "stripe_connect_deauthorized",
            performedBy: "system",
            details: { accountId },
            timestamp: now,
          });
        }
      }

      return NextResponse.json({ ok: true, received: true });
    }

    return NextResponse.json({ ok: true, received: true });
  } catch (error) {
    console.error("[STRIPE_CONNECT] Webhook handling failed", error);
    return NextResponse.json({ ok: false, received: true });
  }
}
