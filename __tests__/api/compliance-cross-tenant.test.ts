import { FirestoreEmulator } from './test-utils/firestore-emulator';
import { jsonRequest } from './test-utils/request';

/**
 * SOC2 F-01 / F-02 regression suite.
 *
 * `subjectUserId` arrives from the request body on both DSAR routes, gated only
 * by a tenant-admin role check. Before this fix neither `createDataExportRequest`
 * nor `createDataDeletionRequest` verified that the subject belonged to the
 * caller's tenant, so a tenant-A admin could export a tenant-B user's profile and
 * operational records, or permanently delete their user document.
 *
 * Attacker model: a fully authenticated admin of tenant_a presents a VALID uid
 * belonging to tenant_b and must be refused — with 404, not 403, because
 * confirming the uid exists elsewhere is itself a cross-tenant disclosure.
 */

let db: FirestoreEmulator;

const adminA = { uid: 'admin_a', tenantId: 'tenant_a', role: 'admin', email: 'a@example.com' };
const getCurrentUser = jest.fn(async () => adminA);

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
jest.mock('@/app/api/admin/_utils', () => ({
  getCurrentUser: () => getCurrentUser(),
}));

function seed() {
  return new FirestoreEmulator({
    users: [
      {
        id: 'user_a',
        data: { tenantId: 'tenant_a', email: 'member-a@example.com', displayName: 'Member A' },
      },
      {
        id: 'user_b',
        data: { tenantId: 'tenant_b', email: 'member-b@example.com', displayName: 'Member B' },
      },
    ],
    invoices: [{ id: 'inv_b', data: { tenantId: 'tenant_b', userId: 'user_b', amountTotal: 900 } }],
  });
}

beforeEach(() => {
  db = seed();
  jest.clearAllMocks();
});

describe('POST /api/compliance/export-data', () => {
  it('refuses to export a subject belonging to another tenant', async () => {
    const { POST } = await import('@/app/api/compliance/export-data/route');

    const res = await POST(
      jsonRequest('http://localhost/api/compliance/export-data', {
        subjectUserId: 'user_b',
        format: 'json',
      }),
    );

    expect(res.status).toBe(404);
    // No export request record may be written for a cross-tenant attempt.
    expect(db.getCollectionDocs('tenants/tenant_a/complianceDataExportRequests')).toHaveLength(0);
    // The other tenant's invoice must not appear anywhere in the response body.
    expect(await res.text()).not.toContain('inv_b');
  });

  it('exports a subject belonging to the caller tenant', async () => {
    const { POST } = await import('@/app/api/compliance/export-data/route');

    const res = await POST(
      jsonRequest('http://localhost/api/compliance/export-data', {
        subjectUserId: 'user_a',
        format: 'json',
      }),
    );

    expect(res.status).toBe(200);
    const payload = JSON.parse(await res.text());
    expect(payload.metadata.tenantId).toBe('tenant_a');
    expect(payload.user.id).toBe('user_a');
  });
});

describe('POST /api/compliance/delete-data', () => {
  it('refuses to erase a subject belonging to another tenant', async () => {
    const { POST } = await import('@/app/api/compliance/delete-data/route');

    const res = await POST(
      jsonRequest('http://localhost/api/compliance/delete-data', {
        subjectUserId: 'user_b',
        mode: 'delete',
      }),
    );

    expect(res.status).toBe(404);
    // The victim's user document must still exist, untouched.
    expect(db.getDoc('users', 'user_b')).toMatchObject({ tenantId: 'tenant_b' });
    expect(db.getCollectionDocs('tenants/tenant_a/complianceDataDeletionRequests')).toHaveLength(0);
  });

  it('anonymizes a subject belonging to the caller tenant', async () => {
    const { POST } = await import('@/app/api/compliance/delete-data/route');

    const res = await POST(
      jsonRequest('http://localhost/api/compliance/delete-data', {
        subjectUserId: 'user_a',
        mode: 'anonymize',
      }),
    );

    expect(res.status).toBe(202);
    expect(db.getDoc('users', 'user_a')).toMatchObject({ piiRedacted: true });
  });
});
