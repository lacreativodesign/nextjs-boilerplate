import { adminDb } from '@/lib/firebaseAdmin';
import { recordSuccessfulClientPayment } from '@/lib/finance/clientPaymentActivation';

const TENANT = 'emulator-tenant';
const ACTOR = { uid: 'system:test', name: 'Firestore emulator' };

async function clearCollection(name: string) {
  for (;;) {
    const snap = await adminDb.collection(name).limit(400).get();
    if (snap.empty) return;
    const batch = adminDb.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function resetDb() {
  for (const collection of [
    'invoices',
    'payments',
    'finance_ledger',
    'projects',
    'clients',
    'deals',
    'audit_logs',
    'notifications',
    'emails',
  ]) {
    await clearCollection(collection);
  }
}

async function seedInvoice(params: {
  id: string;
  amount?: number;
  paymentPlan?: 'full' | 'fifty_fifty';
  type?: string;
  clientId?: string;
  dealId?: string;
}) {
  const amount = params.amount ?? 100;
  await adminDb.collection('invoices').doc(params.id).set({
    tenantId: TENANT,
    orderId: `ORD-${params.id}`,
    clientId: params.clientId || '',
    dealId: params.dealId || '',
    type: params.type || 'other',
    currency: 'USD',
    amountTotal: amount,
    amountTotalUsd: amount,
    totalPaid: 0,
    paidAmount: 0,
    balanceDue: amount,
    status: 'issued',
    paymentPlan: params.paymentPlan || 'full',
    paymentIds: [],
  });
}

async function record(params: {
  invoiceId: string;
  paymentId: string;
  amount: number;
  method?: string;
}) {
  return recordSuccessfulClientPayment({
    invoiceId: params.invoiceId,
    tenantId: TENANT,
    paymentId: params.paymentId,
    amount: params.amount,
    currency: 'USD',
    method: params.method || 'bank_transfer',
    source: 'emulator_test',
    reason: 'Behavioral payment-engine invariant test.',
    actor: ACTOR,
  });
}

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('This suite must run against the Firestore emulator.');
  }
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await resetDb();
});

describe('canonical client payment engine — Firestore emulator', () => {
  it('finalizes pending and failed payments, replays succeeded idempotently, and rejects refunded', async () => {
    for (const initialStatus of ['pending', 'failed'] as const) {
      const invoiceId = `state-${initialStatus}`;
      const paymentId = `payment-${initialStatus}`;
      await seedInvoice({ id: invoiceId });
      await adminDb.collection('payments').doc(paymentId).set({
        tenantId: TENANT,
        invoiceId,
        amountUsd: 100,
        currency: 'USD',
        status: initialStatus,
        method: 'bank_transfer',
        source: 'manual_seed',
      });

      const first = await record({ invoiceId, paymentId, amount: 100 });
      expect(first.newlyRecorded).toBe(true);
      expect(first.status).toBe('paid');
      expect(first.totalPaid).toBe(100);

      const replay = await record({ invoiceId, paymentId, amount: 100 });
      expect(replay.newlyRecorded).toBe(false);
      expect(replay.totalPaid).toBe(100);

      const invoice = (await adminDb.collection('invoices').doc(invoiceId).get()).data() || {};
      expect(invoice.totalPaid).toBe(100);
      expect(invoice.balanceDue).toBe(0);
    }

    await seedInvoice({ id: 'state-refunded' });
    await adminDb.collection('payments').doc('payment-refunded').set({
      tenantId: TENANT,
      invoiceId: 'state-refunded',
      amountUsd: 100,
      currency: 'USD',
      status: 'refunded',
      method: 'bank_transfer',
      source: 'manual_seed',
    });

    await expect(
      record({ invoiceId: 'state-refunded', paymentId: 'payment-refunded', amount: 100 }),
    ).rejects.toThrow('Refunded payments cannot be marked successful again');
  });

  it('applies 50/50 installments to one invoice and creates exactly one project', async () => {
    await adminDb.collection('clients').doc('client-50').set({
      tenantId: TENANT,
      companyName: '50/50 Client',
      primaryContactEmail: '',
    });
    await adminDb.collection('deals').doc('deal-50').set({
      tenantId: TENANT,
      orderId: 'ORD-fifty',
      dealName: '50/50 Service',
      clientId: 'client-50',
    });
    await seedInvoice({
      id: 'fifty',
      amount: 100,
      paymentPlan: 'fifty_fifty',
      type: 'service',
      clientId: 'client-50',
      dealId: 'deal-50',
    });

    const first = await record({ invoiceId: 'fifty', paymentId: 'fifty-1', amount: 50 });
    expect(first.status).toBe('partially_paid');
    expect(first.totalPaid).toBe(50);
    expect(first.balanceDue).toBe(50);
    expect(first.projectId).toBeTruthy();

    const firstInvoice = (await adminDb.collection('invoices').doc('fifty').get()).data() || {};
    expect(firstInvoice.projectId).toBe(first.projectId);

    const second = await record({ invoiceId: 'fifty', paymentId: 'fifty-2', amount: 50 });
    expect(second.status).toBe('paid');
    expect(second.totalPaid).toBe(100);
    expect(second.balanceDue).toBe(0);
    expect(second.projectId).toBe(first.projectId);

    const projects = await adminDb
      .collection('projects')
      .where('tenantId', '==', TENANT)
      .where('dealId', '==', 'deal-50')
      .get();
    expect(projects.size).toBe(1);
  });

  it('serializes two concurrent identical successes without double money or ledger entries', async () => {
    await seedInvoice({ id: 'concurrent', amount: 100 });

    const [a, b] = await Promise.all([
      record({ invoiceId: 'concurrent', paymentId: 'same-payment', amount: 100 }),
      record({ invoiceId: 'concurrent', paymentId: 'same-payment', amount: 100 }),
    ]);

    expect([a.newlyRecorded, b.newlyRecorded].sort()).toEqual([false, true]);

    const invoice = (await adminDb.collection('invoices').doc('concurrent').get()).data() || {};
    expect(invoice.totalPaid).toBe(100);
    expect(invoice.balanceDue).toBe(0);
    expect(invoice.paymentIds).toEqual(['same-payment']);

    const payment = await adminDb.collection('payments').doc('same-payment').get();
    expect(payment.exists).toBe(true);
    expect(payment.data()?.status).toBe('succeeded');

    const successLedger = await adminDb
      .collection('finance_ledger')
      .doc('payment_succeeded_same-payment')
      .get();
    const applyLedger = await adminDb
      .collection('finance_ledger')
      .doc('invoice_payment_same-payment')
      .get();
    expect(successLedger.exists).toBe(true);
    expect(applyLedger.exists).toBe(true);
  });
});
