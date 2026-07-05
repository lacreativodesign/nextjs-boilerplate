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
  parseString: (v: unknown) => (typeof v === 'string' ? v : ''),
  parseNumber: (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0),
  serverTimestamp: jest.fn(() => new Date('2025-01-01T00:00:00.000Z')),
}));
jest.mock('@/app/api/admin/_utils', () => ({ normalizeRole: (r: string) => r }));
jest.mock('@/app/lib/permissions', () => ({
  Permission: { MarkPaymentPaid: 'mark_payment_paid' },
  assertPermission: jest.fn(),
}));
jest.mock('@/lib/tenant/audit', () => ({ writeAuditLog: jest.fn(async () => undefined) }));
jest.mock('@/lib/tenant', () => ({
  docTenantId: (doc: any) => doc?.tenantId,
  normalizeTenantId: (t: string) => t,
}));

const URL = 'https://app.local/api/finance/credit-notes/create';

const ledgerEntries = async () =>
  (await db.collection('finance_ledger').limit(100).get()).docs.map((d) => d.data());

const clearCollections = async () => {
  for (const name of ['finance_ledger', 'credit_notes']) {
    const snap = await db.collection(name).limit(100).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
};

describe('credit notes — correction path for paid invoices (P0-4)', () => {
  beforeEach(async () => {
    await clearCollections();
    await db.collection('invoices').doc('inv_paid').set({
      tenantId: 'tenant_a',
      status: 'paid',
      orderId: 'ORD-PAID',
      clientId: 'client_a',
      amountTotalUsd: 500,
      totalPaid: 500,
    });
    await db.collection('invoices').doc('inv_sent').set({
      tenantId: 'tenant_a',
      status: 'sent',
      orderId: 'ORD-SENT',
      clientId: 'client_a',
      amountTotalUsd: 300,
      totalPaid: 0,
    });
    await db.collection('invoices').doc('inv_foreign').set({
      tenantId: 'tenant_b',
      status: 'paid',
      orderId: 'ORD-B',
      clientId: 'client_b',
      amountTotalUsd: 100,
      totalPaid: 100,
    });
  });

  it('requires a reason and a positive amount', async () => {
    const { POST } = await import('@/app/api/finance/credit-notes/create/route');
    const noReason = await POST(jsonRequest(URL, { invoiceId: 'inv_paid', amountUsd: 100 }));
    expect(noReason.status).toBe(400);

    const badAmount = await POST(
      jsonRequest(URL, { invoiceId: 'inv_paid', amountUsd: 0, reason: 'r' }),
    );
    expect(badAmount.status).toBe(400);
    expect(await ledgerEntries()).toHaveLength(0);
  });

  it('only paid invoices can receive credit notes', async () => {
    const { POST } = await import('@/app/api/finance/credit-notes/create/route');
    const res = await POST(
      jsonRequest(URL, { invoiceId: 'inv_sent', amountUsd: 50, reason: 'refund' }),
    );
    expect(res.status).toBe(400);
    expect(await ledgerEntries()).toHaveLength(0);
  });

  it('rejects amounts above what was paid and cross-tenant invoices', async () => {
    const { POST } = await import('@/app/api/finance/credit-notes/create/route');
    const tooMuch = await POST(
      jsonRequest(URL, { invoiceId: 'inv_paid', amountUsd: 600, reason: 'over' }),
    );
    expect(tooMuch.status).toBe(400);

    const foreign = await POST(
      jsonRequest(URL, { invoiceId: 'inv_foreign', amountUsd: 50, reason: 'cross' }),
    );
    expect(foreign.status).toBe(403);
    expect(await ledgerEntries()).toHaveLength(0);
  });

  it('creates the credit note with a negative ledger entry first, without touching the invoice', async () => {
    const { POST } = await import('@/app/api/finance/credit-notes/create/route');
    const res = await POST(
      jsonRequest(URL, { invoiceId: 'inv_paid', amountUsd: 150, reason: 'Partial service credit' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.creditNoteId).toBeTruthy();
    expect(body.ledgerEntryId).toBeTruthy();

    const entries = await ledgerEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('credit_note.created');
    expect(entries[0].amountUsd).toBe(-150);
    expect(entries[0].reason).toBe('Partial service credit');
    expect(entries[0].tenantId).toBe('tenant_a');

    const note = (await db.collection('credit_notes').doc(body.creditNoteId).get()).data() as any;
    expect(note.invoiceId).toBe('inv_paid');
    expect(note.amountUsd).toBe(150);
    expect(note.status).toBe('issued');
    expect(note.ledgerEntryId).toBe(body.ledgerEntryId);

    // Paid invoice remains untouched (immutability).
    const invoice = (await db.collection('invoices').doc('inv_paid').get()).data() as any;
    expect(invoice.status).toBe('paid');
    expect(invoice.totalPaid).toBe(500);
  });
});
