import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  canWriteSales,
  isSales,
  normalizeStage,
  requireSalesRead,
  toISO,
} from "../_utils";

export const dynamic = "force-dynamic";

function isSameDay(dateA: Date, dateB: Date) {
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
}

function getWorkingDaysRemaining(start: Date, end: Date) {
  let days = 0;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) days += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.max(days, 1);
}

export async function GET() {
  try {
    const auth = await requireSalesRead();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const role = auth.user.role || "";
    const isSalesRep = isSales(role);
    const tenantId = auth.user.tenantId || "";

    const leadsSnap = await adminDb
      .collection("leads")
      .where("tenantId", "==", tenantId)
      .where("isDeleted", "==", false)
      .limit(1000)
      .get();

    const leads = leadsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
    const scopedLeads = isSalesRep
      ? leads.filter((lead: unknown) => (lead as Record<string, unknown>).ownerId === auth.user.uid || (lead as Record<string, unknown>).createdById === auth.user.uid)
      : leads;

    const paymentsSnap = await adminDb
      .collection("paymentRequests")
      .where("tenantId", "==", tenantId)
      .where("status", "==", "paid")
      .limit(1000)
      .get();

    const paymentRequests = paymentsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const leadIds = new Set(scopedLeads.map((lead: unknown) => String((lead as Record<string, unknown>).id)));

    const scopedPayments = paymentRequests.filter((request: unknown) => {
      if (isSalesRep && (request as Record<string, unknown>).leadId) {
        return leadIds.has(String((request as Record<string, unknown>).leadId));
      }
      return true;
    });

    const closedWonPaymentsMtd = scopedPayments.filter((request: unknown) => {
      const paidAt = toISO((request as Record<string, unknown>).paidAt || (request as Record<string, unknown>).updatedAt || (request as Record<string, unknown>).createdAt);
      if (!paidAt) return false;
      const date = new Date(paidAt);
      return date >= startOfMonth;
    });

    const closedWonRevenueMtd = closedWonPaymentsMtd.reduce(
      (sum: number, request: unknown) => sum + Number((request as Record<string, unknown>).amountUsd || 0),
      0
    );

    const closedWonCount = scopedLeads.filter((lead: unknown) => String((lead as Record<string, unknown>).stage || "") === "Closed Won").length;
    const totalLeads = scopedLeads.length;
    const qualified = scopedLeads.filter((lead: unknown) => String((lead as Record<string, unknown>).stage || "") === "Qualified").length;
    const activeDeals = scopedLeads.filter((lead: unknown) => !String((lead as Record<string, unknown>).stage || "").toLowerCase().includes("closed")).length;
    const followUpsDueToday = scopedLeads.filter((lead: unknown) => {
      const nextFollowUp = toISO((lead as Record<string, unknown>).nextFollowUpAt);
      if (!nextFollowUp) return false;
      return isSameDay(new Date(nextFollowUp), now);
    }).length;
    const pipelineValue = scopedLeads
      .filter((lead: unknown) => !String((lead as Record<string, unknown>).stage || "").toLowerCase().includes("closed"))
      .reduce((sum: number, lead: unknown) => sum + Number((lead as Record<string, unknown>).expectedValueUsd || 0), 0);
    const conversionRate = totalLeads ? (closedWonCount / totalLeads) * 100 : 0;
    const aov = closedWonCount ? closedWonRevenueMtd / closedWonCount : 0;

    const stageMap = new Map<string, number>();
    scopedLeads.forEach((lead: unknown) => {
      const stage = normalizeStage((lead as Record<string, unknown>).stage || "New Lead");
      stageMap.set(stage, (stageMap.get(stage) || 0) + 1);
    });

    const dispositionMap = new Map<string, number>();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    scopedLeads.forEach((lead: unknown) => {
      const updatedAt = toISO((lead as Record<string, unknown>).updatedAt || (lead as Record<string, unknown>).createdAt);
      if (!updatedAt) return;
      const updated = new Date(updatedAt);
      if (updated < thirtyDaysAgo) return;
      const disposition = String((lead as Record<string, unknown>).disposition || "Unspecified");
      dispositionMap.set(disposition, (dispositionMap.get(disposition) || 0) + 1);
    });

    const revenueByDay = new Map<string, number>();
    closedWonPaymentsMtd.forEach((request: unknown) => {
      const paidAt = toISO((request as Record<string, unknown>).paidAt || (request as Record<string, unknown>).updatedAt || (request as Record<string, unknown>).createdAt);
      if (!paidAt) return;
      const day = paidAt.slice(0, 10);
      revenueByDay.set(day, (revenueByDay.get(day) || 0) + Number((request as Record<string, unknown>).amountUsd || 0));
    });

    const leadMap = new Map<string, unknown>();
    leads.forEach((lead: unknown) => leadMap.set(String((lead as Record<string, unknown>).id), lead));
    const revenueByOwner = new Map<string, number>();
    closedWonPaymentsMtd.forEach((request: unknown) => {
      const lead = leadMap.get(String((request as Record<string, unknown>).leadId || ""));
      const ownerId = String((lead as Record<string, unknown>)?.ownerId || "");
      if (!ownerId) return;
      revenueByOwner.set(ownerId, (revenueByOwner.get(ownerId) || 0) + Number((request as Record<string, unknown>).amountUsd || 0));
    });
    const topPerformerRevenueMtd = Math.max(0, ...Array.from(revenueByOwner.values()));
    const myRevenueMtd = revenueByOwner.get(auth.user.uid) || 0;

    const targetUsdMonthly = Number(
      auth.user.targetUsdMonthly || auth.user.monthlyTargetUsd || auth.user.monthlyTarget || 0
    );
    const monthToDateRevenueUsd = closedWonRevenueMtd;
    const remainingTargetUsd = Math.max(targetUsdMonthly - monthToDateRevenueUsd, 0);
    const remainingWorkingDays = getWorkingDaysRemaining(now, new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const requiredPerDayUsd = remainingTargetUsd / remainingWorkingDays;

    return NextResponse.json({
      ok: true,
      canCreate: canWriteSales(role),
      kpis: {
        totalLeads,
        qualified,
        activeDeals,
        closedWonCount,
        closedWonRevenueMtd,
        followUpsDueToday,
        conversionRate,
        aov,
        pipelineValue,
      },
      charts: {
        leadsByStage: Array.from(stageMap.entries()).map(([stage, count]) => ({ stage, count })),
        leadsByDisposition: Array.from(dispositionMap.entries()).map(([disposition, count]) => ({ disposition, count })),
        closedWonRevenueByDay: Array.from(revenueByDay.entries()).map(([day, value]) => ({ day, value })),
      },
      targets: {
        targetUsdMonthly,
        monthToDateRevenueUsd,
        remainingTargetUsd,
        requiredPerDayUsd,
      },
      teamBenchmark: {
        topPerformerRevenueMtd,
        myRevenueMtd,
      },
    });
  } catch (err) {
    console.error("sales overview error:", err);
    const rawMessage = String((err instanceof Error ? err.message : undefined) || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load overview.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
