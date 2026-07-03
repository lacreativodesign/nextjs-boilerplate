import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { logEvent } from '@/lib/audit';
import { createNotification, getUserIdsByRoles } from '@/lib/notifications';
import { DEFAULT_TENANT_ID, docTenantId, normalizeTenantId } from '@/lib/tenant';
import {
  getCurrentUser,
  isAdminOrSuper,
  isAmManager,
  isProductionManager,
  isSalesManager,
  normalizeRole,
} from '../../admin/_utils';
import { notifyUsers } from '../../sales_manager/_utils';
import { requireApprovalsModule } from '../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ResolveKind = 'discount' | 'change_request' | 'payment_exception';

function parseString(value: any) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

async function getClientUserIds(clientId: string, tenantId: string) {
  if (!clientId) return [];
  const snap = await adminDb
    .collection('users')
    .where('role', '==', 'client')
    .where('clientId', '==', clientId)
    .where('tenantId', '==', tenantId)
    .get();
  return snap.docs.map((doc) => doc.id);
}

export async function POST(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const id = parseString(body?.id);
    const kind = parseString(body?.kind) as ResolveKind;
    const action = parseString(body?.action || body?.status);

    if (!id || !kind || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ ok: false, error: 'Invalid approval action.' }, { status: 400 });
    }

    const role = normalizeRole(me.role);
    const tenantId = normalizeTenantId(me.tenantId);
    const actorName = parseString(me.name || me.fullName || me.displayName);
    const moduleAccess = await requireApprovalsModule(tenantId, me.role);
    if (!moduleAccess.ok) {
      return NextResponse.json(
        { ok: false, error: moduleAccess.error },
        { status: moduleAccess.status },
      );
    }

    if (kind === 'discount') {
      if (!(isAdminOrSuper(role) || isSalesManager(role))) {
        return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }

      const dealRef = adminDb.collection('deals').doc(id);
      let dealData: Record<string, any> = {};

      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(dealRef);
        if (!snap.exists) {
          throw new Error('Deal not found');
        }
        dealData = snap.data() || {};
        if (docTenantId(dealData) !== tenantId) {
          throw new Error('Forbidden');
        }
        const currentStatus = String(
          dealData.discountStatus || (dealData.discountPct > 0 ? 'pending' : 'none'),
        );
        if (currentStatus !== 'pending') {
          throw new Error('Discount approval is not pending.');
        }
        const update: Record<string, any> = {
          discountApproved: action === 'approve',
          discountStatus: action === 'approve' ? 'approved' : 'rejected',
          discountApprovedAt: admin.firestore.FieldValue.serverTimestamp(),
          discountApprovedByUid: me.uid,
          discountApprovedByName: actorName,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          tenantId,
        };
        tx.set(dealRef, update, { merge: true });
      });

      const discountPct = Number(dealData.discountPct || 0);
      const listPriceUsd = Number(dealData.listPriceUsd || dealData.valueUsd || 0);
      const finalPriceUsd = Number(dealData.finalPriceUsd || dealData.valueUsd || 0);
      const decisionTitle = action === 'approve' ? 'Discount approved' : 'Discount rejected';

      await logEvent({
        tenantId,
        type: action === 'approve' ? 'sales.discount.approved' : 'sales.discount.rejected',
        title: decisionTitle,
        description: `${dealData.dealName || dealData.leadName || 'Deal'} discount ${action}d.`,
        entityType: 'deal',
        entityId: id,
        actor: { uid: me.uid, name: actorName },
        metadata: { discountPct, listPriceUsd, finalPriceUsd },
      });

      const notifyTargets = Array.from(
        new Set(
          [dealData.ownerId, dealData.createdBy, dealData.discountRequestedByUid].filter(Boolean),
        ),
      ) as string[];
      if (notifyTargets.length) {
        await notifyUsers({
          userIds: notifyTargets,
          title: decisionTitle,
          body: `${dealData.dealName || dealData.leadName || 'Deal'} discount was ${action}d.`,
          entityType: 'deal',
          entityId: id,
          deepLink: '/sales/deals',
          createdBy: { uid: me.uid, name: actorName },
          tenantId,
        });
      }

      return NextResponse.json({ ok: true });
    }

    if (kind === 'change_request') {
      if (
        !(
          isAdminOrSuper(role) ||
          isSalesManager(role) ||
          isProductionManager(role) ||
          isAmManager(role)
        )
      ) {
        return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }

      const ref = adminDb.collection('changeRequests').doc(id);
      const snap = await ref.get();
      if (!snap.exists) {
        return NextResponse.json(
          { ok: false, error: 'Change request not found.' },
          { status: 404 },
        );
      }

      const data = snap.data() || {};
      if (docTenantId(data) !== tenantId) {
        return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }

      const serverNow = admin.firestore.FieldValue.serverTimestamp();
      const now = admin.firestore.Timestamp.now();
      const statusHistory = Array.isArray(data.statusHistory) ? [...data.statusHistory] : [];

      if (action === 'approve') {
        statusHistory.push({
          from: data.status || 'Submitted',
          to: data.status || 'Submitted',
          byUid: me.uid,
          byRole: role,
          at: now,
          note: 'Internal approval granted',
        });
        await ref.set(
          {
            internalApproved: true,
            internalApprovedAt: serverNow,
            internalApprovedByUid: me.uid,
            internalApprovedByName: actorName,
            updatedAt: serverNow,
            tenantId,
            statusHistory,
          },
          { merge: true },
        );

        await logEvent({
          tenantId,
          type: 'change_request.internal_approved',
          title: 'Change request internally approved',
          description: `${data.title || 'Change request'} approved for client review.`,
          entityType: 'change_request',
          entityId: id,
          actor: { uid: me.uid, name: actorName },
          metadata: { projectId: data.projectId || '', clientId: data.clientId || '' },
        });
      } else {
        statusHistory.push({
          from: data.status || 'Submitted',
          to: 'Rejected',
          byUid: me.uid,
          byRole: role,
          at: now,
          note: 'Change request rejected',
        });
        await ref.set(
          {
            status: 'Rejected',
            rejectedAt: serverNow,
            rejectedByUid: me.uid,
            rejectedByName: actorName,
            updatedAt: serverNow,
            tenantId,
            statusHistory,
          },
          { merge: true },
        );

        await logEvent({
          tenantId,
          type: 'change_request.rejected',
          title: 'Change request rejected',
          description: `${data.title || 'Change request'} rejected.`,
          entityType: 'change_request',
          entityId: id,
          actor: { uid: me.uid, name: actorName },
          metadata: { projectId: data.projectId || '', clientId: data.clientId || '' },
        });
      }

      const projectId = String(data.projectId || '');
      const projectSnap = projectId
        ? await adminDb.collection('projects').doc(projectId).get()
        : null;
      const project = projectSnap?.exists ? projectSnap.data() || {} : {};
      const clientId = String(data.clientId || project.clientId || '');

      const notifyIds = new Set<string>();
      if (project?.ownerAmUid) notifyIds.add(String(project.ownerAmUid));
      if (data.requestedByUid) notifyIds.add(String(data.requestedByUid));
      const clientUsers = await getClientUserIds(clientId, tenantId);
      clientUsers.forEach((id) => notifyIds.add(id));

      const notificationTitle =
        action === 'approve' ? 'Change request approved internally' : 'Change request rejected';
      const notificationBody =
        action === 'approve'
          ? `${data.title || 'Change request'} is ready for client review.`
          : `${data.title || 'Change request'} was rejected.`;

      await Promise.all(
        Array.from(notifyIds).map((uid) =>
          createNotification({
            toUserId: uid,
            title: notificationTitle,
            body: notificationBody,
            type: action === 'approve' ? 'info' : 'warning',
            entityType: 'change_request',
            entityId: id,
            deepLink: project?.ownerAmUid
              ? '/am/change-requests'
              : '/admin/projects/change-requests',
            createdBy: { uid: me.uid, name: actorName },
            tenantId,
          }),
        ),
      );

      return NextResponse.json({ ok: true });
    }

    if (kind === 'payment_exception') {
      if (!(isAdminOrSuper(role) || isProductionManager(role) || isAmManager(role))) {
        return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }

      const ref = adminDb.collection('invoices').doc(id);
      const snap = await ref.get();
      if (!snap.exists) {
        return NextResponse.json({ ok: false, error: 'Invoice not found.' }, { status: 404 });
      }

      const data = snap.data() || {};
      if (docTenantId(data) !== tenantId) {
        return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }

      await ref.set(
        {
          needsReview: false,
          reviewStatus: action === 'approve' ? 'approved' : 'rejected',
          reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
          reviewedByUid: me.uid,
          reviewedByName: actorName,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          tenantId,
        },
        { merge: true },
      );

      await logEvent({
        tenantId,
        type: action === 'approve' ? 'payment_exception.approved' : 'payment_exception.rejected',
        title: action === 'approve' ? 'Payment exception approved' : 'Payment exception rejected',
        description: `${data.invoiceNumber || 'Invoice'} payment exception ${action}d.`,
        entityType: 'invoice',
        entityId: id,
        actor: { uid: me.uid, name: actorName },
        metadata: { invoiceId: id, clientId: data.clientId || '' },
      });

      const adminIds = await getUserIdsByRoles(['admin', 'super_admin'], tenantId);
      await notifyUsers({
        userIds: adminIds,
        title: action === 'approve' ? 'Payment exception approved' : 'Payment exception rejected',
        body: `${data.invoiceNumber || 'Invoice'} exception ${action}d.`,
        entityType: 'invoice',
        entityId: id,
        deepLink: '/admin/finance/invoices',
        createdBy: { uid: me.uid, name: actorName },
        tenantId,
      });

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: 'Unsupported approval type.' }, { status: 400 });
  } catch (err: any) {
    console.error('approvals resolve error:', err);
    const message = String(err?.message || 'Unable to resolve approval.');
    const lower = message.toLowerCase();
    const status = lower.includes('forbidden')
      ? 403
      : lower.includes('not found')
        ? 404
        : lower.includes('pending') || lower.includes('invalid')
          ? 400
          : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
