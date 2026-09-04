import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin, parseString } from '../../_utils';
import { assertPermission, Permission } from '../../../../../lib/permissions';
import { docTenantId, normalizeTenantId } from '@/lib/tenant';
import { normalizeRole } from '../../../_utils';
import { recordManualClientPayment } from '@/lib/finance/manualClientPayment';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
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
        `Existing payment ${id} manually confirmed as received by an administrator.`;
      const actorName = auth.user.name || auth.user.fullName || auth.user.displayName || '';

      try {
        const applied = await recordManualClientPayment({
          invoiceId,
          tenantId: scopedTenantId,
          paymentId: id,
          method,
          reason,
          source: 'admin_manual_payment_confirmation',
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

    if (action === 'refund') {
      // Refund state can only change through the canonical Stripe refund route
      // (/api/payments/refund), which executes the refund on Stripe and writes
      // refund.created + payment.refunded finance ledger entries atomically.
      return NextResponse.json(
        {
          ok: false,
          error:
            'Refunds must be processed through Stripe. Use the refund action on the Finance payments screen, which calls /api/payments/refund.',
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: false, error: 'Invalid action.' }, { status: 400 });
  } catch (err: any) {
    console.error('admin/finance/payments update error:', err);
    const rawMessage = String(err?.message || '');
    const isIndexError =
      rawMessage.includes('FAILED_PRECONDITION') ||
      rawMessage.toLowerCase().includes('index') ||
      rawMessage.toLowerCase().includes('indexes');
    const safeMessage = isIndexError ? 'Missing Firestore index.' : 'Unable to update payment.';
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
