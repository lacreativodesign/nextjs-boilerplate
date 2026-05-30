import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { adminDb } from "@/lib/firebaseAdmin";
import { getStripeClient } from "@/lib/payments/stripe";
import { calculatePlatformFee } from "@/lib/stripe/connect";
import { requireAdminOrSuperAdmin } from "@/app/api/admin/_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SummaryPeriod = "7d" | "30d" | "90d" | "12m";

const PERIODS: SummaryPeriod[] = ["7d", "30d", "90d", "12m"];

function resolveStartDate(period: SummaryPeriod): Date {
  const now = new Date();
  if (period === "7d") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  }
  if (period === "30d") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
  }
  if (period === "90d") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89);
  }
  return new Date(now.getFullYear(), now.getMonth() - 11, 1);
}

function formatGroupKey(date: Date, period: SummaryPeriod): string {
  if (period === "7d" || period === "30d") {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function buildBuckets(period: SummaryPeriod, startDate: Date): string[] {
  const points: string[] = [];
  const cursor = new Date(startDate);
  const now = new Date();

  if (period === "7d" || period === "30d") {
    while (cursor <= now) {
      points.push(formatGroupKey(cursor, period));
      cursor.setDate(cursor.getDate() + 1);
    }
    return points;
  }

  cursor.setDate(1);
  while (cursor <= now) {
    points.push(formatGroupKey(cursor, period));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return points;
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdminOrSuperAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = String(auth.user.tenantId || "").trim();
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "Tenant context missing" }, { status: 400 });
    }

    const searchParams = new URL(request.url).searchParams;
    const rawPeriod = searchParams.get("period");
    const period: SummaryPeriod = PERIODS.includes(rawPeriod as SummaryPeriod)
      ? (rawPeriod as SummaryPeriod)
      : "30d";

    const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
    const tenantData = tenantSnap.data() || {};
    const stripeConnectAccountId = String(tenantData.stripeConnectAccountId || "").trim();

    if (!stripeConnectAccountId) {
      return NextResponse.json({
        ok: true,
        period,
        chartData: [],
        totals: { revenue: 0, fees: 0, netRevenue: 0, transactionCount: 0 },
      });
    }

    const startDate = resolveStartDate(period);
    const startTimestamp = Math.floor(startDate.getTime() / 1000);

    const stripe = getStripeClient();
    const chargesResponse = await stripe.charges.list(
      { limit: 200, created: { gte: startTimestamp } },
      { stripeAccount: stripeConnectAccountId },
    );

    const grouped = new Map<string, { revenueCents: number; feesCents: number; count: number }>();
    for (const bucket of buildBuckets(period, startDate)) {
      grouped.set(bucket, { revenueCents: 0, feesCents: 0, count: 0 });
    }

    for (const charge of chargesResponse.data as Stripe.Charge[]) {
      if (charge.status !== "succeeded") {
        continue;
      }

      const chargeDate = new Date(charge.created * 1000);
      const key = formatGroupKey(chargeDate, period);
      const existing = grouped.get(key) || { revenueCents: 0, feesCents: 0, count: 0 };
      existing.revenueCents += charge.amount;
      existing.feesCents += calculatePlatformFee(charge.amount);
      existing.count += 1;
      grouped.set(key, existing);
    }

    const chartData = Array.from(grouped.entries()).map(([date, value]) => ({
      date,
      revenue: value.revenueCents / 100,
      fees: value.feesCents / 100,
      count: value.count,
    }));

    const totals = chartData.reduce(
      (acc, point) => {
        acc.revenue += point.revenue;
        acc.fees += point.fees;
        acc.transactionCount += point.count;
        return acc;
      },
      { revenue: 0, fees: 0, netRevenue: 0, transactionCount: 0 },
    );
    totals.netRevenue = totals.revenue - totals.fees;

    return NextResponse.json({
      ok: true,
      period,
      chartData,
      totals,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to fetch revenue summary";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
