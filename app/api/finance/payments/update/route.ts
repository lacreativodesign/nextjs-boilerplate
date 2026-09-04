import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { createFinanceEvent, parseString, requireFinance, serverTimestamp } from '../../_utils';
import { createNotification, getUserIdsByRoles } from '@/lib/notifications';
import { logEvent } from '@/lib/audit';
import { getClientIp } from '@/lib/security';
import { assertPermission, Permission } from '../../../../lib/permissions';
import { docTenantId, normalizeTenantId } from '@/lib/tenant';
import { normalizeRole } from '../../../admin/_utils';
import { recordManualClientPayment } from '@/lib/finance/manualClientPayment';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const id = parseString(body?.id).trim();
    const action = parseString(body?.action).trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Payment id is required.' }, { status: 400 });
    }

    const ref = adminDb.collection('payments').doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'Payment not found.' }, { status: 404 });
    }

    const payment = snap.data() || {};
    const invoiceId = String(payment.invoiceId || '').trim();
    const clientName = String(payment.clientName || '');
    const actorName = auth.user.name || auth.user.fullName || auth.user.displayName || '';
    const isSuperAdmin = normalizeRole(auth.user.role || '') === 'super_admin';
    const tenantId = normalizeTenantId(auth.user.tenantId);

    if (!isSuperAdmin && docTenantId(payment) !== tenantId) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    if (action === 'mark_paid') {
      try {
        assertPermission(auth.user.role, Permission.MarkPaymentPaid);
      } catch {
        return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }

      if (!invoiceId) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Client payments must be linked to an invoice before they can be recorded.',
          },
          { status: 409 },
        );
      }

      const scopedTenantId = String(payment.tenantId || tenantId || '').trim();
      const method =
        parseString(body?.method).trim() || String(payment.method || '').trim() || 'manual';
      const reason =
        parseString(body?.reason).trim() ||
        `Existing payment ${id} manually confirmed as received by Finance.`;

      try {
        const applied = await recordManualClientPayment({
          invoiceId,
          tenantId: scopedTenantId,
          paymentId: id,
          method,
          reason,
          source: 'finance_manual_payment_confirmation',
          actor: { uid: auth.user.uid, name: actorName },
        });

        return NextResponse.json({
          ok: true,
          paymentId: id,
          invoiceId,
          invoiceStatus: applied.status,
          totalPaid: applied.totalPaid,
          balanceDue: applied.balanceDue,
          projectId: applied.projectId,
          newlyRecorded: applied.newlyRecorded,
        });
      } catch (error: any) {
        const message = String(error?.message || 'Unable to record payment.');
        const status =
          message.toLowerCase().includes('tenant mismatch') ||
          message.toLowerCase().includes('bound to another invoice')
            ? 403
            : message.toLowerCase().includes('not found')
              ? 404
              : 400;
        return NextResponse.json({ ok: false, error: message }, { status });
      }
    }

    if (action === 'update_notes') {
      const notes = parseString(body?.notes).trim();
      await ref.update({
        notes: notes || null,
        updatedAt: serverTimestamp(),
      });

      const financeIds = await getUserIdsByRoles(['finance', 'admin', 'super_admin'], tenantId);
      await Promise.all(
        financeIds.map((uid) =>
          createNotification({
            toUserId: uid,
            title: 'Payment note updated',
            body: `Payment ${id} note updated for ${clientName || 'client'}.`,
            type: 'info',
            entityType: 'payment',
            entityId: id,
            deepLink: '/finance/payments',
            createdBy: { uid: auth.user.uid, name: actorName },
            roleTarget: 'finance',
            tenantId: auth.user.tenantId || null,
          }),
        ),
      );

      await createFinanceEvent({
        type: 'finance.payment_note',
        title: 'Payment note updated',
        description: `Payment ${id} note updated for ${clientName || 'client'}.`,
        entityType: 'payment',
        entityId: id,
        createdByUid: auth.user.uid,
        createdByName: actorName,
        tenantId: auth.user.tenantId,
      });

      try {
        await logEvent({
          tenantId: auth.user.tenantId,
          type: 'finance.payment_note',
          title: 'Payment note updated',
          description: `Payment ${id} note updated for ${clientName || 'client'}.`,
          entityType: 'payment',
          entityId: id,
          actor: { uid: auth.user.uid, name: actorName },
          metadata: {
            ip: getClientIp(req),
            userAgent: req.headers.get('user-agent') || '',
          },
          audit: {
            action: 'update',
            resource: 'payment',
            resourceId: id,
            changes: [
              {
                field: 'notes',
                oldValue: payment.notes || null,
                newValue: notes || null,
              },
            ],
          },
        });
      } catch (auditError) {
        console.error('audit log error:', auditError);
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: 'Invalid action.' }, { status: 400 });
  } catch (err: any) {
    console.error('finance/payments update error:', err);
    const rawMessage = String(err?.message || '');
    const isIndexError =
      rawMessage.includes('FAILED_PRECONDITION') ||
      rawMessage.toLowerCase().includes('index') ||
      rawMessage.toLowerCase().includes('indexes');
    const safeMessage = isIndexError ? 'Missing Firestore index.' : 'Unable to update payment.';
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
