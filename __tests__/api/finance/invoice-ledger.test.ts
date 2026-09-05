import { FirestoreEmulator } from '../test-utils/firestore-emulator';
import { financeUser } from '../test-utils/auth';
import { jsonRequest } from '../test-utils/request';

const db = new FirestoreEmulator({});
const authUser = financeUser({ uid: 'fin_a', tenantId: 'tenant_a' });

jest.mock('@/lib/firebaseAdmin', () => ({ adminDb: db }));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => new Date('2025-01-01T00:00:00.000Z') },
}));
jest.mock('@/app/api/finance/_utils', () => ({
  requireFinance: jest.fn(async () => ({ ok: true, user: authUser })),
  createFinanceEvent: jest.fn(async () => undefined),
  queueFinanceEmail: jest.fn(async () => undefined),
  parseString: (v: unknown) => (typeof v === 'string' ? v : ''),
  serverTimestamp: jest.fn(() => new Date('2025-01-01T00:00:00.000Z')),
}));
jest.mock('@/app/api/admin/_utils', () => ({ normalizeRole: (r: string) => r }));
jest.mock('@/app/lib/permissions', () => ({
  Permission: { MarkPaymentPaid: 'mark_payment_paid' },
  assertPermission: jest.fn(),
}));
jest.mock('@/lib/notifications', () => ({
  createNotification: jest.fn(async () => undefined),
  getUserIdsByRoles: jest.fn(async () => []),
  getUsersByRoles: jest.fn(async () => []),
}));
jest.mock('@/lib/email/email-service', () => ({ sendEmail: jest.fn(async () => undefined) }));
jest.mock('@/lib/integrations/slack', () => ({
  sendBizostoEventNotification: jest.fn(async () => undefined),
}));
jest.mock('@/lib/tenant/audit', () => ({ writeAuditLog: jest.fn(async () => undefined) }));
jest.mock('@/lib/audit', () => ({ logEvent: jest.fn(async () => undefined) }));
jest.mock('@/lib/security', () => ({ getClientIp: jest.fn(() => '127.0.0.1') }));
jest.mock('@/lib/tenant', () => ({
  docTenantId: (doc: any) => doc?.tenantId,
  normalizeTenantId: (t: string) => t,
}));
jest.mock('@/lib/finance/invoiceActions', () => ({
  maybeAutoCreateProjectFromInvoice: jest.fn(async () => undefined),
}));
jest.mock('@/lib/finance/manualClientPayment', () => ({
  recordManualClientPayment: jest.fn(),
}));

const manualPaymentMock = jest.requireMock('@/lib/finance/manualClientPayment') as {
  recordManualClientPayment: jest.Mock;
};

const URL = 'https://app.local/api/finance/invoices/update';

const seedInvoice = async (id: string, data: Record<string, unknown>) => {
  await db
    .collection('invoices')
    .doc(id)
    .set({
      tenantId: 'tenant_a',
      isDeleted: false,
      orderId: `ORD-${id}`,
      clientId: 'client_a',
      amountTotalUsd: 500,
      totalPaid: 0,
      ...data,
    });
};

const ledgerEntries = async () =>
  (await db.collection('finance_ledger').limit(100).get()).docs.map((d) => d.data());

const clearLedger = async () => {
  const snap = await db.collection('finance_ledger').limit(100).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
};

