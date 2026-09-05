import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { docTenantId, normalizeTenantId } from '@/lib/tenant';
import { Permission, hasPermission } from '../../../lib/permissions';
import { getCurrentUser } from '../../admin/_utils';
import { recordManualClientPayment } from '@/lib/finance/manualClientPayment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cleanString(value: unknown) {
  return String(value ?? '').trim();
}

/**
 * Compatibility endpoint for the old deal-level "Mark Paid" action.
 *
 * It no longer creates Auth users, order ids or projects. A Closed Won deal must already own
 * the service invoice created by the commercial activation flow; this endpoint is only an
 * authorized offline/manual payment confirmation adapter into the canonical payment engine.
 */
export async function POST(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(me.role, Permission.MarkPaymentPaid)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dealId = cleanString(body?.dealId || body?.id);
    if (!dealId) {
      return NextResponse.json({ ok: false, error: 'Missing deal id.' }, { status: 400 });
    }

    const tenantId = normalizeTenantId(me.tenantId);
    const dealSnap = await adminDb.collection('deals').doc(dealId).get();
    if (!dealSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Deal not found.' }, { status: 404 });
    }

    const deal = dealSnap.data() || {};
    if (docTenantId(deal) !== tenantId) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const invoiceId = cleanString(deal.invoiceId);
    if (!invoiceId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'This deal is not linked to a service invoice. Reconcile the commercial engagement in Finance before recording payment.',
          code: 'deal_invoice_required',
        },
        { status: 409 },
      );
    }

    const method = cleanString(body?.method) || 'manual';
    const reason =
      cleanString(body?.reason) ||
      `Legacy deal payment action confirmed by authorized operator for deal ${dealId}.`;
    const actorName = cleanString(me.name || me.fullName || me.displayName || '');

    try {
      const applied = await recordManualClientPayment({
        invoiceId,
        tenantId,
        method,
        reason,
        source: 'legacy_deal_manual_payment',
        actor: { uid: me.uid, name: actorName },
      });

      return NextResponse.json({
        ok: true,
        status: applied.newlyRecorded ? 'recorded' : 'already_recorded',
        dealId,
        invoiceId,
        invoiceStatus: applied.status,
        amountPaid: applied.amountPaid,
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
  } catch (error) {
    console.error('deals/mark-paid error:', error);
    return NextResponse.json({ ok: false, error: 'Unable to record payment.' }, { status: 500 });
  }
}
