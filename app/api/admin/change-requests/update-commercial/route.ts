import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { logEvent } from '@/lib/audit';
import { getCurrentUser, isAdminOrSuper, isSalesManager, normalizeRole } from '../../_utils';

export const runtime = 'nodejs';

function cleanNumber(value: any) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  return num;
}

function cleanString(value: any) {
  return String(value || '').trim();
}

function canEditCommercial(role: string) {
  return isAdminOrSuper(role) || isSalesManager(role);
}

export async function POST(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const role = normalizeRole(me.role);
    if (!canEditCommercial(role)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const changeRequestId = cleanString(body?.changeRequestId);
    const estimatedCost = cleanNumber(body?.estimatedCost);
    const estimatedTimelineDays = cleanNumber(body?.estimatedTimelineDays);

    if (!changeRequestId) {
      return NextResponse.json({ ok: false, error: 'Missing change request id.' }, { status: 400 });
    }

    const ref = adminDb.collection('changeRequests').doc(changeRequestId);
    const snap = await ref.get();

    if (!snap.exists || snap.data()?.isDeleted) {
      return NextResponse.json({ ok: false, error: 'Change request not found.' }, { status: 404 });
    }

    const data = snap.data() || {};
    // Tenant isolation: only edit change requests in the caller's tenant (super_admin exempt).
    if (role !== 'super_admin' && String(data.tenantId || '') !== String(me.tenantId || '')) {
      return NextResponse.json({ ok: false, error: 'Change request not found.' }, { status: 404 });
    }
    const impactsTimeline = typeof estimatedTimelineDays === 'number' && estimatedTimelineDays > 0;
    const impactsCost = typeof estimatedCost === 'number' && estimatedCost > 0;
    const requiresApproval = impactsTimeline || impactsCost;
    const approvalNeeded =
      requiresApproval && data.approvalStatus !== 'approved' && data.approvalStatus !== 'pending';

    await ref.set(
      {
        estimatedCost,
        estimatedTimelineDays,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    if (approvalNeeded) {
      const resolvedTenantId = String(data.tenantId || me.tenantId || '').trim();
      if (!resolvedTenantId)
        return NextResponse.json({ ok: false, error: 'Tenant context missing.' }, { status: 400 });
      const tenantId = resolvedTenantId;
      const approvalRef = adminDb.collection('approvals').doc();
      await approvalRef.set({
        tenantId,
        type: 'change_request',
        entityType: 'project',
        entityId: data.projectId || '',
        requestedBy: {
          uid: me.uid,
          role,
        },
        requestedData: {
          changeRequestId,
          projectId: data.projectId || '',
          projectName: data.projectName || '',
          title: data.title || '',
          type: data.type || '',
          estimatedCost,
          estimatedTimelineDays,
        },
        status: 'pending',
        approvalChain: [{ role: 'am_manager' }],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await ref.set(
        {
          approvalStatus: 'pending',
          approvalId: approvalRef.id,
          approvalRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
          approvalRequestedByUid: me.uid,
        },
        { merge: true },
      );

      await logEvent({
        tenantId,
        type: 'change_request.approval.requested',
        title: 'Change request approval requested',
        description: `${data.title || 'Change request'} requires manager approval.`,
        entityType: 'change_request',
        entityId: changeRequestId,
        actor: { uid: me.uid, name: me.name || me.fullName || me.displayName || '' },
        metadata: {
          projectId: data.projectId || '',
          estimatedCost,
          estimatedTimelineDays,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('change-requests/update-commercial error:', err);
    return NextResponse.json(
      { ok: false, error: 'Unable to update commercial details right now.' },
      { status: 500 },
    );
  }
}