describe('finance invoice ledger + paid immutability (P0-4)', () => {
  beforeEach(async () => {
    manualPaymentMock.recordManualClientPayment.mockReset();
    manualPaymentMock.recordManualClientPayment.mockImplementation(
      async ({ invoiceId }: { invoiceId: string }) => {
        if (invoiceId === 'inv_paid') throw new Error('Invoice is already paid.');
        return {
          paymentId: `manual_invoice_${invoiceId}_1`,
          newlyRecorded: true,
          invoiceId,
          tenantId: 'tenant_a',
          status: 'paid',
          previousStatus: 'issued',
          amountTotal: 500,
          amountPaid: 500,
          totalPaid: 500,
          balanceDue: 0,
          projectId: 'project_a',
        };
      },
    );

    await clearLedger();
    await seedInvoice('inv_sent', { status: 'sent' });
    await seedInvoice('inv_paid', { status: 'paid', totalPaid: 500 });
  });

  it('rejects mark_paid without a method and reason before the canonical adapter', async () => {
    const { POST } = await import('@/app/api/finance/invoices/update/route');
    const res = await POST(jsonRequest(URL, { id: 'inv_sent', action: 'mark_paid' }));
    expect(res.status).toBe(400);
    expect(manualPaymentMock.recordManualClientPayment).not.toHaveBeenCalled();

    const partial = await POST(
      jsonRequest(URL, { id: 'inv_sent', action: 'mark_paid', method: 'cash' }),
    );
    expect(partial.status).toBe(400);
    expect(manualPaymentMock.recordManualClientPayment).not.toHaveBeenCalled();
  });

  it('mark_paid delegates method, reason and invoice identity to the canonical payment adapter', async () => {
    const { POST } = await import('@/app/api/finance/invoices/update/route');
    const res = await POST(
      jsonRequest(URL, {
        id: 'inv_sent',
        action: 'mark_paid',
        method: 'bank transfer',
        reason: 'Client paid offline via wire',
      }),
    );
    expect(res.status).toBe(200);
    expect(manualPaymentMock.recordManualClientPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: 'inv_sent',
        tenantId: 'tenant_a',
        method: 'bank transfer',
        reason: 'Client paid offline via wire',
        source: 'finance_manual_invoice_payment',
        actor: expect.objectContaining({ uid: 'fin_a' }),
      }),
    );

    // The route itself no longer mutates money or writes an invoice.mark_paid ledger entry.
    // Those writes belong to recordSuccessfulClientPayment and are covered by the canonical
    // payment money-path contract tests.
    expect(await ledgerEntries()).toHaveLength(0);
  });

  it('surfaces canonical rejection when an already-paid invoice is submitted again', async () => {
    const { POST } = await import('@/app/api/finance/invoices/update/route');
    const res = await POST(
      jsonRequest(URL, { id: 'inv_paid', action: 'mark_paid', method: 'cash', reason: 'dup' }),
    );
    expect(res.status).toBe(400);
    expect(await ledgerEntries()).toHaveLength(0);
  });

  it('paid invoices are immutable via update_status', async () => {
    const { POST } = await import('@/app/api/finance/invoices/update/route');
    const res = await POST(
      jsonRequest(URL, { id: 'inv_paid', action: 'update_status', status: 'draft' }),
    );
    expect(res.status).toBe(400);
    const invoice = (await db.collection('invoices').doc('inv_paid').get()).data() as any;
    expect(invoice.status).toBe('paid');
  });

  it('update_status cannot void — the void action (with reason) is required', async () => {
    const { POST } = await import('@/app/api/finance/invoices/update/route');
    const res = await POST(
      jsonRequest(URL, { id: 'inv_sent', action: 'update_status', status: 'void' }),
    );
    expect(res.status).toBe(400);
  });

  it('void requires a reason', async () => {
    const { POST } = await import('@/app/api/finance/invoices/update/route');
    const res = await POST(jsonRequest(URL, { id: 'inv_sent', action: 'void' }));
    expect(res.status).toBe(400);
    expect(await ledgerEntries()).toHaveLength(0);
  });

  it('void with a reason voids the invoice and writes the reversal ledger entry first', async () => {
    const { POST } = await import('@/app/api/finance/invoices/update/route');
    const res = await POST(
      jsonRequest(URL, { id: 'inv_sent', action: 'void', reason: 'Duplicate invoice' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ledgerEntryId).toBeTruthy();

    const invoice = (await db.collection('invoices').doc('inv_sent').get()).data() as any;
    expect(invoice.status).toBe('void');
    expect(invoice.voidReason).toBe('Duplicate invoice');
    expect(invoice.ledgerEntryId).toBe(body.ledgerEntryId);

    const entries = await ledgerEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('invoice_void');
    expect(entries[0].reason).toBe('Duplicate invoice');
  });
});
