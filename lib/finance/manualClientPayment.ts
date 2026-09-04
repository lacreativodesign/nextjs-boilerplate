import { adminDb } from '@/lib/firebaseAdmin';
import { normalizeInvoiceStatus, normalizePaymentStatus } from '@/lib/finance/status';
import { resolveAmountTotal, resolveTotalPaid } from '@/lib/finance/paymentSchedule';
import { recordSuccessfulClientPayment } from '@/lib/finance/clientPaymentActivation';

type PaymentActor = { uid: string; name?: string };

export type ManualClientPaymentInput = {
  invoiceId: string;
  tenantId: string;
  paymentId?: string | null;
  method?: string | null;
  reason: string;
  source: string;
  actor: PaymentActor;
};

function money(value: number) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2));
}

export function manualInvoicePaymentId(invoiceId: string) {
  return `manual_invoice_${String(invoiceId || '').trim()}`;
}

/**
 * Canonical adapter for an authorized human confirming an offline/manual client payment.
 *
 * - A supplied paymentId finalizes that existing payment record for its recorded amount.
 * - Without a paymentId, the remaining invoice balance is recorded using one deterministic
 *   id per invoice, making retries/double-clicks idempotent.
 * - The underlying recordSuccessfulClientPayment service remains the only writer that may
 *   apply client money to an invoice and activate the downstream project/portal workflow.
 */
export async function recordManualClientPayment(input: ManualClientPaymentInput) {
  const invoiceId = String(input.invoiceId || '').trim();
  const tenantId = String(input.tenantId || '').trim();
  const reason = String(input.reason || '').trim();
  const source = String(input.source || '').trim();
  let method = String(input.method || '').trim();

  if (!invoiceId || !tenantId) {
    throw new Error('Manual payment requires invoiceId and tenantId.');
  }
  if (!reason) {
    throw new Error('A reason is required to record a manual payment.');
  }
  if (!source) {
    throw new Error('Manual payment source is required.');
  }

  const invoiceSnap = await adminDb.collection('invoices').doc(invoiceId).get();
  if (!invoiceSnap.exists || invoiceSnap.data()?.isDeleted) {
    throw new Error('Invoice not found.');
  }

  const invoice = (invoiceSnap.data() || {}) as Record<string, unknown>;
  if (String(invoice.tenantId || '').trim() !== tenantId) {
    throw new Error('Invoice tenant mismatch.');
  }

  const paymentId = String(input.paymentId || manualInvoicePaymentId(invoiceId)).trim();
  let amount = 0;
  let currency = String(invoice.currency || 'USD')
    .trim()
    .toUpperCase();

  const paymentSnap = await adminDb.collection('payments').doc(paymentId).get();
  if (paymentSnap.exists) {
    const payment = paymentSnap.data() || {};
    if (
      String(payment.tenantId || '').trim() !== tenantId ||
      String(payment.invoiceId || '').trim() !== invoiceId
    ) {
      throw new Error('Payment id is already bound to another invoice.');
    }
    if (normalizePaymentStatus(payment.status) === 'refunded') {
      throw new Error('Refunded payments cannot be marked successful again.');
    }

    amount = money(Number(payment.amountUsd || 0));
    currency = String(payment.currency || currency)
      .trim()
      .toUpperCase();
    method = method || String(payment.method || '').trim();
  } else {
    const currentStatus = normalizeInvoiceStatus(invoice.status);
    if (currentStatus === 'void') {
      throw new Error('Void invoices cannot accept payments.');
    }
    const amountTotal = resolveAmountTotal(invoice);
    const totalPaid = Math.min(amountTotal, resolveTotalPaid(invoice));
    amount = money(Math.max(0, amountTotal - totalPaid));
  }

  if (amount <= 0) {
    throw new Error('Invoice has no outstanding payment amount to record.');
  }
  if (!method) {
    throw new Error('A payment method is required to record a manual payment.');
  }

  return recordSuccessfulClientPayment({
    invoiceId,
    tenantId,
    paymentId,
    amount,
    currency,
    method,
    source,
    reason,
    actor: input.actor,
  });
}
