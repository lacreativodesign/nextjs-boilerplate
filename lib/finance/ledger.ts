import { adminDb } from '@/lib/firebaseAdmin';
import { FieldValue, type Transaction } from 'firebase-admin/firestore';

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
  | 'invoice.deleted'
  | 'invoice_void'
  | 'invoice.mark_paid'
  | 'invoice.payment_applied'
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

// ---------------------------------------------------------------------------
// Shared transactional finance-mutation service (E4b, audit finding #4).
//
// The invariant: no financial state may change without an append-only ledger
// entry landing in the SAME transaction. Routes that already batch their doc
// writes together with a buildFinanceLedgerEntry() call satisfy this by
// construction; this helper is the canonical way to add it to any path that
// mutates finance state, and it fails closed — if a caller commits a mutation
// without staging at least one ledger entry, the transaction throws instead of
// silently persisting an unaudited change.
// ---------------------------------------------------------------------------

export interface FinanceMutationContext {
  tx: Transaction;
  /**
   * Stage a ledger entry to be written atomically with this mutation. Must be
   * called at least once, or the transaction is rejected.
   */
  ledger: (params: WriteFinanceLedgerParams) => void;
}

/**
 * Runs `work` inside a Firestore transaction and guarantees an append-only
 * finance_ledger entry is written atomically with it. The caller stages doc
 * writes on `ctx.tx` and one or more ledger entries via `ctx.ledger(...)`.
 * Ledger docs are created with fresh ids inside the same transaction.
 */
export async function mutateFinanceInTransaction<T>(
  work: (ctx: FinanceMutationContext) => Promise<T>,
): Promise<T> {
  return adminDb.runTransaction(async (tx) => {
    const staged: WriteFinanceLedgerParams[] = [];
    const ctx: FinanceMutationContext = {
      tx,
      ledger: (params) => {
        staged.push(params);
      },
    };

    const result = await work(ctx);

    if (staged.length === 0) {
      // Fail closed: a finance mutation without an audit trail is not allowed.
      throw new Error(
        'mutateFinanceInTransaction: no ledger entry was staged — every finance mutation must record a finance_ledger entry.',
      );
    }

    for (const params of staged) {
      const ledgerRef = adminDb.collection('finance_ledger').doc();
      tx.set(ledgerRef, buildFinanceLedgerEntry(params));
    }

    return result;
  });
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
