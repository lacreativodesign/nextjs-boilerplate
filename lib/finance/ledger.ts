import { adminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Append-only finance ledger.
 *
 * Financial records must be immutable after posting. Instead of editing or deleting
 * an invoice that received money, we void it and write a REVERSING ledger entry here.
 * This collection is append-only by contract: this module never updates or deletes an
 * entry, and Firestore rules must keep it server-SDK-write-only (client write:false).
 *
 * Entry shape:
 *   tenantId, invoiceId, orderId, clientId
 *   type            'invoice_void'  (a void that reverses recognized revenue)
 *   amountUsd       negative reversal of the amount previously paid (0 if nothing was paid)
 *   previousStatus  the invoice status at the moment of the void
 *   reason          mandatory human reason for the correction
 *   actorUid, actorName
 *   createdAt       server timestamp (immutable)
 */
export type FinanceLedgerType = 'invoice_void' | 'payment.succeeded' | 'credit_note.created';

export interface WriteFinanceLedgerParams {
  tenantId: string;
  type: FinanceLedgerType;
  invoiceId?: string;
  orderId?: string;
  clientId?: string;
  paymentId?: string;
  amountUsd?: number;
  previousStatus?: string;
  newStatus?: string;
  reason?: string;
  method?: string;
  actor: { uid: string; name?: string };
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

  const entry = {
    tenantId,
    invoiceId,
    orderId: String(invoice?.orderId || ''),
    clientId: String(invoice?.clientId || ''),
    type: 'invoice_void' as FinanceLedgerType,
    amountUsd: reversalUsd,
    previousStatus: String(invoice?.status || ''),
    reason,
    actorUid: actor.uid,
    actorName: actor.name || '',
    createdAt: FieldValue.serverTimestamp(),
  };

  const docRef = await adminDb.collection('finance_ledger').add(entry);
  return docRef.id;
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
