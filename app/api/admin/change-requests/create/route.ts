import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { logEvent } from '@/lib/audit';
import {
  getCurrentUser,
  isAccountManager,
  isAdminOrSuper,
  isSalesManager,
  normalizeRole,
} from '../../_utils';
import {
  createNotification,
  createNotificationEvent,
  createNotifications,
  getUserIdsByRoles,
  getUsersByRoles,
} from '@/lib/notifications';

export const runtime = 'nodejs';

const CHANGE_REQUEST_TYPES = [
  'Scope Change',
  'Revision',
  'New Feature',
  'Bug Fix',
  'Other',
] as const;
const CHANGE_REQUEST_PRIORITIES = ['Low', 'Medium', 'High'] as const;

function cleanString(value: any) {
  return String(value || '').trim();
}

function canCreate(role: string) {
  return isAdminOrSuper(role) || isSalesManager(role) || isAccountManager(role);
}

async function enqueueEvent(payload: {
  changeRequestId: string;
  projectId: string;
  clientId: string;
  status: string;
  actorUid: string;
  actorRole: string;
}) {
  try {
    await adminDb.collection('eventsQueue').add({
      type: 'CHANGE_REQUEST_CREATED',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      payload: {
        ...payload,
        timestamp: admin.firestore.Timestamp.now(),
      },
    });
  } catch (eventError) {
    console.error('eventsQueue enqueue error:', eventError);
  }
}

