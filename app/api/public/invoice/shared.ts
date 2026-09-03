import { adminDb } from '@/lib/firebaseAdmin';
import { resolveAmountTotal, resolveInvoicePaymentSchedule } from '@/lib/finance/paymentSchedule';

export type PublicInvoiceData = {
  id: string;
  tenantId: string;
  clientId?: string;
  orderId: string;
  amount: number;
  totalPaid: number;
  balanceDue: number;
  payableNow: number;
  paymentPlan: 'full' | 'fifty_fifty';
  installmentSequence: number;
  firstInstallmentAmount: number;
  secondInstallmentAmount: number;
  balanceTriggerType: string | null;
  balanceDueDate: string | null;
  balanceMilestoneStage: string | null;
  subtotal: number | null;
  taxAmount: number;
  currency: string;
  status: string;
  dueDate: string | null;
  lineItems: Array<{
    description?: string;
    name?: string;
    quantity?: number;
    qty?: number;
    unitPrice?: number;
    unitPriceUsd?: number;
    total?: number;
  }>;
  notes: string | null;
  paidAt: string | null;
};

function normalizeDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeInvoiceAmount(invoice: Record<string, unknown>): number {
  return resolveAmountTotal(invoice);
}

export function isCancelledInvoice(status: string): boolean {
  const token = status.trim().toLowerCase();
  return token === 'cancelled' || token === 'canceled' || token === 'void';
}

export async function getInvoiceWithValidation(invoiceId: string, token?: string | null) {
  const invoiceSnap = await adminDb.collection('invoices').doc(invoiceId).get();
  if (!invoiceSnap.exists) {
    return { error: 'Invoice not found', status: 404 as const };
  }

  const invoice = (invoiceSnap.data() || {}) as Record<string, unknown>;
  if (invoice.isDeleted === true) {
    return { error: 'Invoice not found', status: 404 as const };
  }

  const providedToken = String(token || '').trim();
  const storedToken = String(invoice.paymentToken || invoice.publicToken || '').trim();
  if (!storedToken || !providedToken || storedToken !== providedToken) {
    return { error: 'Invoice not found', status: 404 as const };
  }

  const status = String(invoice.status || 'draft');
  if (isCancelledInvoice(status)) {
    return { error: 'Invoice not found', status: 404 as const };
  }

  const schedule = resolveInvoicePaymentSchedule(invoice);
  const subtotalRaw = invoice.subtotal ?? invoice.amountSubtotal ?? invoice.amountSubtotalUsd;
  const subtotalNum = Number(subtotalRaw);
  const taxNum = Number(invoice.taxAmount ?? invoice.amountTax ?? invoice.amountTaxUsd ?? 0);

  const payload: PublicInvoiceData = {
    id: invoiceId,
    tenantId: String(invoice.tenantId || ''),
    clientId: invoice.clientId ? String(invoice.clientId) : undefined,
    orderId: String(invoice.orderId || invoiceId),
    amount: schedule.amountTotal,
    totalPaid: schedule.totalPaid,
    balanceDue: schedule.balanceDue,
    payableNow: schedule.payableNow,
    paymentPlan: schedule.paymentPlan,
    installmentSequence: schedule.installmentSequence,
    firstInstallmentAmount: schedule.firstInstallmentAmount,
    secondInstallmentAmount: schedule.secondInstallmentAmount,
    balanceTriggerType: invoice.balanceTriggerType ? String(invoice.balanceTriggerType) : null,
    balanceDueDate: normalizeDate(invoice.balanceDueDate),
    balanceMilestoneStage: invoice.balanceMilestoneStage
      ? String(invoice.balanceMilestoneStage)
      : null,
    subtotal: Number.isFinite(subtotalNum) ? subtotalNum : null,
    taxAmount: Number.isFinite(taxNum) ? taxNum : 0,
    currency: String(invoice.currency || 'USD').toUpperCase(),
    status,
    dueDate: normalizeDate(invoice.dueDate),
    lineItems: Array.isArray(invoice.lineItems)
      ? (invoice.lineItems as PublicInvoiceData['lineItems'])
      : [],
    notes: invoice.notes ? String(invoice.notes) : null,
    paidAt: normalizeDate(invoice.paidAt),
  };

  return { invoice, payload };
}

export async function getTenantRecord(tenantId: string) {
  const tenantSnap = await adminDb.collection('tenants').doc(tenantId).get();
  if (!tenantSnap.exists) {
    return null;
  }
  return (tenantSnap.data() || {}) as Record<string, unknown>;
}

export async function getClientRecord(clientId?: string) {
  if (!clientId) return null;
  const clientSnap = await adminDb.collection('clients').doc(clientId).get();
  if (!clientSnap.exists) return null;
  return (clientSnap.data() || {}) as Record<string, unknown>;
}
