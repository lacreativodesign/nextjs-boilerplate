import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { adminDb } from "@/lib/firebaseAdmin";
import { getStripeClient } from "@/lib/payments/stripe";
import { calculatePlatformFee } from "@/lib/stripe/connect";
import { requireAdminOrSuperAdmin } from "@/app/api/admin/_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TerminalTransaction = {
  id: string;
  amount: number;
  amountRefunded: number;
  currency: string;
  status: string;
  platformFee: number;
  netAmount: number;
  description: string | null;
  customerEmail: string | null;
  invoiceId: string | null;
  clientId: string | null;
  createdAt: string;
  receiptUrl: string | null;
  refunded: boolean;
};

export async function GET() {
  try {
    const auth = await requireAdminOrSuperAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = String(auth.user.tenantId || "").trim();
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "Tenant context missing" }, { status: 400 });
    }

    const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
    const tenantData = tenantSnap.data() || {};
    const stripeConnectAccountId = String(tenantData.stripeConnectAccountId || "").trim();

    if (!stripeConnectAccountId) {
      return NextResponse.json({ ok: true, connected: false, message: "No Stripe account connected" });
    }

    const stripe = getStripeClient();
    const [chargesResult, balanceResult, payoutsResult, disputesResult] = await Promise.allSettled([
      stripe.charges.list({ limit: 100 }, { stripeAccount: stripeConnectAccountId }),
      stripe.balance.retrieve({}, { stripeAccount: stripeConnectAccountId }),
      stripe.payouts.list({ limit: 20 }, { stripeAccount: stripeConnectAccountId }),
      stripe.disputes.list({ limit: 20 }, { stripeAccount: stripeConnectAccountId }),
    ]);

    const charges: Stripe.Charge[] = chargesResult.status === "fulfilled" ? chargesResult.value.data : [];
    const balance = balanceResult.status === "fulfilled" ? balanceResult.value : { available: [], pending: [] };
    const payouts: Stripe.Payout[] = payoutsResult.status === "fulfilled" ? payoutsResult.value.data : [];
    const disputes: Stripe.Dispute[] = disputesResult.status === "fulfilled" ? disputesResult.value.data : [];

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let totalRevenueCents = 0;
    let totalFeesCents = 0;
    let totalRefundedCents = 0;
    let thisMonthRevenueCents = 0;
    let thisMonthFeesCents = 0;
    let transactionCount = 0;
    let failedCount = 0;

    for (const charge of charges) {
      totalRefundedCents += charge.amount_refunded || 0;

      const isSucceeded = charge.status === "succeeded";
      if (isSucceeded) {
        const feeCents = calculatePlatformFee(charge.amount);
        totalRevenueCents += charge.amount;
        totalFeesCents += feeCents;
        transactionCount += 1;

        const createdAt = new Date(charge.created * 1000);
        if (createdAt >= startOfMonth) {
          thisMonthRevenueCents += charge.amount;
          thisMonthFeesCents += feeCents;
        }
      }

      if (charge.status === "failed") {
        failedCount += 1;
      }
    }

    const transactions: TerminalTransaction[] = charges
      .map((charge) => {
        const platformFee = calculatePlatformFee(charge.amount);
        return {
          id: charge.id,
          amount: charge.amount / 100,
          amountRefunded: (charge.amount_refunded || 0) / 100,
          currency: charge.currency,
          status: charge.status,
          platformFee: platformFee / 100,
          netAmount: (charge.amount - platformFee) / 100,
          description: charge.description || null,
          customerEmail: charge.billing_details?.email || null,
          invoiceId: charge.metadata?.invoiceId || null,
          clientId: charge.metadata?.clientId || null,
          createdAt: new Date(charge.created * 1000).toISOString(),
          receiptUrl: charge.receipt_url || null,
          refunded: Boolean(charge.refunded),
        };
      })
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

    const payoutData = payouts.map((payout) => ({
      id: payout.id,
      amount: payout.amount / 100,
      currency: payout.currency,
      status: payout.status,
      arrivalDate: new Date(payout.arrival_date * 1000).toISOString(),
      description: payout.description || null,
      createdAt: new Date(payout.created * 1000).toISOString(),
    }));

    const disputeData = disputes.map((dispute) => ({
      id: dispute.id,
      amount: dispute.amount / 100,
      currency: dispute.currency,
      status: dispute.status,
      reason: dispute.reason,
      chargeId: String(dispute.charge || ""),
      createdAt: new Date(dispute.created * 1000).toISOString(),
      dueBy: dispute.evidence_details?.due_by
        ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
        : null,
    }));

    return NextResponse.json({
      ok: true,
      connected: true,
      metrics: {
        totalRevenue: totalRevenueCents / 100,
        totalFees: totalFeesCents / 100,
        netRevenue: (totalRevenueCents - totalFeesCents) / 100,
        totalRefunded: totalRefundedCents / 100,
        thisMonthRevenue: thisMonthRevenueCents / 100,
        thisMonthFees: thisMonthFeesCents / 100,
        transactionCount,
        failedCount,
      },
      balance: {
        available: (balance.available || []).map((item) => ({ amount: item.amount / 100, currency: item.currency })),
        pending: (balance.pending || []).map((item) => ({ amount: item.amount / 100, currency: item.currency })),
      },
      transactions,
      payouts: payoutData,
      disputes: disputeData,
      connectStatus: {
        businessName: tenantData.stripeConnectBusinessName || null,
        email: tenantData.stripeConnectEmail || null,
        chargesEnabled: Boolean(tenantData.stripeConnectChargesEnabled),
        payoutsEnabled: Boolean(tenantData.stripeConnectPayoutsEnabled),
      },
      fetchStatus: {
        charges: chargesResult.status,
        balance: balanceResult.status,
        payouts: payoutsResult.status,
        disputes: disputesResult.status,
      },
      fetchedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to fetch payment terminal data";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
