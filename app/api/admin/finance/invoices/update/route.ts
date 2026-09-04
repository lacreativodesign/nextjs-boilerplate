import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  createFinanceEvent,
  queueFinanceEmail,
  requireAdmin,
  parseString,
  serverTimestamp,
} from '../../_utils';
import { createNotification, getUserIdsByRoles } from '@/lib/notifications';
import { logEvent } from '@/lib/audit';
import { getClientIp } from '@/lib/security';
import { assertPermission, Permission } from '../../../../../lib/permissions';
import { docTenantId, normalizeTenantId } from '@/lib/tenant';
import {
  computeBalanceDue,
  computeInvoiceStatus,
  normalizeInvoiceStatus,
  parseInvoiceStatus,
} from '@/lib/finance/status';
import { maybeAutoCreateProjectFromInvoice } from '@/lib/finance/invoiceActions';
import { normalizeRole } from '../../../_utils';
import { dispatchWebhookEvent } from '@/lib/webhooks/webhook-delivery';
import { writeFinanceLedgerEntry, writeInvoiceVoidLedgerEntry } from '@/lib/finance/ledger';

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

    if (action === 'send') {
      await ref.update({
        status: 'issued',
        issuedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const actorName = auth.user.name || auth.user.fullName || auth.user.displayName || '';
      const financeIds = await getUserIdsByRoles(
        ['finance', 'admin', 'super_admin'],
        auth.user.tenantId || null,
      );
      await Promise.all(
        financeIds.map((uid) =>
          createNotification({
            toUserId: uid,
            title: 'Invoice sent',
            body: `Invoice ${orderId || id} sent to ${clientName || 'client'}.`,
            type: 'info',
            entityType: 'invoice',
            entityId: id,
            deepLink: '/admin/finance/invoices',
            createdBy: { uid: auth.user.uid, name: actorName },
            roleTarget: 'finance',
            tenantId: auth.user.tenantId || null,
          }),
        ),
      );

      await createFinanceEvent({
        type: 'finance.invoice_sent',
        title: 'Invoice sent',
        description: `Invoice ${orderId || id} sent to ${clientName || 'client'}.`,
        entityType: 'invoice',
        entityId: id,
        createdByUid: auth.user.uid,
        createdByName: actorName,
        tenantId: auth.user.tenantId,
      });

      try {
        await logEvent({
          type: 'finance.invoice_sent',
          title: 'Invoice sent',
          description: `Invoice ${orderId || id} sent to ${clientName || 'client'}.`,
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
            changes: [
              { field: 'status', oldValue: invoice.status || null, newValue: 'issued' },
              {
                field: 'issuedAt',
                oldValue: invoice.issuedAt || null,
                newValue: 'serverTimestamp',
              },
            ],
          },
        });
      } catch (auditError) {
        console.error('audit log error:', auditError);
      }

      const clientSnap = clientId ? await adminDb.collection('clients').doc(clientId).get() : null;
      const email = clientSnap?.exists ? String(clientSnap.data()?.primaryContactEmail || '') : '';
      if (email) {
        queueFinanceEmail({
          to: email,
          template: 'invoice_sent',
          subject: 'Your invoice is ready',
          data: { invoiceId: id, orderId, clientName },
          tenantId: auth.user.tenantId,
        }).catch((error) => {
          console.error('invoice email queue error:', error);
        });
      }

      try {
        await dispatchWebhookEvent({
          tenantId,
          event: 'invoice.updated',
          entityType: 'invoice',
          entityId: id,
          payload: { invoiceId: id, orderId, status: 'issued', action: 'send' },
          actor: {
            uid: auth.user.uid,
            email: auth.user.email || null,
            role: auth.user.role || null,
          },
        });
      } catch (webhookError) {
        console.error('invoice.updated webhook dispatch error:', webhookError);
      }

      return NextResponse.json({ ok: true });
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
          source: 'admin_manual_invoice_payment',
          actor: { uid: auth.user.uid, name: actorName },
        });

        if (applied.newlyRecorded) {
          try {
            await dispatchWebhookEvent({
              tenantId: scopedTenantId,
              event: applied.status === 'paid' ? 'invoice.paid' : 'invoice.updated',
              entityType: 'invoice',
              entityId: id,
              payload: {
                invoiceId: id,
                orderId,
                status: applied.status,
                totalPaid: applied.totalPaid,
                balanceDue: applied.balanceDue,
                action: 'mark_paid',
              },
              actor: {
                uid: auth.user.uid,
                email: auth.user.email || null,
                role: auth.user.role || null,
              },
            });
            await dispatchWebhookEvent({
              tenantId: scopedTenantId,
              event: 'payment.received',
              entityType: 'payment',
              entityId: paymentId || `manual_invoice_${id}`,
              payload: {
                invoiceId: id,
                orderId,
                status: 'succeeded',
                amountPaid: applied.amountPaid,
                totalPaid: applied.totalPaid,
                balanceDue: applied.balanceDue,
              },
              actor: {
                uid: auth.user.uid,
                email: auth.user.email || null,
                role: auth.user.role || null,
              },
            });
          } catch (webhookError) {
            console.error('canonical invoice payment webhook dispatch error:', webhookError);
          }
        }

        return NextResponse.json({
          ok: true,
          invoiceStatus: applied.status,
          amountPaid: applied.amountPaid,
          totalPaid: applied.totalPaid,
          balanceDue: applied.balanceDue,
          projectId: applied.projectId,
          newlyRecorded: applied.newlyRecorded,
          deepLink: '/admin/finance/invoices',
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
        return NextResponse.json({ ok: false, error: 'Status is required.' }, { status: 400 });
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
        await logEvent({
          type: 'finance.invoice_status_updated',
          title: 'Invoice status updated',
          description: `Invoice ${orderId || id} status updated to ${requested}.`,
          entityType: 'invoice',
          entityId: id,
          actor: {
            uid: auth.user.uid,
            name: auth.user.name || auth.user.fullName || auth.user.displayName || '',
          },
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
      try {
        await dispatchWebhookEvent({
          tenantId,
          event: 'invoice.updated',
          entityType: 'invoice',
          entityId: id,
          payload: { invoiceId: id, orderId, status: requested, action: 'update_status' },
          actor: {
            uid: auth.user.uid,
            email: auth.user.email || null,
            role: auth.user.role || null,
          },
        });
      } catch (webhookError) {
        console.error('invoice.updated webhook dispatch error:', webhookError);
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

      // Append the immutable reversing ledger entry FIRST. If this write fails we abort
      // and never flip the invoice, so a void can never exist without its audit trail.
      const ledgerEntryId = await writeInvoiceVoidLedgerEntry({
        tenantId,
        invoice,
        invoiceId: id,
        reason,
        actor: {
          uid: auth.user.uid,
          name: auth.user.name || auth.user.fullName || auth.user.displayName || '',
        },
      });

      // Preserve all amounts for auditability; only the status and void metadata change.
      await ref.update({
        status: 'void',
        voidedAt: serverTimestamp(),
        voidedBy: auth.user.uid,
        voidReason: reason,
        voidLedgerEntryId: ledgerEntryId,
        updatedAt: serverTimestamp(),
      });

      try {
        await logEvent({
          type: 'finance.invoice_voided',
          title: 'Invoice voided',
          description: `Invoice ${orderId || id} voided. Reason: ${reason}`,
          entityType: 'invoice',
          entityId: id,
          actor: {
            uid: auth.user.uid,
            name: auth.user.name || auth.user.fullName || auth.user.displayName || '',
          },
          metadata: {
            ip: getClientIp(req),
            userAgent: req.headers.get('user-agent') || '',
          },
          audit: {
            action: 'update',
            resource: 'invoice',
            resourceId: id,
            changes: [
              { field: 'status', oldValue: invoice.status || null, newValue: 'void' },
              { field: 'voidReason', oldValue: null, newValue: reason },
            ],
          },
        });
      } catch (auditError) {
        console.error('audit log error:', auditError);
      }

      try {
        await dispatchWebhookEvent({
          tenantId,
          event: 'invoice.updated',
          entityType: 'invoice',
          entityId: id,
          payload: {
            invoiceId: id,
            orderId,
            status: 'void',
            action: 'void',
            reason,
            ledgerEntryId,
          },
          actor: {
            uid: auth.user.uid,
            email: auth.user.email || null,
            role: auth.user.role || null,
          },
        });
      } catch (webhookError) {
        console.error('invoice.voided webhook dispatch error:', webhookError);
      }

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
