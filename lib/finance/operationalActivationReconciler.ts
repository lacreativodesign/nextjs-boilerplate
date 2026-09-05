import { adminDb } from '@/lib/firebaseAdmin';
import { recordSuccessfulClientPayment } from '@/lib/finance/clientPaymentActivation';
import { normalizePaymentStatus } from '@/lib/finance/status';

function dateMs(value: unknown) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function reconcilePendingPaymentActivations(limitPerState = 50) {
  const [pendingSnap, processingSnap] = await Promise.all([
    adminDb
      .collection('invoices')
      .where('operationalActivationState', '==', 'pending')
      .limit(limitPerState)
      .get(),
    adminDb
      .collection('invoices')
      .where('operationalActivationState', '==', 'processing')
      .limit(limitPerState)
      .get(),
  ]);

  const candidates = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const doc of [...pendingSnap.docs, ...processingSnap.docs]) {
    candidates.set(doc.id, doc);
  }

  let attempted = 0;
  let recovered = 0;
  let failed = 0;
  let skipped = 0;

  for (const invoiceDoc of candidates.values()) {
    const invoice = invoiceDoc.data() || {};
    if (invoice.projectId) {
      skipped += 1;
      continue;
    }

    if (
      String(invoice.operationalActivationState || '') === 'processing' &&
      dateMs(invoice.operationalActivationLeaseUntil) > Date.now()
    ) {
      skipped += 1;
      continue;
    }

    const tenantId = String(invoice.tenantId || '').trim();
    const paymentIds = Array.isArray(invoice.paymentIds)
      ? invoice.paymentIds.map((id: unknown) => String(id || '').trim()).filter(Boolean)
      : [];
    if (!tenantId || !paymentIds.length) {
      failed += 1;
      continue;
    }

    let successfulPayment: FirebaseFirestore.DocumentSnapshot | null = null;
    for (const paymentId of [...paymentIds].reverse()) {
      const snap = await adminDb.collection('payments').doc(paymentId).get();
      if (!snap.exists) continue;
      const payment = snap.data() || {};
      if (
        String(payment.tenantId || '').trim() === tenantId &&
        String(payment.invoiceId || '').trim() === invoiceDoc.id &&
        normalizePaymentStatus(payment.status) === 'succeeded'
      ) {
        successfulPayment = snap;
        break;
      }
    }

    if (!successfulPayment) {
      failed += 1;
      continue;
    }

    attempted += 1;
    const payment = successfulPayment.data() || {};
    try {
      const result = await recordSuccessfulClientPayment({
        invoiceId: invoiceDoc.id,
        tenantId,
        paymentId: successfulPayment.id,
        amount: Number(payment.amountUsd || 0),
        currency: String(payment.currency || invoice.currency || 'USD'),
        method: String(payment.method || 'reconciliation'),
        source: 'operational_activation_reconciliation',
        reason: 'Retry payment-triggered project/client operational activation.',
        stripePaymentIntentId: String(payment.stripePaymentIntentId || '') || null,
        actor: { uid: 'system', name: 'Payment activation reconciler' },
      });
      if (result.projectId) recovered += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      await invoiceDoc.ref.set(
        {
          operationalActivationState: 'pending',
          operationalActivationLastError:
            error instanceof Error ? error.message.slice(0, 500) : 'Reconciliation failed.',
          operationalActivationLastAttemptAt: new Date().toISOString(),
        },
        { merge: true },
      );
    }
  }

  return {
    candidates: candidates.size,
    attempted,
    recovered,
    failed,
    skipped,
  };
}
