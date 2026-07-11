import { FirestoreEmulator } from '../test-utils/firestore-emulator';
import { adminUser } from '../test-utils/auth';
import { jsonRequest } from '../test-utils/request';

/**
 * E4b — Shared transactional finance-mutation wrapper + FM-05 delete ledger.
 *
 * FM-05 gap: soft-deleting a draft/issued invoice removed it from AR with no
 * audit trail. This proves the delete route now writes an invoice.deleted
 * finance_ledger entry atomically, and that the wrapper fails closed when a
 * caller mutates finance state without recording a ledger entry.
 */

let db: FirestoreEmulator;
const authUser = adminUser({ uid: 'admin_a', tenantId: 'tenant_a' });

jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return db;
  },
}));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => new Date('2025-01-01T00:00:00.000Z') },
}));
jest.mock('@/app/api/admin/finance/_utils', () => ({
  requireAdmin: jest.fn(async () => ({ ok: true, user: authUser })),
  parseString: (v: unknown) => (typeof v === 'string' ? v : ''),
  serverTimestamp: jest.fn(() => new Date('2025-01-01T00:00:00.000Z')),
}));

import { POST as deleteInvoice } from '@/app/api/admin/finance/invoices/delete/route';
import { mutateFinanceInTransaction } from '@/lib/finance/ledger';

const URL = 'https://app.local/api/admin/finance/invoices/delete';

beforeEach(() => {
  db = new FirestoreEmulator({});
});

const ledgerEntries = async () =>
  (await db.collection('finance_ledger').limit(100).get()).docs.map((d: any) => d.data());

const seedInvoice = async (id: string, data: Record<string, unknown>) => {
  await db
    .collection('invoices')
    .doc(id)
    .set({
      tenantId: 'tenant_a',
      isDeleted: false,
      orderId: `ORD-${id}`,
      clientId: 'client_a',
      status: 'issued',
      ...data,
    });
};

describe('FM-05: invoice soft-delete writes a ledger entry (E4b)', () => {
  it('soft-deletes an issued invoice AND records invoice.deleted atomically', async () => {
    await seedInvoice('inv_1', { status: 'issued' });

    const res = await deleteInvoice(jsonRequest(URL, { id: 'inv_1' }));
    const body = await res.json();
    expect(body.ok).toBe(true);

    const invoice = (await db.collection('invoices').doc('inv_1').get()).data() as any;
    expect(invoice.isDeleted).toBe(true);

    const entries = await ledgerEntries();
    const deletedEntry = entries.find((e: any) => e.type === 'invoice.deleted');
    expect(deletedEntry).toBeDefined();
    expect(deletedEntry.invoiceId).toBe('inv_1');
    expect(deletedEntry.tenantId).toBe('tenant_a');
    expect(deletedEntry.previousStatus).toBe('issued');
    expect(deletedEntry.actorUid).toBe('admin_a');
  });

  it('still blocks deletion of paid invoices (no ledger entry, 409)', async () => {
    await seedInvoice('inv_paid', { status: 'paid' });

    const res = await deleteInvoice(jsonRequest(URL, { id: 'inv_paid' }));
    expect(res.status).toBe(409);

    const invoice = (await db.collection('invoices').doc('inv_paid').get()).data() as any;
    expect(invoice.isDeleted).toBe(false);
    const entries = await ledgerEntries();
    expect(entries.find((e: any) => e.invoiceId === 'inv_paid')).toBeUndefined();
  });
});

describe('mutateFinanceInTransaction fails closed (E4b)', () => {
  it('rejects a mutation that stages no ledger entry', async () => {
    await expect(
      mutateFinanceInTransaction(async ({ tx }) => {
        tx.set(db.collection('invoices').doc('inv_x') as any, { isDeleted: true }, { merge: true });
        // intentionally no ledger(...) call
      }),
    ).rejects.toThrow(/no ledger entry was staged/);
  });

  it('commits doc writes and the staged ledger entry together', async () => {
    await mutateFinanceInTransaction(async ({ tx, ledger }) => {
      tx.set(db.collection('invoices').doc('inv_y') as any, { status: 'issued' }, { merge: true });
      ledger({
        tenantId: 'tenant_a',
        type: 'invoice.created',
        invoiceId: 'inv_y',
        actor: { uid: 'admin_a' },
      });
    });

    const invoice = (await db.collection('invoices').doc('inv_y').get()).data() as any;
    expect(invoice.status).toBe('issued');
    const entries = await ledgerEntries();
    expect(entries.find((e: any) => e.invoiceId === 'inv_y' && e.type === 'invoice.created')).toBeDefined();
  });
});
