import { adminDb } from '@/lib/firebaseAdmin';
import { buildFinanceLedgerEntry } from '@/lib/finance/ledger';
import { createNotifications, getUsersByRoles } from '@/lib/notifications';

export async function recordUnappliedClientPayment(params: {
  paymentId: string;
  eventId: string;
  tenantId: string;
  invoiceId: string;
  accountId: string;
  amount: number;
  currency: string;
  source: string;
  error: unknown;
}) {
  const paymentId = String(params.paymentId || '').trim();
  const tenantId = String(params.tenantId || '').trim();
  const invoiceId = String(params.invoiceId || '').trim();
  const reason =
    params.error instanceof Error
      ? params.error.message.slice(0, 1000)
      : String(params.error || 'Payment could not be reconciled.').slice(0, 1000);
  const nowIso = new Date().toISOString();

  if (!paymentId) {
    throw new Error('Unapplied payment evidence requires a payment id.');
  }

  const deadLetterRef = adminDb.collection('unapplied_client_payments').doc(paymentId);
  await adminDb.runTransaction(async (tx) => {
    tx.set(
      deadLetterRef,
      {
        paymentId,
        eventId: params.eventId,
        tenantId: tenantId || null,
        invoiceId: invoiceId || null,
        stripeConnectAccountId: params.accountId || null,
        amountUsd: params.amount,
        currency: String(params.currency || '').toUpperCase(),
        source: params.source,
        status: 'requires_finance_reconciliation',
        reason,
        lastSeenAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      { merge: true },
    );

    if (tenantId) {
      tx.set(
        adminDb.collection('finance_ledger').doc(`payment_unapplied_${paymentId}`),
        buildFinanceLedgerEntry({
          tenantId,
          type: 'payment.unapplied',
          paymentId,
          invoiceId,
          amountUsd: params.amount,
          previousStatus: 'captured',
          newStatus: 'requires_finance_reconciliation',
          method: 'stripe_checkout',
          reason,
          actor: { uid: 'system', name: 'Stripe Connect reconciliation' },
        }),
        { merge: true },
      );
    }
  });

  if (tenantId) {
    const recipients = await getUsersByRoles(['admin', 'super_admin', 'finance'], tenantId);
    await createNotifications({
      recipients,
      tenantId,
      type: 'warning',
      title: 'Captured payment needs reconciliation',
      message: invoiceId
        ? `Stripe captured payment ${paymentId} for invoice ${invoiceId}, but Bizosto could not apply it automatically.`
        : `Stripe captured payment ${paymentId}, but Bizosto could not bind it to an invoice automatically.`,
      entityType: 'payment',
      entityId: paymentId,
      deepLink: '/finance/payments',
    });
  }
}
