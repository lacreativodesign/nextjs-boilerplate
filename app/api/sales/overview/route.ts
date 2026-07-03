import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { canWriteSales, isSales, normalizeStage, requireSalesRead, toISO } from '../_utils';

export const dynamic = 'force-dynamic';

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

    const role = auth.user.role || '';
    const isSalesRep = isSales(role);
    const tenantId = auth.user.tenantId || '';

    const leadsSnap = await adminDb
      .collection('leads')
      .where('tenantId', '==', tenantId)
      .where('isDeleted', '==', false)
      .limit(1000)
      .get();

    const leads = leadsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
    const scopedLeads = isSalesRep
      ? leads.filter(
          (lead: any) => lead.ownerId === auth.user.uid || lead.createdById === auth.user.uid,
        )
      : leads;

    const paymentsSnap = await adminDb
      .collection('paymentRequests')
      .where('tenantId', '==', tenantId)
      .where('status', '==', 'paid')
      .limit(1000)
      .get();

    const paymentRequests = paymentsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const leadIds = new Set(scopedLeads.map((lead: any) => String(lead.id)));

    const scopedPayments = paymentRequests.filter((request: any) => {
      if (isSalesRep && request.leadId) {
        return leadIds.has(String(request.leadId));
      }
      return true;
    });

    const closedWonPaymentsMtd = scopedPayments.filter((request: any) => {
      const paidAt = toISO(request.paidAt || request.updatedAt || request.createdAt);
      if (!paidAt) return false;
      const date = new Date(paidAt);
      return date >= startOfMonth;
    });

    const closedWonRevenueMtd = closedWonPaymentsMtd.reduce(
      (sum: number, request: any) => sum + Number(request.amountUsd || 0),
      0,
    );

    const closedWonCount = scopedLeads.filter(
      (lead: any) => String(lead.stage || '') === 'Closed Won',
    ).length;
    const totalLeads = scopedLeads.length;
    const qualified = scopedLeads.filter(
      (lead: any) => String(lead.stage || '') === 'Qualified',
    ).length;
    const activeDeals = scopedLeads.filter(
      (lead: any) =>
        !String(lead.stage || '')
          .toLowerCase()
          .includes('closed'),
    ).length;
    const followUpsDueToday = scopedLeads.filter((lead: any) => {
      const nextFollowUp = toISO(lead.nextFollowUpAt);
      if (!nextFollowUp) return false;
      return isSameDay(new Date(nextFollowUp), now);
    }).length;
    const pipelineValue = scopedLeads
      .filter(
        (lead: any) =>
          !String(lead.stage || '')
            .toLowerCase()
            .includes('closed'),
      )
      .reduce((sum: number, lead: any) => sum + Number(lead.expectedValueUsd || 0), 0);
    const conversionRate = totalLeads ? (closedWonCount / totalLeads) * 100 : 0;
    const aov = closedWonCount ? closedWonRevenueMtd / closedWonCount : 0;

    const stageMap = new Map<string, number>();
    scopedLeads.forEach((lead: any) => {
      const stage = normalizeStage(lead.stage || 'New Lead');
      stageMap.set(stage, (stageMap.get(stage) || 0) + 1);
    });

    const dispositionMap = new Map<string, number>();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    scopedLeads.forEach((lead: any) => {
      const updatedAt = toISO(lead.updatedAt || lead.createdAt);
      if (!updatedAt) return;
      const updated = new Date(updatedAt);
      if (updated < thirtyDaysAgo) return;
      const disposition = String(lead.disposition || 'Unspecified');
      dispositionMap.set(disposition, (dispositionMap.get(disposition) || 0) + 1);
    });

    const revenueByDay = new Map<string, number>();
    closedWonPaymentsMtd.forEach((request: any) => {
      const paidAt = toISO(request.paidAt || request.updatedAt || request.createdAt);
      if (!paidAt) return;
      const day = paidAt.slice(0, 10);
      revenueByDay.set(day, (revenueByDay.get(day) || 0) + Number(request.amountUsd || 0));
    });

    const leadMap = new Map<string, any>();
    leads.forEach((lead: any) => leadMap.set(String(lead.id), lead));
    const revenueByOwner = new Map<string, number>();
    closedWonPaymentsMtd.forEach((request: any) => {
      const lead = leadMap.get(String(request.leadId || ''));
      const ownerId = String(lead?.ownerId || '');
      if (!ownerId) return;
      revenueByOwner.set(
        ownerId,
        (revenueByOwner.get(ownerId) || 0) + Number(request.amountUsd || 0),
      );
    });
    const topPerformerRevenueMtd = Math.max(0, ...Array.from(revenueByOwner.values()));
    const myRevenueMtd = revenueByOwner.get(auth.user.uid) || 0;

    const targetUsdMonthly = Number(
      auth.user.targetUsdMonthly || auth.user.monthlyTargetUsd || auth.user.monthlyTarget || 0,
    );
    const monthToDateRevenueUsd = closedWonRevenueMtd;
    const remainingTargetUsd = Math.max(targetUsdMonthly - monthToDateRevenueUsd, 0);
    const remainingWorkingDays = getWorkingDaysRemaining(
      now,
      new Date(now.getFullYear(), now.getMonth() + 1, 0),
    );
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
        leadsByDisposition: Array.from(dispositionMap.entries()).map(([disposition, count]) => ({
          disposition,
          count,
        })),
        closedWonRevenueByDay: Array.from(revenueByDay.entries()).map(([day, value]) => ({
          day,
          value,
        })),
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
  } catch (err: any) {
    console.error('sales overview error:', err);
    const rawMessage = String(err?.message || '');
    const isIndexError =
      rawMessage.includes('FAILED_PRECONDITION') ||
      rawMessage.toLowerCase().includes('index') ||
      rawMessage.toLowerCase().includes('indexes');
    const safeMessage = isIndexError ? 'Missing Firestore index.' : 'Unable to load overview.';
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
