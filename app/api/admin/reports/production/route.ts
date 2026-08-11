import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getReportSettings, normalizeStage, requireReportsAccess, toISO } from '../_utils';
import { normalizeTenantId } from '@/lib/tenant';
import { queryWithTenant } from '@/lib/tenant/query';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ACTIVE_STAGES = ['Draft', 'Review', 'Revisions', 'Final'];

type StageHistoryEntry = {
  from?: string;
  to?: string;
  at?: any;
};

function normalizeStageHistory(history?: StageHistoryEntry[]) {
  if (!Array.isArray(history)) return [];
  return history.map((entry) => ({
    from: entry?.from || '',
    to: entry?.to || '',
    at: toISO(entry?.at),
  }));
}

function parseDate(value: string | null, endOfDay = false) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (endOfDay) {
    parsed.setHours(23, 59, 59, 999);
  } else {
    parsed.setHours(0, 0, 0, 0);
  }
  return parsed;
}

export async function GET(req: Request) {
  try {
    const auth = await requireReportsAccess();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = normalizeTenantId(auth.user.tenantId);
    const settings = await getReportSettings(tenantId);
    const { searchParams } = new URL(req.url);
    const dateFrom = parseDate(searchParams.get('dateFrom'));
    const dateTo = parseDate(searchParams.get('dateTo'), true);
    const productionOwnerId = String(searchParams.get('productionOwnerId') || '');
    const stageFilter = String(searchParams.get('stage') || '');

    const docs = await queryWithTenant(
      adminDb.collection('projects').where('isDeleted', '==', false).limit(500),
      tenantId,
    );

    const projects = docs.map((doc) => {
      const data = doc.data() || {};
      const stage = normalizeStage(data.stage);
      const updatedAt = toISO(data.updatedAt || data.createdAt);
      const ownerId = data.productionUid || data.productionOwnerId || '';
      const ownerName = data.productionName || data.productionOwnerName || '';
      const stageHistory = normalizeStageHistory(data.stageHistory);
      return {
        id: doc.id,
        projectName: data.projectName || '',
        clientName: data.clientName || '',
        stage,
        priority: data.priority || 'Normal',
        dueDate: toISO(data.dueDate),
        updatedAt,
        createdAt: toISO(data.createdAt),
        productionOwnerId: ownerId,
        productionOwnerName: ownerName,
        stageHistory,
      };
    });

    const filtered = projects.filter((project) => {
      const updatedMs = new Date(project.updatedAt || project.createdAt || 0).getTime();
      if (dateFrom && updatedMs < dateFrom.getTime()) return false;
      if (dateTo && updatedMs > dateTo.getTime()) return false;
      if (productionOwnerId && project.productionOwnerId !== productionOwnerId) return false;
      if (stageFilter && project.stage !== stageFilter) return false;
      return true;
    });

    const workloadByProductionOwner = Array.from(
      filtered.reduce((acc, project) => {
        const key = project.productionOwnerId || 'unassigned';
        const entry = acc.get(key) || {
          productionOwnerId: key,
          productionOwnerName:
            project.productionOwnerName || (key === 'unassigned' ? 'Unassigned' : key),
          total: 0,
          overdue: 0,
        };
        entry.total += 1;
        const dueMs = project.dueDate ? new Date(project.dueDate).getTime() : null;
        if (dueMs && dueMs < Date.now()) entry.overdue += 1;
        acc.set(key, entry);
        return acc;
      }, new Map<string, { productionOwnerId: string; productionOwnerName: string; total: number; overdue: number }>()),
    ).map(([, value]) => value);

    const queueAging = ACTIVE_STAGES.map((stage) => {
      const stageItems = filtered.filter((project) => project.stage === stage);
      const avgDays =
        stageItems.reduce((sum, project) => {
          let anchor = project.updatedAt || project.createdAt;
          const historyEntry = [...project.stageHistory]
            .reverse()
            .find((entry) => entry.to === stage);
          if (historyEntry?.at) anchor = historyEntry.at;
          const anchorMs = anchor ? new Date(anchor).getTime() : null;
          if (!anchorMs) return sum;
          const diffDays = (Date.now() - anchorMs) / (1000 * 60 * 60 * 24);
          return sum + diffDays;
        }, 0) / Math.max(stageItems.length, 1);
      return { stage, avgDays: Number.isNaN(avgDays) ? 0 : Number(avgDays.toFixed(1)) };
    });

    const bottlenecks = ACTIVE_STAGES.map((stage) => {
      const stageItems = filtered.filter((project) => project.stage === stage);
      const oldest = stageItems.reduce((max, project) => {
        const anchor = project.updatedAt || project.createdAt;
        const anchorMs = anchor ? new Date(anchor).getTime() : 0;
        const diffDays = anchorMs ? (Date.now() - anchorMs) / (1000 * 60 * 60 * 24) : 0;
        return Math.max(max, diffDays);
      }, 0);
      return { stage, count: stageItems.length, oldestDays: Number(oldest.toFixed(1)) };
    }).sort((a, b) => b.count - a.count);

    const stuckProjects = filtered
      .filter((project) => ACTIVE_STAGES.includes(project.stage))
      .map((project) => {
        let anchor = project.updatedAt || project.createdAt;
        const historyEntry = [...project.stageHistory]
          .reverse()
          .find((entry) => entry.to === project.stage);
        if (historyEntry?.at) anchor = historyEntry.at;
        const anchorMs = anchor ? new Date(anchor).getTime() : null;
        const diffDays = anchorMs ? (Date.now() - anchorMs) / (1000 * 60 * 60 * 24) : 0;
        const slaDays = Number(
          (settings.stageSlaDays as Record<string, number>)?.[project.stage] || 0,
        );
        return { ...project, ageDays: Number(diffDays.toFixed(1)), slaDays };
      })
      .filter((project) => project.slaDays > 0 && project.ageDays > project.slaDays)
      .sort((a, b) => b.ageDays - a.ageDays)
      .slice(0, 50);

    return NextResponse.json({
      ok: true,
      workloadByProductionOwner,
      queueAging,
      bottlenecks,
      stuckProjects,
    });
  } catch (err: any) {
    console.error('reports/production error:', err);
    const rawMessage = String(err?.message || '');
    const isIndexError =
      rawMessage.includes('FAILED_PRECONDITION') ||
      rawMessage.toLowerCase().includes('index') ||
      rawMessage.toLowerCase().includes('indexes');
    const safeMessage = isIndexError
      ? 'Missing Firestore index.'
      : 'Unable to load production reports.';
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
