import { FirestoreEmulator, buildTenantSeed } from '../test-utils/firestore-emulator';
import { adminUser } from '../test-utils/auth';
import { jsonRequest } from '../test-utils/request';

const db = new FirestoreEmulator(buildTenantSeed());
const authUser = adminUser({ uid: 'admin_a', tenantId: 'tenant_a', role: 'admin' });

jest.mock('@/lib/firebaseAdmin', () => ({ adminDb: db }));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => new Date('2025-01-01T00:00:00.000Z') },
}));
jest.mock('@/app/api/admin/finance/_utils', () => ({
  requireAdmin: jest.fn(async () => ({ ok: true, user: authUser })),
  createFinanceEvent: jest.fn(),
  queueFinanceEmail: jest.fn(),
  parseString: (v: unknown) => (typeof v === 'string' ? v : ''),
  serverTimestamp: jest.fn(() => new Date('2025-01-01T00:00:00.000Z')),
}));
jest.mock('@/app/api/admin/_utils', () => ({ normalizeRole: (r: string) => r }));
jest.mock('@/app/lib/permissions', () => ({
  Permission: { MarkPaymentPaid: 'mark_payment_paid' },
  assertPermission: jest.fn(),
}));
jest.mock('@/lib/notifications', () => ({
  createNotification: jest.fn(),
  getUserIdsByRoles: jest.fn(async () => []),
}));
jest.mock('@/lib/audit', () => ({ logEvent: jest.fn(async () => undefined) }));
jest.mock('@/lib/security', () => ({ getClientIp: jest.fn(() => '127.0.0.1') }));
jest.mock('@/lib/tenant', () => ({
  docTenantId: (doc: any) => doc?.tenantId,
  normalizeTenantId: (t: string) => t,
}));
jest.mock('@/lib/finance/invoiceActions', () => ({ maybeAutoCreateProjectFromInvoice: jest.fn() }));
jest.mock('@/lib/webhooks/webhook-delivery', () => ({
  dispatchWebhookEvent: jest.fn(async () => undefined),
}));

describe('finance invoice void + ledger', () => {
  beforeAll(async () => {
    await db.collection('invoices').doc('inv_paid_a').set({
      tenantId: 'tenant_a',
      isDeleted: false,
      status: 'paid',
      orderId: 'ORD-PAID-A',
      clientId: 'client_a',
      amountTotalUsd: 500,
      totalPaid: 500,
    });
  });

  it('rejects a void with no reason', async () => {
    const { POST } = await import('@/app/api/admin/finance/invoices/update/route');
    const res = await POST(
      jsonRequest('https://app.local/api/admin/finance/invoices/update', {
        id: 'inv_paid_a',
        action: 'void',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('voids a paid invoice with a reason and writes a reversing ledger entry', async () => {
    const { POST } = await import('@/app/api/admin/finance/invoices/update/route');
    const res = await POST(
      jsonRequest('https://app.local/api/admin/finance/invoices/update', {
        id: 'inv_paid_a',
        action: 'void',
        reason: 'Duplicate payment recorded in error',
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(typeof body.ledgerEntryId).toBe('string');

    const invoiceDoc = await db.collection('invoices').doc('inv_paid_a').get();
    expect(invoiceDoc.data()?.status).toBe('void');
    expect(invoiceDoc.data()?.voidReason).toBe('Duplicate payment recorded in error');
    expect(invoiceDoc.data()?.amountTotalUsd).toBe(500);

    const ledger = await db.collection('finance_ledger').get();
    const entries = ledger.docs.map((d: any) => d.data());
    const reversal = entries.find((e: any) => e.invoiceId === 'inv_paid_a');
    expect(reversal).toBeTruthy();
    expect(reversal.type).toBe('invoice_void');
    expect(reversal.amountUsd).toBe(-500);
    expect(reversal.previousStatus).toBe('paid');
  });

  it('rejects voiding an already-void invoice', async () => {
    const { POST } = await import('@/app/api/admin/finance/invoices/update/route');
    const res = await POST(
      jsonRequest('https://app.local/api/admin/finance/invoices/update', {
        id: 'inv_paid_a',
        action: 'void',
        reason: 'second attempt',
      }),
    );
    expect(res.status).toBe(400);
  });
});
