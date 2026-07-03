import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { computeHealth, getWorkflowSettings } from '../../admin/_shared';
import { getProductionUser, isAssignedToProduction, toISO } from '../_utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID_STAGES = ['Kickoff', 'Draft', 'Review', 'Revisions', 'Final', 'Delivered'] as const;

type ProjectDoc = {
  projectName?: string;
  clientName?: string;
  projectType?: string;
  stage?: string;
  priority?: string;
  ownerAmUid?: string | null;
  ownerAmName?: string | null;
  productionUid?: string | null;
  productionName?: string | null;
  productionOwnerId?: string | null;
  productionOwnerName?: string | null;
  assignedProductionIds?: string[];
  dueDate?: any;
  productionOverrideStatus?: string | null;
  productionOverrideApprovalId?: string | null;
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

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export async function GET(req: Request) {
  try {
    const me = await getProductionUser();
    if (!me) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const q = String(searchParams.get('q') || '')
      .trim()
      .toLowerCase();
    const stage = String(searchParams.get('stage') || '').trim();
    const priority = String(searchParams.get('priority') || '').trim();
    const health = String(searchParams.get('health') || '').trim();
    const dueFrom = parseDate(searchParams.get('dueFrom'));
    const dueTo = parseDate(searchParams.get('dueTo'));
    const sortKey = String(searchParams.get('sort') || 'updatedAt');
    const sortDir = String(searchParams.get('dir') || 'desc');

    const [snap, workflowSettings] = await Promise.all([
      adminDb
        .collection('projects')
        .where('tenantId', '==', me.tenantId)
        .where('isDeleted', '==', false)
        .limit(500)
        .get(),
      getWorkflowSettings(),
    ]);

    let projects = snap.docs
      .map((doc) => {
        const data = doc.data() as ProjectDoc;
        const assigned = isAssignedToProduction(
          {
            productionUid: data.productionUid ?? null,
            productionOwnerId: data.productionOwnerId ?? null,
            assignedProductionIds: data.assignedProductionIds ?? null,
          },
          me.uid,
        );
        if (!assigned) return null;
        const stageValue = normalizeStage(data.stage);
        const dueDate = toISO(data.dueDate);
        const computedHealth = computeHealth(
          dueDate,
          workflowSettings.atRiskAfterDays,
          workflowSettings.overdueAfterDays,
        );
        return {
          id: doc.id,
          projectName: data.projectName || '',
          clientName: data.clientName || '',
          projectType: data.projectType || '',
          stage: stageValue,
          priority: data.priority || 'Normal',
          health: computedHealth,
          ownerAmUid: data.ownerAmUid ?? null,
          ownerAmName: data.ownerAmName ?? null,
          productionUid: data.productionUid ?? data.productionOwnerId ?? null,
          productionName: data.productionName ?? data.productionOwnerName ?? null,
          productionOverrideStatus: data.productionOverrideStatus ?? null,
          productionOverrideApprovalId: data.productionOverrideApprovalId ?? null,
          dueDate,
          updatedAt: toISO(data.updatedAt),
          createdAt: toISO(data.createdAt),
          stageHistory: normalizeStageHistory(data.stageHistory),
        };
      })
      .filter((project): project is NonNullable<typeof project> => Boolean(project));

    if (stage) {
      projects = projects.filter((project) => project.stage === stage);
    }

    if (priority) {
      projects = projects.filter((project) => project.priority === priority);
    }

    if (health) {
      projects = projects.filter((project) => project.health === health);
    }

    if (dueFrom) {
      projects = projects.filter((project) => {
        if (!project.dueDate) return false;
        const due = new Date(project.dueDate);
        return !Number.isNaN(due.getTime()) && due >= dueFrom;
      });
    }

    if (dueTo) {
      projects = projects.filter((project) => {
        if (!project.dueDate) return false;
        const due = new Date(project.dueDate);
        return !Number.isNaN(due.getTime()) && due <= dueTo;
      });
    }

    if (q) {
      projects = projects.filter((project) => {
        const hay = [project.projectName, project.clientName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }

    projects.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const read = (project: (typeof projects)[number]) => {
        switch (sortKey) {
          case 'projectName':
            return project.projectName || '';
          case 'clientName':
            return project.clientName || '';
          case 'stage':
            return project.stage || '';
          case 'priority':
            return project.priority || '';
          case 'health':
            return project.health || '';
          case 'dueDate':
            return project.dueDate || '';
          case 'updatedAt':
            return project.updatedAt || '';
          default:
            return project.updatedAt || '';
        }
      };
      return String(read(a)).localeCompare(String(read(b))) * dir;
    });

    return NextResponse.json({ ok: true, projects });
  } catch (err: any) {
    console.error('production/queue error:', err);
    const rawMessage = String(err?.message || '');
    const isIndexError =
      rawMessage.includes('FAILED_PRECONDITION') ||
      rawMessage.toLowerCase().includes('index') ||
      rawMessage.toLowerCase().includes('indexes');
    const safeMessage = isIndexError
      ? 'Missing Firestore index.'
      : 'Unable to load production queue.';
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
