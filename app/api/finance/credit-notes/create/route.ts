import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { parseNumber, parseString, requireFinance, serverTimestamp } from '../../_utils';
import { assertPermission, Permission } from '../../../../lib/permissions';
import { docTenantId, normalizeTenantId } from '@/lib/tenant';
import { normalizeInvoiceStatus } from '@/lib/finance/status';
import { normalizeRole } from '../../../admin/_utils';
import { writeFinanceLedgerEntry } from '@/lib/finance/ledger';
import { writeAuditLog } from '@/lib/tenant/audit';

export const dynamic = 'force-dynamic';

/**
 * Credit notes — the correction path for PAID invoices (locked finance rule).
 * Paid invoices are immutable; offline corrections are recorded as a separate
 * credit_notes document with a mandatory reason, ledger-logged first
 * (credit_note.created, negative amount). Stripe refunds go through Stripe
 * only — this route never moves money.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    try {
      assertPermission(auth.user.role, Permission.MarkPaymentPaid);
    } catch {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const invoiceId = parseString(body?.invoiceId).trim();
    const reason = parseString(body?.reason).trim();
    const amountUsd = parseNumber(body?.amountUsd);

    if (!invoiceId) {
      return NextResponse.json({ ok: false, error: 'Invoice id is required.' }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json(
        { ok: false, error: 'A credit note reason is required.' },
        { status: 400 },
      );
    }
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      return NextResponse.json(
        { ok: false, error: 'A positive credit amount is required.' },
        { status: 400 },
      );
    }

    const invoiceSnap = await adminDb.collection('invoices').doc(invoiceId).get();
    if (!invoiceSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Invoice not found.' }, { status: 404 });
    }

    const invoice = invoiceSnap.data() || {};
    const isSuperAdmin = normalizeRole(auth.user.role || '') === 'super_admin';
    const tenantId = normalizeTenantId(auth.user.tenantId);
    if (!isSuperAdmin && docTenantId(invoice) !== tenantId) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    if (normalizeInvoiceStatus(invoice.status) !== 'paid') {
      return NextResponse.json(
        { ok: false, error: 'Credit notes can only be issued against paid invoices.' },
        { status: 400 },
      );
    }

    const totalPaid = Number(invoice.totalPaid || 0);
    if (amountUsd > totalPaid) {
      return NextResponse.json(
        { ok: false, error: 'Credit amount cannot exceed the amount paid on the invoice.' },
        { status: 400 },
      );
    }

    const orderId = String(invoice.orderId || '');
    const clientId = String(invoice.clientId || '');
    const actor = { uid: auth.user.uid, name: auth.user.name || auth.user.fullName || '' };
    const invoiceTenantId = String(invoice.tenantId || tenantId || '');

    // Ledger first (append-only): the credit must never exist without its entry.
    const ledgerEntryId = await writeFinanceLedgerEntry({
      tenantId: invoiceTenantId,
      type: 'credit_note.created',
      invoiceId,
      orderId,
      clientId,
      amountUsd: -amountUsd,
      previousStatus: 'paid',
      reason,
      actor,
    });

    const creditNoteRef = adminDb.collection('credit_notes').doc();
    await creditNoteRef.set({
      tenantId: invoiceTenantId,
      invoiceId,
      orderId,
      clientId,
      amountUsd,
      reason,
      status: 'issued',
      ledgerEntryId,
      createdBy: actor,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await writeAuditLog({
      tenantId: auth.user.tenantId || null,
      actorUserId: auth.user.uid,
      actorName: actor.name,
      actorRole: auth.user.role,
      actionType: 'credit_note.created',
      entityType: 'credit_note',
      entityId: creditNoteRef.id,
      metadata: { invoiceId, orderId, amountUsd, reason, ledgerEntryId },
    }).catch(() => undefined);

    return NextResponse.json({ ok: true, creditNoteId: creditNoteRef.id, ledgerEntryId });
  } catch (err: any) {
    console.error('finance/credit-notes create error:', err);
    return NextResponse.json(
      { ok: false, error: 'Unable to create credit note.' },
      { status: 500 },
    );
  }
}