export async function POST(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const role = normalizeRole(me.role);
    if (!canCreate(role)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const projectId = cleanString(body?.projectId);
    const type = cleanString(body?.type);
    const title = cleanString(body?.title);
    const description = cleanString(body?.description);
    const priority = cleanString(body?.priority) || 'Medium';
    const attachedFileIds = Array.isArray(body?.attachedFileIds)
      ? body.attachedFileIds.map((id: any) => cleanString(id)).filter(Boolean)
      : [];

    if (!projectId) {
      return NextResponse.json({ ok: false, error: 'Project is required.' }, { status: 400 });
    }

    if (!CHANGE_REQUEST_TYPES.includes(type as (typeof CHANGE_REQUEST_TYPES)[number])) {
      return NextResponse.json(
        { ok: false, error: 'Invalid change request type.' },
        { status: 400 },
      );
    }

    if (!title) {
      return NextResponse.json({ ok: false, error: 'Title is required.' }, { status: 400 });
    }

    if (!description) {
      return NextResponse.json({ ok: false, error: 'Description is required.' }, { status: 400 });
    }

    if (
      !CHANGE_REQUEST_PRIORITIES.includes(priority as (typeof CHANGE_REQUEST_PRIORITIES)[number])
    ) {
      return NextResponse.json({ ok: false, error: 'Invalid priority.' }, { status: 400 });
    }

    const projectSnap = await adminDb.collection('projects').doc(projectId).get();
    if (!projectSnap.exists || projectSnap.data()?.isDeleted) {
      return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
    }

    const project = projectSnap.data() || {};
    const isSuperAdminReq = String(me.role || '').toLowerCase() === 'super_admin';
    const projectTenant = String(project?.tenantId || '').trim();
    const myTenant = String(me.tenantId || '').trim();
    if (!isSuperAdminReq && projectTenant && projectTenant !== myTenant) {
      return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
    }

    const resolvedTenantId = String(project?.tenantId || me.tenantId || '').trim();
    if (!resolvedTenantId)
      return NextResponse.json({ ok: false, error: 'Tenant context missing.' }, { status: 400 });
    const tenantId = resolvedTenantId;

    if (isAccountManager(role)) {
      const isOwner =
        project.ownerAmUid === me.uid || (!project.ownerAmUid && project.createdByUid === me.uid);
      if (!isOwner) {
        return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }
    }

    const now = admin.firestore.Timestamp.now();
    const serverNow = admin.firestore.FieldValue.serverTimestamp();
    const impactsScope = type === 'Scope Change';

    const docRef = await adminDb.collection('changeRequests').add({
      projectId,
      projectName: project.projectName || '',
      clientId: project.clientId || '',
      clientName: project.clientName || '',
      type,
      title,
      description,
      status: 'Submitted',
      priority,
      requestedByUid: me.uid,
      requestedByRole: role,
      assignedToUid: null,
      assignedToRole: null,
      estimatedCost: null,
      estimatedTimelineDays: null,
      approvedAt: null,
      approvedByUid: null,
      attachedFileIds,
      approvalStatus: impactsScope ? 'pending' : null,
      approvalId: null,
      approvalRequestedAt: impactsScope ? serverNow : null,
      approvalRequestedByUid: impactsScope ? me.uid : null,
      createdAt: serverNow,
      updatedAt: serverNow,
      completedAt: null,
      isDeleted: false,
      tenantId,
      statusHistory: [
        {
          from: '',
          to: 'Submitted',
          byUid: me.uid,
          byRole: role,
          at: now,
          note: 'Change request submitted',
        },
      ],
    });

    if (impactsScope) {
      const approvalRef = adminDb.collection('approvals').doc();
      await approvalRef.set({
        tenantId,
        type: 'change_request',
        entityType: 'project',
        entityId: projectId,
        requestedBy: {
          uid: me.uid,
          role,
        },
        requestedData: {
          changeRequestId: docRef.id,
          projectId,
          projectName: project.projectName || '',
          title,
          type,
        },
        status: 'pending',
        approvalChain: [{ role: 'am_manager' }],
        createdAt: serverNow,
        updatedAt: serverNow,
      });
      await docRef.set({ approvalId: approvalRef.id }, { merge: true });

      await logEvent({
        tenantId,
        type: 'change_request.approval.requested',
        title: 'Change request approval requested',
        description: `${title} requires manager approval.`,
        entityType: 'change_request',
        entityId: docRef.id,
        actor: { uid: me.uid, name: me.name || me.fullName || me.displayName || '' },
        metadata: {
          projectId,
          type,
        },
      });
    }

    await enqueueEvent({
      changeRequestId: docRef.id,
      projectId,
      clientId: project.clientId || '',
      status: 'Submitted',
      actorUid: me.uid,
      actorRole: role,
    });

    const adminIds = await getUserIdsByRoles(['admin', 'super_admin'], tenantId);
    const actorName = me.name || me.fullName || me.displayName || '';
    const notifications: Promise<void>[] = [];
    if (project.ownerAmUid) {
      notifications.push(
        createNotification({
          toUserId: String(project.ownerAmUid),
          title: 'Change request submitted',
          body: `${project.projectName || 'Project'} has a new change request: ${title}.`,
          type: 'info',
          entityType: 'change_request',
          entityId: docRef.id,
          deepLink: '/am/change-requests',
          createdBy: { uid: me.uid, name: actorName },
          tenantId,
        }),
      );
    }

    adminIds.forEach((uid) => {
      if (!uid) return;
      notifications.push(
        createNotification({
          toUserId: uid,
          title: 'Change request submitted',
          body: `${project.projectName || 'Project'} has a new change request: ${title}.`,
          type: 'info',
          entityType: 'change_request',
          entityId: docRef.id,
          deepLink: '/admin/projects/change-requests',
          createdBy: { uid: me.uid, name: actorName },
          tenantId,
        }),
      );
    });

    await Promise.all(notifications);

    const managerRecipients = await getUsersByRoles(['am_manager'], tenantId);
    await createNotifications({
      recipients: managerRecipients,
      tenantId,
      type: 'change_request',
      title: 'Change request submitted',
      message: `${project.projectName || 'Project'} has a new change request: ${title}.`,
      entityType: 'change_request',
      entityId: docRef.id,
      createdBy: { uid: me.uid, name: actorName },
    });

    await createNotificationEvent({
      type: 'change_request.created',
      title: 'Change request submitted',
      description: `${project.projectName || 'Project'} received a change request.`,
      entityType: 'change_request',
      entityId: docRef.id,
      createdByUid: me.uid,
      createdByName: actorName,
      metadata: {
        projectId,
        clientId: project.clientId || '',
      },
    });

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (err) {
    console.error('change-requests/create error:', err);
    return NextResponse.json(
      { ok: false, error: 'Unable to create change request right now.' },
      { status: 500 },
    );
  }
}
