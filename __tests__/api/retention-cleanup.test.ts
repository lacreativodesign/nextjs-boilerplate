import { FirestoreEmulator } from './test-utils/firestore-emulator';

/**
 * SOC2 F-03 regression suite.
 *
 * `runRetentionCleanup` queried `tenants/{tenantId}/{policy.collectionPath}` — a
 * subcollection that does not exist in this data model, since tenant data lives in
 * TOP-LEVEL collections carrying a `tenantId` field. Every run therefore scanned zero
 * documents, deleted nothing, and returned a success summary. The weekly compliance
 * report counted the policy as active, so the platform produced evidence for a
 * retention control that had never once executed.
 *
 * Three properties are asserted here:
 *   1. the query reaches the real collection, so the job stops being a silent no-op;
 *   2. deletion stays DISARMED until ERP_ENABLE_RETENTION_DELETION=true, so the fix
 *      cannot turn a no-op straight into bulk deletion with no observation window;
 *   3. `entityType` is an allowlist — a tenant admin cannot aim a delete policy at an
 *      arbitrary collection via the free-form `collectionPath` field.
 */

let db: FirestoreEmulator;

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => new Date('2026-01-01T00:00:00.000Z'),
  },
  Timestamp: {
    fromDate: (value: Date) => value,
  },
}));
jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return db;
  },
}));

const OLD = new Date('2020-01-01T00:00:00.000Z');
const NEW = new Date('2026-08-31T00:00:00.000Z');

function seed(policy: Record<string, unknown>) {
  return new FirestoreEmulator({
    'tenants/tenant_a/complianceRetentionPolicies': [{ id: 'pol_1', data: policy }],
    invoices: [
      { id: 'inv_old', data: { tenantId: 'tenant_a', createdAt: OLD, amountTotal: 100 } },
      { id: 'inv_new', data: { tenantId: 'tenant_a', createdAt: NEW, amountTotal: 200 } },
      { id: 'inv_other', data: { tenantId: 'tenant_b', createdAt: OLD, amountTotal: 300 } },
    ],
    users: [{ id: 'user_a', data: { tenantId: 'tenant_a', email: 'a@example.com' } }],
  });
}

const enabledPolicy = {
  tenantId: 'tenant_a',
  entityType: 'invoices',
  collectionPath: 'invoices',
  retentionDays: 30,
  action: 'delete',
  enabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  delete process.env.ERP_ENABLE_RETENTION_DELETION;
  jest.resetModules();
});

afterEach(() => {
  delete process.env.ERP_ENABLE_RETENTION_DELETION;
});

describe('runRetentionCleanup', () => {
  it('reaches the real top-level collection instead of a nonexistent subcollection', async () => {
    db = seed(enabledPolicy);
    const { runRetentionCleanup } = await import('@/lib/compliance/data-retention');

    const summary = await runRetentionCleanup('tenant_a');

    // The old subcollection query scanned 0. Anything above 0 proves the query lands.
    expect(summary.scanned).toBe(1);
    expect(summary.eligible).toBe(1);
  });

  it('is disarmed by default and deletes nothing without the env flag', async () => {
    db = seed(enabledPolicy);
    const { runRetentionCleanup } = await import('@/lib/compliance/data-retention');

    const summary = await runRetentionCleanup('tenant_a');

    expect(summary.dryRun).toBe(true);
    expect(summary.deleted).toBe(0);
    expect(db.getDoc('invoices', 'inv_old')).toBeTruthy();
  });

  it('deletes only past-cutoff documents of the caller tenant once armed', async () => {
    process.env.ERP_ENABLE_RETENTION_DELETION = 'true';
    db = seed(enabledPolicy);
    const { runRetentionCleanup } = await import('@/lib/compliance/data-retention');

    const summary = await runRetentionCleanup('tenant_a');

    expect(summary.dryRun).toBe(false);
    expect(summary.deleted).toBe(1);
    // Inside the cutoff, and another tenant's row, both survive.
    expect(db.getDoc('invoices', 'inv_new')).toBeTruthy();
    expect(db.getDoc('invoices', 'inv_other')).toBeTruthy();
  });

  it('refuses an entityType that is not an allowlisted retention target', async () => {
    process.env.ERP_ENABLE_RETENTION_DELETION = 'true';
    db = seed({ ...enabledPolicy, entityType: 'users', collectionPath: 'users' });
    const { runRetentionCleanup } = await import('@/lib/compliance/data-retention');

    const summary = await runRetentionCleanup('tenant_a');

    expect(summary.skipped).toHaveLength(1);
    expect(summary.skipped[0].entityType).toBe('users');
    expect(summary.deleted).toBe(0);
    // Scheduled erasure of user documents would orphan Firebase Auth accounts.
    expect(db.getDoc('users', 'user_a')).toBeTruthy();
  });
});
