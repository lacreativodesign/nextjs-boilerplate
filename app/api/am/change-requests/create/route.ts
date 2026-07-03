import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { logEvent } from '@/lib/audit';
import {
  createNotification,
  createNotificationEvent,
  createNotifications,
  getUserIdsByRoles,
  getUsersByRoles,
} from '@/lib/notifications';
import { getAmUser, isOwnedByAm } from '../../_utils';
import { sendEmail } from '@/lib/email/email-service';

export const runtime = 'nodejs';

const CHANGE_REQUEST_TYPES = [
  'Scope Change',
  'Revision',
  'New Feature',
  'Bug Fix',
  'Other',
] as const;
const CHANGE_REQUEST_PRIORITIES = ['Low', 'Medium', 'High'] as const;

type ProjectDoc = {
  projectName?: string;
  clientId?: string;
  clientName?: string;
  ownerAmUid?: string | null;
  ownerId?: string | null;
  amId?: string | null;
  createdByUid?: string | null;
  tenantId?: string | null;
  isDeleted?: boolean;
};

function cleanString(value: any) {
  return String(value || '').trim();
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
    const me = await getAmUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!me.tenantId) {
      return NextResponse.json({ ok: false, error: 'Tenant context missing.' }, { status: 403 });
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

    const project = projectSnap.data() as ProjectDoc;
    if (!isOwnedByAm(project, me.uid)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const tenantId = String(project?.tenantId || me.tenantId);
    const impactsScope = type === 'Scope Change';

    const now = admin.firestore.Timestamp.now();
    const serverNow = admin.firestore.FieldValue.serverTimestamp();

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
      requestedByRole: 'am',
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
          byRole: 'am',
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
          role: 'am',
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
      actorRole: 'am',
    });

    const adminIds = await getUserIdsByRoles(['admin', 'super_admin', 'sales_manager'], tenantId);
    const recipients = new Set<string>();
    adminIds.forEach((id) => recipients.add(id));

    const actorName = me.name || me.fullName || me.displayName || '';
    await Promise.all(
      Array.from(recipients)
        .filter(Boolean)
        .map((uid) =>
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
        ),
    );

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

    // Email AM managers about new change request — non-blocking
    getUsersByRoles(['am_manager', 'admin'], tenantId)
      .then((managers) => {
        return Promise.all(
          managers.map((manager) =>
            sendEmail({
              to: manager.email || '',
              subject: `🔄 New change request — ${project.projectName || 'Project'}`,
              html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#F8FAFC;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#012167,#6692f9);padding:24px 32px;">
<table cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:14px;vertical-align:middle;"><div style="background:rgba(255,255,255,0.18);border-radius:10px;width:44px;height:44px;text-align:center;line-height:44px;font-size:26px;font-weight:900;color:#fff;font-family:Arial,sans-serif;">B</div></td>
<td style="vertical-align:middle;"><div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:0.1em;">BIZOSTO</div><div style="color:rgba(255,255,255,0.72);font-size:12px;margin-top:3px;">Project Update</div></td>
</tr></table></td></tr>
<tr><td style="padding:36px 32px;color:#1E293B;font-size:15px;line-height:1.7;">
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#012167;">🔄 New Change Request</h1>
<p style="margin:0 0 24px;color:#64748B;font-size:14px;">A change request has been submitted and needs your review.</p>
<table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:8px;margin:16px 0;">
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Project</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${project.projectName || '—'}</td></tr>
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Title</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${title}</td></tr>
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Description</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${description.slice(0, 120)}${description.length > 120 ? '…' : ''}</td></tr>
<tr><td style="color:#64748B;font-size:13px;">Submitted by</td><td style="font-weight:600;color:#1E293B;text-align:right;">${me.name || me.fullName || me.displayName || 'AM'}</td></tr>
</table>
<p style="margin:24px 0 0;"><a href="https://app.bizosto.com/admin/projects/change-requests" style="display:inline-block;padding:12px 24px;background:#012167;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Review Change Request →</a></p>
</td></tr>
<tr><td style="background:#F1F5F9;padding:20px 32px;border-top:1px solid #E2E8F0;"><p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;">© ${new Date().getFullYear()} Bizosto · <a href="https://bizosto.com" style="color:#012167;text-decoration:none;">bizosto.com</a></p></td></tr>
</table></td></tr></table></body></html>`,
            }).catch(() => {}),
          ),
        );
      })
      .catch((err) => console.error('[CHANGE_REQUEST] Failed to email managers', err));

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (err) {
    console.error('am/change-requests create error:', err);
    return NextResponse.json(
      { ok: false, error: 'Unable to create change request right now.' },
      { status: 500 },
    );
  }
}
