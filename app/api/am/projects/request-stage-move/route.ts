import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  createNotification,
  createNotificationEvent,
  getUserIdsByRoles,
} from '@/lib/notifications';
import { getAmUser, isOwnedByAm } from '../../_utils';

export const runtime = 'nodejs';

const VALID_STAGES = ['Kickoff', 'Draft', 'Review', 'Revisions', 'Final', 'Delivered'] as const;

type ProjectDoc = {
  projectName?: string;
  clientName?: string;
  ownerAmUid?: string | null;
  productionUid?: string | null;
  productionName?: string | null;
  ownerId?: string | null;
  amId?: string | null;
  isDeleted?: boolean;
};

function cleanString(value: any) {
  return String(value || '').trim();
}

export async function POST(req: Request) {
  try {
    const me = await getAmUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const projectId = cleanString(body?.projectId);
    const requestedStage = cleanString(body?.requestedStage);
    const note = cleanString(body?.note);

    if (!projectId || !requestedStage) {
      return NextResponse.json(
        { ok: false, error: 'Missing stage request data.' },
        { status: 400 },
      );
    }

    if (!VALID_STAGES.includes(requestedStage as (typeof VALID_STAGES)[number])) {
      return NextResponse.json({ ok: false, error: 'Invalid stage.' }, { status: 400 });
    }

    const projectSnap = await adminDb.collection('projects').doc(projectId).get();
    if (!projectSnap.exists || projectSnap.data()?.isDeleted) {
      return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
    }

    const project = projectSnap.data() as ProjectDoc;
    if (String((project as any).tenantId || '') !== me.tenantId) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }
    if (!isOwnedByAm(project, me.uid)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const actorName = me.name || me.fullName || me.displayName || '';
    await createNotificationEvent({
      type: 'project.stage.requested',
      title: 'Stage move requested',
      description: `${project.projectName || 'Project'} requested move to ${requestedStage}.`,
      entityType: 'project',
      entityId: projectId,
      createdByUid: me.uid,
      createdByName: actorName,
      metadata: {
        requestedStage,
        note,
      },
    });

    const adminIds = await getUserIdsByRoles(['admin', 'super_admin'], me.tenantId);
    const productionIds = await getUserIdsByRoles(['production'], me.tenantId);
    const recipients = new Set<string>();
    if (project.productionUid) recipients.add(String(project.productionUid));
    adminIds.forEach((id) => recipients.add(id));
    productionIds.forEach((id) => recipients.add(id));

    await Promise.all(
      Array.from(recipients)
        .filter(Boolean)
        .map((uid) =>
          createNotification({
            toUserId: uid,
            title: 'Stage move requested',
            body: `${project.projectName || 'Project'} requested move to ${requestedStage}.`,
            type: 'warning',
            entityType: 'project',
            entityId: projectId,
            deepLink: '/admin/projects',
            createdBy: { uid: me.uid, name: actorName },
          }),
        ),
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('am/request-stage-move error:', err);
    return NextResponse.json(
      { ok: false, error: 'Unable to request stage move right now.' },
      { status: 500 },
    );
  }
}
