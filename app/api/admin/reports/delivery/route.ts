import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  computeHealth,
  getReportSettings,
  normalizeStage,
  requireReportsAccess,
  toISO,
} from '../_utils';
import { normalizeTenantId } from '@/lib/tenant';
import { queryWithTenant } from '@/lib/tenant/query';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PIPELINE_STAGES = [
  'Deposit',
  'Kickoff',
  'Draft',
  'Review',
  'Revisions',
  'Final',
  'Delivered',
];

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
    const settings = await getReportSettings();
    const { searchParams } = new URL(req.url);
    const dateFrom = parseDate(searchParams.get('dateFrom'));
    const dateTo = parseDate(searchParams.get('dateTo'), true);
    const stageFilter = String(searchParams.get('stage') || '');
    const ownerId = String(searchParams.get('ownerId') || '');
    const productionOwnerId = String(searchParams.get('productionOwnerId') || '');
    const healthFilter = String(searchParams.get('health') || '');
    const priorityFilter = String(searchParams.get('priority') || '');

    const docs = await queryWithTenant(
      adminDb.collection('projects').where('isDeleted', '==', false).limit(500),
      tenantId,
    );

    const projects = docs.map((doc) => {
      const data = doc.data() || {};
      const dueDate = toISO(data.dueDate);
      const updatedAt = toISO(data.updatedAt || data.createdAt);
      const stage = normalizeStage(data.stage);
      const health =
        data.health || computeHealth(dueDate, settings.atRiskAfterDays, settings.overdueAfterDays);
      const stageHistory = normalizeStageHistory(data.stageHistory);
      const owner = data.ownerAmUid || data.ownerId || data.ownerUid || '';
      const ownerName = data.ownerAmName || data.ownerName || '';
      const productionOwner = data.productionUid || data.productionOwnerId || '';
      const productionName = data.productionName || data.productionOwnerName || '';
      return {
        id: doc.id,
        projectName: data.projectName || '',
        clientName: data.clientName || '',
        stage,
        priority: data.priority || 'Normal',
        health,
        ownerId: owner,
        ownerName,
        productionOwnerId: productionOwner,
        productionOwnerName: productionName,
        dueDate,
        updatedAt,
        createdAt: toISO(data.createdAt),
        stageHistory,
      };
    });

    const filtered = projects.filter((project) => {
      const updatedMs = new Date(project.updatedAt || project.createdAt || 0).getTime();
      if (dateFrom && updatedMs < dateFrom.getTime()) return false;
      if (dateTo && updatedMs > dateTo.getTime()) return false;
      if (stageFilter && project.stage !== stageFilter) return false;
      if (ownerId && project.ownerId !== ownerId) return false;
      if (productionOwnerId && project.productionOwnerId !== productionOwnerId) return false;
      if (healthFilter && project.health !== healthFilter) return false;
      if (priorityFilter && project.priority !== priorityFilter) return false;
      return true;
    });

    const projectsByStage = PIPELINE_STAGES.map((stage) => ({
      stage,
      count: filtered.filter((project) => project.stage === stage).length,
    }));

    const averageStageTime = PIPELINE_STAGES.map((stage) => {
      const items = filtered.filter((project) => project.stage === stage);
      const avgDays =
        items.reduce((sum, project) => {
          let anchor = project.createdAt;
          const historyEntry = [...project.stageHistory]
            .reverse()
            .find((entry) => entry.to === stage);
          if (historyEntry?.at) anchor = historyEntry.at;
          const anchorMs = anchor ? new Date(anchor).getTime() : null;
          if (!anchorMs || Number.isNaN(anchorMs)) return sum;
          const diffDays = (Date.now() - anchorMs) / (1000 * 60 * 60 * 24);
          return sum + diffDays;
        }, 0) / Math.max(items.length, 1);
      return { stage, avgDays: Number.isNaN(avgDays) ? 0 : Number(avgDays.toFixed(1)) };
    });

    const onTimeVsOverdue = filtered.reduce(
      (acc, project) => {
        const dueMs = project.dueDate ? new Date(project.dueDate).getTime() : null;
        if (!dueMs) {
          acc.onTime += 1;
        } else if (dueMs < Date.now()) {
          acc.overdue += 1;
        } else {
          acc.onTime += 1;
        }
        return acc;
      },
      { onTime: 0, overdue: 0 },
    );

    const eventDocs = await queryWithTenant(
      adminDb.collection('events').where('isDeleted', '==', false).limit(500),
      tenantId,
    );
    const safeEvents =
      eventDocs.length > 0
        ? eventDocs
        : await queryWithTenant(adminDb.collection('events').limit(500), tenantId);
    const qaEvents = safeEvents
      .map((doc) => doc.data() || {})
      .filter((event) =>
        ['project.qa_approved', 'project.qa_rejected'].includes(String(event.type || '')),
      );

    const qaPassFail =
      qaEvents.length > 0
        ? qaEvents.reduce(
            (acc, event) => {
              const type = String(event.type || '');
              if (type === 'project.qa_approved') acc.pass += 1;
              if (type === 'project.qa_rejected') acc.fail += 1;
              return acc;
            },
            { pass: 0, fail: 0, queue: 0 },
          )
        : {
            pass: 0,
            fail: 0,
            queue: filtered.filter((project) => project.stage === 'Final').length,
          };

    const riskProjects = filtered
      .filter((project) => ['At Risk', 'Overdue'].includes(project.health))
      .map((project) => {
        const dueMs = project.dueDate ? new Date(project.dueDate).getTime() : null;
        const daysLate = dueMs ? Math.ceil((Date.now() - dueMs) / (1000 * 60 * 60 * 24)) : 0;
        return { ...project, daysLate: Math.max(daysLate, 0) };
      })
      .sort((a, b) => b.daysLate - a.daysLate)
      .slice(0, 50);

    return NextResponse.json({
      ok: true,
      projectsByStage,
      averageStageTime,
      onTimeVsOverdue,
      qaPassFail,
      atRiskProjects: riskProjects,
    });
  } catch (err: any) {
    console.error('reports/delivery error:', err);
    const rawMessage = String(err?.message || '');
    const isIndexError =
      rawMessage.includes('FAILED_PRECONDITION') ||
      rawMessage.toLowerCase().includes('index') ||
      rawMessage.toLowerCase().includes('indexes');
    const safeMessage = isIndexError
      ? 'Missing Firestore index.'
      : 'Unable to load delivery reports.';
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
