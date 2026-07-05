import { adminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Append-only finance ledger.
 *
 * Financial records must be immutable after posting. Every financial mutation —
 * creation, issue, edit, void, manual mark-paid, payments, refunds, credit
 * notes, adjustments — writes an entry here BEFORE (or atomically with) the
 * mutation itself, so no financial state can exist without its audit trail.
 *
 * This collection is append-only by contract: this module never updates or
 * deletes an entry, and Firestore rules must keep it server-SDK-write-only
 * (client write:false).
 *
 * NOTE: 'invoice_void' is the legacy spelling of invoice.voided kept for
 * continuity with entries already written in production; new void entries keep
 * using it so the collection stays queryable with one type string.
 */
export type FinanceLedgerType =
  | 'invoice.created'
  | 'invoice.issued'
  | 'invoice.updated'
  | 'invoice_void'
  | 'invoice.mark_paid'
  | 'payment.created'
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.refunded'
  | 'refund.created'
  | 'credit_note.created'
  | 'adjustment.created';

export interface WriteFinanceLedgerParams {
  tenantId: string;
  type: FinanceLedgerType;
  invoiceId?: string;
  orderId?: string;
  clientId?: string;
  paymentId?: string;
  /** Positive for money in, negative for reversals. */
  amountUsd?: number;
  previousStatus?: string;
  newStatus?: string;
  /** Mandatory for corrections (void, mark-paid, credit note, adjustment). */
  reason?: string;
  /** Payment method for manual mark-paid / recorded payments. */
  method?: string;
  actor: { uid: string; name?: string };
}

/**
 * Builds a ledger entry document without writing it. Use this with tx.set()
 * when the ledger entry must land atomically with the financial mutation
 * inside a Firestore transaction ("same transaction where practical").
 */
export function buildFinanceLedgerEntry(params: WriteFinanceLedgerParams) {
  return {
    tenantId: params.tenantId,
    type: params.type,
    invoiceId: params.invoiceId || '',
    orderId: params.orderId || '',
    clientId: params.clientId || '',
    paymentId: params.paymentId || '',
    amountUsd: Number(params.amountUsd || 0),
    previousStatus: params.previousStatus || '',
    newStatus: params.newStatus || '',
    reason: params.reason || '',
    method: params.method || '',
    actorUid: params.actor.uid,
    actorName: params.actor.name || '',
    createdAt: FieldValue.serverTimestamp(),
  };
}

export async function writeFinanceLedgerEntry(params: WriteFinanceLedgerParams): Promise<string> {
  const docRef = await adminDb.collection('finance_ledger').add(buildFinanceLedgerEntry(params));
  return docRef.id;
}

export interface WriteInvoiceVoidLedgerParams {
  tenantId: string;
  invoice: Record<string, any>;
  invoiceId: string;
  reason: string;
  actor: { uid: string; name?: string };
}

export async function writeInvoiceVoidLedgerEntry(
  params: WriteInvoiceVoidLedgerParams,
): Promise<string> {
  const { tenantId, invoice, invoiceId, reason, actor } = params;

  const paidUsd = Number(invoice?.totalPaid || 0);
  const reversalUsd = paidUsd > 0 ? -paidUsd : 0;

  return writeFinanceLedgerEntry({
    tenantId,
    type: 'invoice_void',
    invoiceId,
    orderId: String(invoice?.orderId || ''),
    clientId: String(invoice?.clientId || ''),
    amountUsd: reversalUsd,
    previousStatus: String(invoice?.status || ''),
    reason,
    actor,
  });
}
