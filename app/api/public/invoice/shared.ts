import { adminDb } from "@/lib/firebaseAdmin";

export type PublicInvoiceData = {
  id: string;
  tenantId: string;
  clientId?: string;
  orderId: string;
  amount: number;
  subtotal: number | null;
  taxAmount: number;
  currency: string;
  status: string;
  dueDate: string | null;
  lineItems: Array<{ description?: string; name?: string; quantity?: number; qty?: number; unitPrice?: number; unitPriceUsd?: number; total?: number }>;
  notes: string | null;
  paidAt: string | null;
};

export function normalizeInvoiceAmount(invoice: Record<string, unknown>): number {
  const amount = Number(invoice.amount ?? invoice.totalAmount ?? invoice.amountTotal ?? invoice.amountTotalUsd ?? 0);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

export function isCancelledInvoice(status: string): boolean {
  const token = status.trim().toLowerCase();
  return token === "cancelled" || token === "canceled" || token === "void";
}

export async function getInvoiceWithValidation(invoiceId: string, token?: string | null) {
  const invoiceSnap = await adminDb.collection("invoices").doc(invoiceId).get();
  if (!invoiceSnap.exists) {
    return { error: "Invoice not found", status: 404 as const };
  }

  const invoice = (invoiceSnap.data() || {}) as Record<string, unknown>;
  if (invoice.isDeleted === true) {
    return { error: "Invoice not found", status: 404 as const };
  }

  if (token) {
    const storedToken = String(invoice.paymentToken || invoice.publicToken || "").trim();
    if (storedToken && storedToken !== token.trim()) {
      return { error: "Invoice not found", status: 404 as const };
    }
  }

  const status = String(invoice.status || "draft");
  if (isCancelledInvoice(status)) {
    return { error: "Invoice not found", status: 404 as const };
  }

  const amount = normalizeInvoiceAmount(invoice);
  const subtotalRaw = invoice.subtotal ?? invoice.amountSubtotal ?? invoice.amountSubtotalUsd;
  const subtotalNum = Number(subtotalRaw);
  const taxNum = Number(invoice.taxAmount ?? invoice.amountTax ?? invoice.amountTaxUsd ?? 0);

  const payload: PublicInvoiceData = {
    id: invoiceId,
    tenantId: String(invoice.tenantId || ""),
    clientId: invoice.clientId ? String(invoice.clientId) : undefined,
    orderId: String(invoice.orderId || invoiceId),
    amount,
    subtotal: Number.isFinite(subtotalNum) ? subtotalNum : null,
    taxAmount: Number.isFinite(taxNum) ? taxNum : 0,
    currency: String(invoice.currency || "USD").toUpperCase(),
    status,
    dueDate: invoice.dueDate ? String(invoice.dueDate) : null,
    lineItems: Array.isArray(invoice.lineItems) ? (invoice.lineItems as PublicInvoiceData["lineItems"]) : [],
    notes: invoice.notes ? String(invoice.notes) : null,
    paidAt: invoice.paidAt ? String(invoice.paidAt) : null,
  };

  return { invoice, payload };
}

export async function getTenantRecord(tenantId: string) {
  const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
  if (!tenantSnap.exists) {
    return null;
  }
  return (tenantSnap.data() || {}) as Record<string, unknown>;
}

export async function getClientRecord(clientId?: string) {
  if (!clientId) return null;
  const clientSnap = await adminDb.collection("clients").doc(clientId).get();
  if (!clientSnap.exists) return null;
  return (clientSnap.data() || {}) as Record<string, unknown>;
}
