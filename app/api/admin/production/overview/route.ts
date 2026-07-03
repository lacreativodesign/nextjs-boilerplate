import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser, isAdminOrSuper } from '../../_utils';
import { computeHealth, getWorkflowSettings } from '../../settings/_utils';
import { normalizeTenantId } from '@/lib/tenant';
import { queryWithTenant } from '@/lib/tenant/query';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ACTIVE_STAGES = ['Draft', 'Review', 'Revisions', 'Final'] as const;

const VALID_STAGES = ['Kickoff', 'Draft', 'Review', 'Revisions', 'Final', 'Delivered'] as const;

type ProjectDoc = {
  projectName?: string;
  clientName?: string;
  projectType?: string;
  stage?: string;
  priority?: string;
  health?: string;
  ownerAmUid?: string | null;
  ownerAmName?: string | null;
  productionUid?: string | null;
  productionName?: string | null;
  productionOwnerId?: string | null;
  productionOwnerName?: string | null;
  dueDate?: any;
  updatedAt?: any;
  createdAt?: any;
  stageHistory?: Array<{
    from?: string;
    to?: string;
    byUid?: string;
    byName?: string;
    at?: any;
    reason?: string;
  }>;
  isDeleted?: boolean;
};

function toISO(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function normalizeStage(stage?: string) {
  return VALID_STAGES.includes((stage || '') as (typeof VALID_STAGES)[number])
    ? (stage as string)
    : 'Kickoff';
}

function normalizeStageHistory(history?: ProjectDoc['stageHistory']) {
  if (!Array.isArray(history)) return [];
  return history.map((entry) => ({
    from: entry?.from || '',
    to: entry?.to || '',
    byUid: entry?.byUid || '',
    byName: entry?.byName || '',
    at: toISO(entry?.at),
    reason: entry?.reason || null,
  }));
}

function getDeliveredWithin(project: { updatedAt?: string | null; createdAt?: string | null }) {
  const date = project.updatedAt || project.createdAt;
  if (!date) return false;
  const updated = new Date(date);
  if (Number.isNaN(updated.getTime())) return false;
  const now = new Date();
  const diffMs = now.getTime() - updated.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= 7;
}

export async function GET() {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAdminOrSuper(me.role)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const tenantId = normalizeTenantId(me.tenantId);
    const [docs, workflowSettings] = await Promise.all([
      queryWithTenant(
        adminDb.collection('projects').where('isDeleted', '==', false).limit(500),
        tenantId,
      ),
      getWorkflowSettings(),
    ]);

    const projects = docs.map((doc) => {
      const data = doc.data() as ProjectDoc;
      const stage = normalizeStage(data.stage);
      const dueDate = toISO(data.dueDate);
      const health = computeHealth(
        dueDate,
        workflowSettings.atRiskAfterDays,
        workflowSettings.overdueAfterDays,
      );
      return {
        id: doc.id,
        projectName: data.projectName || '',
        clientName: data.clientName || '',
        projectType: data.projectType || '',
        stage,
        priority: data.priority || 'Normal',
        health,
        ownerAmUid: data.ownerAmUid ?? null,
        ownerAmName: data.ownerAmName ?? null,
        productionUid: data.productionUid ?? data.productionOwnerId ?? null,
        productionName: data.productionName ?? data.productionOwnerName ?? null,
        dueDate,
        updatedAt: toISO(data.updatedAt),
        createdAt: toISO(data.createdAt),
        stageHistory: normalizeStageHistory(data.stageHistory),
      };
    });

    const kpis = projects.reduce(
      (acc, project) => {
        if (ACTIVE_STAGES.includes(project.stage as (typeof ACTIVE_STAGES)[number])) {
          acc.assigned += 1;
        }
        if (project.stage === 'Draft') acc.draft += 1;
        if (project.stage === 'Review') acc.review += 1;
        if (project.stage === 'Revisions') acc.revisions += 1;
        if (project.stage === 'Final') acc.final += 1;
        if (project.health === 'At Risk') acc.atRisk += 1;
        if (project.health === 'Overdue') acc.overdue += 1;
        if (project.stage === 'Delivered' && getDeliveredWithin(project)) acc.delivered7 += 1;
        return acc;
      },
      {
        assigned: 0,
        draft: 0,
        review: 0,
        revisions: 0,
        final: 0,
        atRisk: 0,
        overdue: 0,
        delivered7: 0,
      },
    );

    const myQueue = projects
      .filter(
        (project) =>
          ACTIVE_STAGES.includes(project.stage as (typeof ACTIVE_STAGES)[number]) &&
          project.productionUid === me.uid,
      )
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
      .slice(0, 10);

    return NextResponse.json({ ok: true, projects, kpis, myQueue });
  } catch (err: any) {
    console.error('production/overview error:', err);
    const rawMessage = String(err?.message || '');
    const isIndexError =
      rawMessage.includes('FAILED_PRECONDITION') ||
      rawMessage.toLowerCase().includes('index') ||
      rawMessage.toLowerCase().includes('indexes');
    const safeMessage = isIndexError
      ? 'Missing Firestore index.'
      : 'Unable to load production overview.';
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
