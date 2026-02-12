import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import Stripe from "stripe";
import { adminDb } from "@/lib/firebaseAdmin";
import { computeBalanceDue, computeInvoiceStatus, normalizeInvoiceStatus } from "@/lib/finance/status";
import { getStripeClient, getStripeWebhookSecret } from "@/lib/payments/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function applyPaymentToInvoice({
  invoiceId,
  amountUsd,
  markFailed,
}: {
  invoiceId: string;
  amountUsd: number;
  markFailed?: boolean;
}) {
  await adminDb.runTransaction(async (tx) => {
    const invoiceRef = adminDb.collection("invoices").doc(invoiceId);
    const invoiceSnap = await tx.get(invoiceRef);
    if (!invoiceSnap.exists || invoiceSnap.data()?.isDeleted) return;

    const invoice = invoiceSnap.data() || {};
    const totalAmount = Number(invoice.amountTotalUsd || 0);
    const currentPaid = Number(invoice.totalPaid || 0);
    const nextPaid = markFailed ? currentPaid : currentPaid + Math.max(0, amountUsd);
    const nextStatus = markFailed
      ? normalizeInvoiceStatus(invoice.status)
      : computeInvoiceStatus({ currentStatus: invoice.status, totalAmount, totalPaid: nextPaid });

    tx.set(
      invoiceRef,
      {
        totalPaid: nextPaid,
        balanceDue: computeBalanceDue(totalAmount, nextPaid),
        status: nextStatus,
        paidAt: nextStatus === "paid" ? admin.firestore.FieldValue.serverTimestamp() : invoice.paidAt || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

async function handlePaymentSucceeded(intent: Stripe.PaymentIntent) {
  const tenantId = String(intent.metadata?.tenantId || "");
  const invoiceId = String(intent.metadata?.invoiceId || "");
  const clientId = String(intent.metadata?.clientId || "");
  const orderId = String(intent.metadata?.orderId || "");

  if (!tenantId || !invoiceId || !clientId) return;

  const charge = typeof intent.latest_charge === "string" ? await getStripeClient().charges.retrieve(intent.latest_charge) : null;
  const amountUsd = Number(intent.amount_received || intent.amount || 0) / 100;
  const now = admin.firestore.FieldValue.serverTimestamp();
  const paymentId = `stripe_pi_${intent.id}`;

  const batch = adminDb.batch();

  batch.set(
    adminDb.collection("payments").doc(paymentId),
    {
      id: paymentId,
      tenantId,
      clientId,
      invoiceId,
      orderId,
      amountUsd,
      currency: String(intent.currency || "usd").toUpperCase(),
      status: "succeeded",
      method: "stripe_checkout",
      stripePaymentIntentId: intent.id,
      stripeChargeId: charge?.id || null,
      stripeCustomerId: intent.customer ? String(intent.customer) : null,
      receiptUrl: charge?.receipt_url || null,
      failureCode: null,
      failureMessage: null,
      paidAt: now,
      updatedAt: now,
      isDeleted: false,
    },
    { merge: true }
  );

  batch.set(
    adminDb.collection("payment_intents").doc(`pi_${intent.id}`),
    {
      status: String(intent.status || "succeeded"),
      updatedAt: now,
    },
    { merge: true }
  );

  await batch.commit();
  await applyPaymentToInvoice({ invoiceId, amountUsd });
}

async function handlePaymentFailed(intent: Stripe.PaymentIntent) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const paymentId = `stripe_pi_${intent.id}`;

  await adminDb.collection("payments").doc(paymentId).set(
    {
      status: "failed",
      failureCode: intent.last_payment_error?.code || null,
      failureMessage: intent.last_payment_error?.message || "Payment failed.",
      updatedAt: now,
    },
    { merge: true }
  );

  await adminDb.collection("payment_intents").doc(`pi_${intent.id}`).set(
    {
      status: String(intent.status || "requires_payment_method"),
      updatedAt: now,
    },
    { merge: true }
  );
}

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ ok: false, error: "Missing signature." }, { status: 400 });
  }

  const body = await req.text();

  try {
    const stripe = getStripeClient();
    const event = stripe.webhooks.constructEvent(body, signature, getStripeWebhookSecret());

    if (event.type === "payment_intent.succeeded") {
      await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
    } else if (event.type === "payment_intent.payment_failed") {
      await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
    } else if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = String(charge.payment_intent || "");
      if (paymentIntentId) {
        await adminDb.collection("payments").doc(`stripe_pi_${paymentIntentId}`).set(
          {
            status: "refunded",
            refundedAmountUsd: Number(charge.amount_refunded || 0) / 100,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("payments/webhooks error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Webhook error." }, { status: 400 });
  }
}
