import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { docTenantId } from '@/lib/tenant';
import { ensureClientAccountActivation } from '@/lib/clientActivation';
import { queueEmailEvent } from '@/lib/emailEvents';
import { getCurrentUser } from '../../_utils';
import { logActivity } from '@/lib/activity/tracker';
import { createNotifications, getUsersByRoles } from '@/lib/notifications';

export const runtime = 'nodejs';

const PROJECT_TYPES = ['Website', 'Branding', 'SEO', 'Social', 'Video', 'Other'];
const CREATE_PIPELINE_STAGES = ['Kickoff', 'Draft', 'Review', 'Revisions', 'Final', 'Delivered'];
const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];

function canCreateProject(role: string) {
  const r = (role || '').toLowerCase();
  return r === 'admin' || r === 'super_admin' || r === 'sales_manager' || r === 'am';
}

function cleanString(value: any) {
  return String(value || '').trim();
}

function toISODate(value: any) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function resolveUserName(uid?: string | null) {
  const cleanUid = cleanString(uid);
  if (!cleanUid) return null;
  const doc = await adminDb.collection('users').doc(cleanUid).get();
  if (!doc.exists) return null;
  const data = doc.data() || {};
  return (data.name || data.fullName || data.displayName || '').toString().trim() || null;
}

export async function POST(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!canCreateProject(me.role)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const projectName = cleanString(body?.projectName);
    const clientId = cleanString(body?.clientId);
    const projectType = cleanString(body?.projectType);
    const stage = cleanString(body?.stage || 'Kickoff');

    if (!projectName) {
      return NextResponse.json({ ok: false, error: 'Project name is required' }, { status: 400 });
    }
    if (!clientId) {
      return NextResponse.json({ ok: false, error: 'Client is required' }, { status: 400 });
    }
    if (!PROJECT_TYPES.includes(projectType)) {
      return NextResponse.json({ ok: false, error: 'Invalid project type' }, { status: 400 });
    }
    if (!CREATE_PIPELINE_STAGES.includes(stage)) {
      return NextResponse.json({ ok: false, error: 'Invalid pipeline stage' }, { status: 400 });
    }

    const clientSnap = await adminDb.collection('clients').doc(clientId).get();
    if (!clientSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Client not found' }, { status: 404 });
    }

    const clientData = clientSnap.data() || {};
    if (clientData.deletedAt) {
      return NextResponse.json({ ok: false, error: 'Client not found' }, { status: 404 });
    }

    const isSuperAdminReq = String(me.role || '').toLowerCase() === 'super_admin';
    if (!isSuperAdminReq && docTenantId(clientData) !== me.tenantId) {
      return NextResponse.json({ ok: false, error: 'Client not found' }, { status: 404 });
    }

    const priorityRaw = cleanString(body?.priority || 'Normal');
    const priority = PRIORITIES.includes(priorityRaw) ? priorityRaw : 'Normal';

    const ownerAmUid = cleanString(body?.ownerAmUid) || null;
    const productionUid = cleanString(body?.productionUid) || null;

    const [ownerAmName, productionName] = await Promise.all([
      resolveUserName(ownerAmUid),
      resolveUserName(productionUid),
    ]);

    const now = admin.firestore.FieldValue.serverTimestamp();
    const ref = adminDb.collection('projects').doc();

    const payload = {
      projectName,
      clientId,
      clientName: cleanString(clientData.companyName || clientData.name || ''),
      projectType,
      stage,
      priority,
      health: null,
      createdByUid: me.uid,
      createdByName: cleanString(me.name || me.fullName || me.displayName || ''),
      ownerAmUid,
      ownerAmName: ownerAmName || null,
      productionUid,
      productionName: productionName || null,
      startDate: toISODate(body?.startDate),
      dueDate: toISODate(body?.dueDate),
      totalPaidUsd: Number(body?.totalPaidUsd || 0),
      outstandingUsd: Number(body?.outstandingUsd || 0),
      internalNotes: cleanString(body?.internalNotes),
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
    };

    await ref.set(payload, { merge: true });

    const projectNotifyTargets = await getUsersByRoles(
      ['admin', 'super_admin', 'production_manager', 'am_manager'],
      me.tenantId,
    );
    await createNotifications({
      recipients: projectNotifyTargets,
      tenantId: me.tenantId,
      type: 'info',
      title: 'New project created',
      message: `Project "${projectName}" was created.`,
      entityType: 'project',
      entityId: ref.id,
      deepLink: '/admin/projects',
    });

    let activationResult: Awaited<ReturnType<typeof ensureClientAccountActivation>> | null = null;
    try {
      activationResult = await ensureClientAccountActivation({
        tenantId: me.tenantId,
        clientId,
        clientData,
        createdByUid: me.uid,
      });
    } catch (activationErr: any) {
      console.warn('projects/create: client activation skipped —', activationErr?.message);
      // Project creation succeeds; email/portal setup skipped for clients without email
    }

    if (activationResult) {
      const emailMetadata = {
        clientId,
        projectId: ref.id,
        requestedByUid: me.uid,
        requestedByName: cleanString(me.name || me.fullName || me.displayName || ''),
      };
      const baseEmailData = {
        clientName: cleanString(clientData.companyName || clientData.name || ''),
        projectName,
        projectType,
        stage,
        dashboardLoginUrl: activationResult.dashboardLoginUrl,
        accountActivationRequired: activationResult.activationPrepared,
      };
      await queueEmailEvent({
        templateId: 'payment_confirmation',
        to: activationResult.email,
        data: { ...baseEmailData, totalPaidUsd: payload.totalPaidUsd || 0 },
        metadata: emailMetadata,
        sequence: 1,
      });
      await queueEmailEvent({
        templateId: 'welcome_client',
        to: activationResult.email,
        data: { ...baseEmailData, packageLabel: projectType },
        metadata: emailMetadata,
        sequence: 2,
      });
      await queueEmailEvent({
        templateId: 'account_activation',
        to: activationResult.email,
        data: {
          ...baseEmailData,
          setPasswordLink: activationResult.setPasswordLink || null,
        },
        metadata: emailMetadata,
        sequence: 3,
      });
    }

    await logActivity({
      tenantId: me.tenantId,
      actor: {
        uid: me.uid,
        name: cleanString(me.name || me.fullName || me.displayName || 'Admin'),
      },
      action: 'created',
      entityType: 'project',
      entityId: ref.id,
      entityName: projectName,
      category: 'project',
    });

    return NextResponse.json({
      ok: true,
      project: {
        id: ref.id,
        ...payload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error('projects/create error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'Server error' }, { status: 500 });
  }
}
