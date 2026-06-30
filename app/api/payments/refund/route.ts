import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireFinance } from "../../finance/_utils";
import { assertPermission, Permission } from "../../../lib/permissions";
import { createStripeRefund, getStripeClient } from "@/lib/payments/stripe";
import { createNotifications, getUsersByRoles } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toReason(input: unknown): "duplicate" | "fraudulent" | "requested_by_customer" | undefined {
  const value = String(input || "").trim().toLowerCase();
  if (value === "duplicate" || value === "fraudulent" || value === "requested_by_customer") return value;
  return undefined;
}

export async function POST(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    assertPermission(auth.user.role, Permission.MarkPaymentPaid);

    const body = await req.json().catch(() => ({}));
    const paymentId = String(body?.paymentId || "").trim();
    const amountUsd = body?.amountUsd == null ? undefined : Number(body.amountUsd);
    const reason = toReason(body?.reason);

    if (!paymentId) {
      return NextResponse.json({ ok: false, error: "Payment is required." }, { status: 400 });
    }

    const paymentRef = adminDb.collection("payments").doc(paymentId);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists || paymentSnap.data()?.isDeleted) {
      return NextResponse.json({ ok: false, error: "Payment not found." }, { status: 404 });
    }

    const payment = paymentSnap.data() || {};
    if (String(payment.tenantId || "") !== String(auth.user.tenantId || "")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const stripePaymentIntentId = String(payment.stripePaymentIntentId || "");
    if (!stripePaymentIntentId) {
      return NextResponse.json({ ok: false, error: "Payment is not refundable through Stripe." }, { status: 400 });
    }

    const maxAmount = Number(payment.amountUsd || 0) - Number(payment.refundedAmountUsd || 0);
    if (typeof amountUsd === "number" && (amountUsd <= 0 || amountUsd > maxAmount)) {
      return NextResponse.json({ ok: false, error: "Invalid refund amount." }, { status: 400 });
    }

    // Resolve which Stripe account the PaymentIntent lives on.
    // Platform Checkout payments (create-intent) carry a stripeCheckoutSessionId and
    // live on the platform account. Client-portal invoice payments (pay/confirm) are
    // Connect DIRECT charges on the tenant's connected account.
    const isPlatformCharge = Boolean(String(payment.stripeCheckoutSessionId || "").trim());
    let stripeAccount: string | undefined;
    let refundApplicationFee = false;
    if (!isPlatformCharge) {
      const tenantSnap = await adminDb.collection("tenants").doc(String(payment.tenantId || "")).get();
      stripeAccount = String(tenantSnap.data()?.stripeConnectAccountId || "").trim() || undefined;
      if (!stripeAccount) {
        return NextResponse.json(
          { ok: false, error: "Connected account not found for this payment; cannot refund." },
          { status: 400 },
        );
      }
      // Return the platform fee to the tenant proportionally on refund.
      // Set this to false if the platform should RETAIN its fee on refunds.
      refundApplicationFee = true;
    }

    const stripe = getStripeClient();
    const refund = await createStripeRefund({
      stripe,
      paymentIntentId: stripePaymentIntentId,
      amountUsd,
      reason,
      stripeAccount,
      refundApplicationFee,
    });
    const refundAmountUsd = Number(refund.amount || 0) / 100;
    const now = admin.firestore.FieldValue.serverTimestamp();

    await adminDb.runTransaction(async (tx) => {
      const freshPayment = await tx.get(paymentRef);
      const current = freshPayment.data() || {};
      const nextRefunded = Number(current.refundedAmountUsd || 0) + refundAmountUsd;

      tx.set(
        paymentRef,
        {
          status: nextRefunded >= Number(current.amountUsd || 0) ? "refunded" : "succeeded",
          refundedAmountUsd: nextRefunded,
          updatedAt: now,
        },
        { merge: true }
      );

      tx.set(
        adminDb.collection("payment_refunds").doc(`refund_${refund.id}`),
        {
          id: `refund_${refund.id}`,
          tenantId: String(current.tenantId || ""),
          clientId: String(current.clientId || ""),
          invoiceId: String(current.invoiceId || ""),
          paymentId,
          stripeRefundId: refund.id,
          stripePaymentIntentId,
          amountUsd: refundAmountUsd,
          currency: String(refund.currency || "usd").toUpperCase(),
          status: String(refund.status || "pending"),
          reason: reason || "other",
          createdByUid: auth.user.uid,
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    });

    const refundNotifyTargets = await getUsersByRoles(["admin", "super_admin", "finance"], auth.user.tenantId);
    await createNotifications({
      recipients: refundNotifyTargets,
      tenantId: auth.user.tenantId,
      type: "info",
      title: "Refund issued",
      message: `A refund of USD ${refundAmountUsd} was issued.`,
      entityType: "payment",
      entityId: paymentId,
      deepLink: "/finance/payments",
    });

    return NextResponse.json({ ok: true, refundId: refund.id });
  } catch (err: any) {
    console.error("payments/refund error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Unable to process refund." }, { status: 500 });
  }
}
