import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  createFinanceEvent,
  parseString,
  queueFinanceEmail,
  requireFinance,
  serverTimestamp,
} from '../../_utils';
import { createNotification, getUserIdsByRoles, getUsersByRoles } from '@/lib/notifications';
import { sendEmail } from '@/lib/email/email-service';
import { logEvent } from '@/lib/audit';
import { getClientIp } from '@/lib/security';
import { assertPermission, Permission } from '../../../../lib/permissions';
import { docTenantId, normalizeTenantId } from '@/lib/tenant';
import {
  computeBalanceDue,
  computeInvoiceStatus,
  normalizeInvoiceStatus,
  parseInvoiceStatus,
} from '@/lib/finance/status';
import { maybeAutoCreateProjectFromInvoice } from '@/lib/finance/invoiceActions';
import { normalizeRole } from '../../../admin/_utils';
import { sendBizostoEventNotification } from '@/lib/integrations/slack';
import { writeAuditLog } from '@/lib/tenant/audit';
import { writeFinanceLedgerEntry, writeInvoiceVoidLedgerEntry } from '@/lib/finance/ledger';

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
      return NextResponse.json({ ok: false, error: 'Invoice id is required.' }, { status: 400 });
    }

    const ref = adminDb.collection('invoices').doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'Invoice not found.' }, { status: 404 });
    }

    const invoice = snap.data() || {};
    const clientId = String(invoice.clientId || '');
    const clientName = String(invoice.clientName || '');
    const orderId = String(invoice.orderId || '');
    const isSuperAdmin = normalizeRole(auth.user.role || '') === 'super_admin';
    const tenantId = normalizeTenantId(auth.user.tenantId);

    if (!isSuperAdmin && docTenantId(invoice) !== tenantId) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    if (action === 'mark_paid') {
      try {
        assertPermission(auth.user.role, Permission.MarkPaymentPaid);
      } catch {
        return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }

      const method = parseString(body?.method).trim();
      const reason = parseString(body?.reason).trim();
      if (!method || !reason) {
        return NextResponse.json(
          {
            ok: false,
            error: 'A payment method and reason are required to mark an invoice paid.',
          },
          { status: 400 },
        );
      }

      const scopedTenantId = String(invoice.tenantId || tenantId || '').trim();
      const paymentId = parseString(body?.paymentId).trim() || null;
      const actorName = auth.user.name || auth.user.fullName || auth.user.displayName || '';

      try {
        const applied = await recordManualClientPayment({
          invoiceId: id,
          tenantId: scopedTenantId,
          paymentId,
          method,
          reason,
          source: 'finance_manual_invoice_payment',
          actor: { uid: auth.user.uid, name: actorName },
        });

        if (applied.newlyRecorded && applied.status === 'paid') {
          await sendBizostoEventNotification({
            type: 'invoice_paid',
            tenantId: scopedTenantId,
            invoiceNumber: orderId || id,
            amountLabel: `${invoice.currency || 'USD'} ${applied.amountPaid.toFixed(2)}`,
          }).catch((error) => {
            console.error('slack invoice notification failed:', error);
          });
        }

        return NextResponse.json({
          ok: true,
          invoiceStatus: applied.status,
          amountPaid: applied.amountPaid,
          totalPaid: applied.totalPaid,
          balanceDue: applied.balanceDue,
          projectId: applied.projectId,
          newlyRecorded: applied.newlyRecorded,
          deepLink: '/finance/invoices',
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

    if (action === 'update_status') {
      const requested = parseInvoiceStatus(body?.status);
      if (!requested) {
        return NextResponse.json({ ok: false, error: 'Invalid status.' }, { status: 400 });
      }
      if (requested === 'paid') {
        return NextResponse.json(
          { ok: false, error: 'Use mark_paid to record payments.' },
          { status: 400 },
        );
      }
      if (normalizeInvoiceStatus(invoice.status) === 'paid') {
        return NextResponse.json(
          {
            ok: false,
            error: 'Paid invoices cannot be edited. Use a credit note or void for corrections.',
          },
          { status: 400 },
        );
      }
      if (requested === 'void') {
        return NextResponse.json(
          { ok: false, error: 'Use the void action to void an invoice (a reason is required).' },
          { status: 400 },
        );
      }
      await ref.update({
        status: requested,
        updatedAt: serverTimestamp(),
      });
      try {
        const actorName = auth.user.name || auth.user.fullName || auth.user.displayName || '';
        await logEvent({
          type: 'finance.invoice_status_updated',
          title: 'Invoice status updated',
          description: `Invoice ${orderId || id} status updated to ${requested}.`,
          entityType: 'invoice',
          entityId: id,
          actor: { uid: auth.user.uid, name: actorName },
          metadata: {
            ip: getClientIp(req),
            userAgent: req.headers.get('user-agent') || '',
          },
          audit: {
            action: 'update',
            resource: 'invoice',
            resourceId: id,
            changes: [{ field: 'status', oldValue: invoice.status || null, newValue: requested }],
          },
        });
      } catch (auditError) {
        console.error('audit log error:', auditError);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === 'void') {
      try {
        assertPermission(auth.user.role, Permission.MarkPaymentPaid);
      } catch {
        return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }

      const reason = parseString(body?.reason).trim();
      if (!reason) {
        return NextResponse.json(
          { ok: false, error: 'A void reason is required.' },
          { status: 400 },
        );
      }

      const currentStatus = normalizeInvoiceStatus(invoice.status);
      if (currentStatus === 'void') {
        return NextResponse.json({ ok: false, error: 'Invoice is already void.' }, { status: 400 });
      }

      // Ledger first (append-only): the void must never exist without its reversal entry.
      const ledgerEntryId = await writeInvoiceVoidLedgerEntry({
        tenantId: String(invoice.tenantId || tenantId || ''),
        invoice,
        invoiceId: id,
        reason,
        actor: { uid: auth.user.uid, name: auth.user.name || auth.user.fullName || '' },
      });

      await ref.update({
        status: 'void',
        voidedAt: serverTimestamp(),
        voidedBy: auth.user.uid,
        voidReason: reason,
        ledgerEntryId,
        updatedAt: serverTimestamp(),
      });

      await writeAuditLog({
        tenantId: auth.user.tenantId || null,
        actorUserId: auth.user.uid,
        actorName: auth.user.name || auth.user.fullName || '',
        actorRole: auth.user.role,
        actionType: 'invoice.voided',
        entityType: 'invoice',
        entityId: id,
        metadata: {
          orderId: invoice.orderId || id,
          previousStatus: currentStatus,
          reason,
          ledgerEntryId,
        },
      }).catch(() => undefined);

      return NextResponse.json({ ok: true, ledgerEntryId });
    }

    return NextResponse.json({ ok: false, error: 'Invalid action.' }, { status: 400 });
  } catch (err: any) {
    console.error('finance/invoices update error:', err);
    const rawMessage = String(err?.message || '');
    const isIndexError =
      rawMessage.includes('FAILED_PRECONDITION') ||
      rawMessage.toLowerCase().includes('index') ||
      rawMessage.toLowerCase().includes('indexes');
    const safeMessage = isIndexError ? 'Missing Firestore index.' : 'Unable to update invoice.';
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
