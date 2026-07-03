import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { computeHealth, getWorkflowSettings } from '../../admin/_shared';
import { getAmUser, isOwnedByAm, toISO } from '../_utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID_STAGES = ['Kickoff', 'Draft', 'Review', 'Revisions', 'Final', 'Delivered'] as const;

type ProjectDoc = {
  projectName?: string;
  clientName?: string;
  clientId?: string;
  projectType?: string;
  stage?: string;
  priority?: string;
  health?: string;
  ownerAmUid?: string | null;
  ownerAmName?: string | null;
  productionUid?: string | null;
  productionName?: string | null;
  ownerId?: string | null;
  amId?: string | null;
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

type ChangeRequestDoc = {
  projectId?: string;
  status?: string;
  isDeleted?: boolean;
};

type EventDoc = {
  title?: string;
  description?: string;
  entityType?: string;
  entityId?: string;
  createdAt?: any;
  metadata?: Record<string, any>;
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

export async function GET() {
  try {
    const me = await getAmUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const [projectsSnap, workflowSettings] = await Promise.all([
      adminDb
        .collection('projects')
        .where('tenantId', '==', me.tenantId)
        .where('isDeleted', '==', false)
        .limit(500)
        .get(),
      getWorkflowSettings(),
    ]);

    const projects = projectsSnap.docs
      .map((doc) => {
        const data = doc.data() as ProjectDoc;
        if (!isOwnedByAm(data, me.uid)) return null;
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
          clientId: data.clientId || '',
          projectType: data.projectType || '',
          stage,
          priority: data.priority || 'Normal',
          health,
          ownerAmUid: data.ownerAmUid ?? null,
          ownerAmName: data.ownerAmName ?? null,
          productionUid: data.productionUid ?? null,
          productionName: data.productionName ?? null,
          dueDate,
          updatedAt: toISO(data.updatedAt),
          createdAt: toISO(data.createdAt),
          stageHistory: normalizeStageHistory(data.stageHistory),
        };
      })
      .filter((project): project is NonNullable<typeof project> => Boolean(project));

    const projectIds = new Set(projects.map((project) => project.id));

    const openChangeRequestsSnap = await adminDb
      .collection('changeRequests')
      .where('tenantId', '==', me.tenantId)
      .where('isDeleted', '==', false)
      .limit(500)
      .get();
    const openChangeRequests = openChangeRequestsSnap.docs
      .map((doc) => doc.data() as ChangeRequestDoc)
      .filter(
        (cr) =>
          cr.projectId &&
          projectIds.has(cr.projectId) &&
          !['Completed', 'Rejected'].includes(String(cr.status || '')),
      ).length;

    const unreadNotificationsSnap = await adminDb
      .collection('notifications')
      .where('toUserId', '==', me.uid)
      .where('isRead', '==', false)
      .limit(200)
      .get();
    const unreadNotifications = unreadNotificationsSnap.size || 0;

    const eventsSnap = await adminDb
      .collection('events')
      .where('tenantId', '==', me.tenantId)
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();
    const recentActivity = eventsSnap.docs
      .map((doc) => {
        const data = doc.data() as EventDoc;
        return {
          id: doc.id,
          projectId:
            data.entityType === 'project' ? data.entityId || '' : data.metadata?.projectId || '',
          title: data.title || 'Update',
          description: data.description || '',
          createdAt: toISO(data.createdAt),
          entityType: data.entityType || null,
          entityId: data.entityId || null,
        };
      })
      .filter((item) => item.projectId && projectIds.has(item.projectId))
      .slice(0, 10)
      .map((item) => {
        const project = projects.find((p) => p.id === item.projectId);
        return {
          id: item.id,
          projectId: item.projectId,
          projectName: project?.projectName || '',
          clientName: project?.clientName || '',
          title: item.title,
          description: item.description,
          createdAt: item.createdAt,
        };
      });

    const kpis = projects.reduce(
      (acc, project) => {
        if (project.stage !== 'Delivered') acc.activeProjects += 1;
        if (project.stage === 'Review') acc.reviewProjects += 1;
        return acc;
      },
      { activeProjects: 0, reviewProjects: 0 },
    );

    const topProjects = [...projects]
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
      .slice(0, 10);

    return NextResponse.json({
      ok: true,
      kpis: {
        activeProjects: kpis.activeProjects,
        reviewProjects: kpis.reviewProjects,
        openChangeRequests,
        unreadNotifications,
      },
      topProjects,
      recentActivity,
    });
  } catch (err: any) {
    console.error('am/overview error:', err);
    const rawMessage = String(err?.message || '');
    const isIndexError =
      rawMessage.includes('FAILED_PRECONDITION') ||
      rawMessage.toLowerCase().includes('index') ||
      rawMessage.toLowerCase().includes('indexes');
    const safeMessage = isIndexError ? 'Missing Firestore index.' : 'Unable to load AM overview.';
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
