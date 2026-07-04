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
export type FinanceLedgerType = 'invoice_void';

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
