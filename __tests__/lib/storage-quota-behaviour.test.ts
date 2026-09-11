/**
 * PR4 — behavioural coverage for the storage quota layer.
 *
 * The concurrency invariants are proven against the real Firestore emulator in
 * __tests__/integration/storage-quota-concurrency.emulator.test.ts, which cannot run in
 * the default unit environment. This suite drives the same modules end to end against an
 * in-test Firestore double so that every decision branch — the ceiling, the boundary, the
 * idempotent retry, the expiry sweep, the denial path, the measurement failure, the
 * orphan cleanup — executes here too, and so the quota layer is measured rather than
 * merely asserted about.
 *
 * The double is local on purpose: the shared __tests__/api/test-utils/firestore-emulator
 * models neither aggregate queries nor subcollections, and widening it would change a
 * fixture many certified suites depend on.
 */

import { FakeDb } from './test-utils/firestore-quota-double';

let db: FakeDb;
const getMetadata = jest.fn();
const deleteObject = jest.fn();

jest.mock('firebase-admin/firestore', () => ({
  AggregateField: { sum: (field: string) => ({ __sum: field }) },
}));

jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return db;
  },
  get adminStorage() {
    return {
      bucket: () => ({
        file: (storagePath: string) => ({
          getMetadata: () => getMetadata(storagePath),
          delete: (options?: unknown) => deleteObject(storagePath, options),
        }),
      }),
    };
  },
}));

import {
  getTenantStorageUsage,
  normalizeBytes,
  storageLimitForPlan,
  storageLimitResponseBody,
  totalStorageBytes,
  STORAGE_LIMIT_EXCEEDED,
} from '@/lib/billing/storage-limit';
import {
  releaseTenantStorage,
  reserveTenantStorage,
  reserveTenantStorageOrThrow,
  StorageLimitExceededError,
  STORAGE_RESERVATION_TTL_MS,
} from '@/lib/billing/storage-reservation';
import { deleteTenantObject, getVerifiedTenantObjectSize } from '@/lib/storage/tenant-object';
import {
  admitTenantUpload,
  releaseUploadAdmission,
  uploadAdmissionRefusal,
  uploadAdmissionResponseBody,
} from '@/lib/billing/upload-admission';
import { purgeRecordStorageObject } from '@/lib/storage/tenant-object';

const GB = 1024 ** 3;
const STARTER_LIMIT = 20 * GB;
const TENANT = 'tenant_a';
const OTHER = 'tenant_b';
const PATH = `tenants/${TENANT}/client-files/p1/f1_a.pdf`;

const reservationsPath = (tenantId: string) => `tenant_storage_ledgers/${tenantId}/reservations`;

function seedPlan(tenantId: string, plan: string) {
  db.seed('tenants', [[tenantId, { plan }]]);
}

function seedDocumentBytes(tenantId: string, bytes: number, id = `doc_${bytes}_${tenantId}`) {
  db.seed('documents', [[id, { tenantId, fileSize: bytes, deletedAt: null }]]);
}

beforeEach(() => {
  db = new FakeDb();
  getMetadata.mockReset();
  deleteObject.mockReset();
  deleteObject.mockResolvedValue(undefined);
  seedPlan(TENANT, 'starter');
  seedPlan(OTHER, 'pro');
});

describe('PR4: byte coercion and plan ceilings', () => {
  it('coerces any caller value to a safe non-negative integer', () => {
    expect(normalizeBytes(10.9)).toBe(10);
    expect(normalizeBytes('2048')).toBe(2048);
    expect(normalizeBytes(-5)).toBe(0);
    expect(normalizeBytes(Number.NaN)).toBe(0);
    expect(normalizeBytes(undefined)).toBe(0);
  });

  it('resolves each sold tier from the canonical catalog', () => {
    expect(storageLimitForPlan('starter')).toBe(STARTER_LIMIT);
    expect(storageLimitForPlan('pro')).toBe(75 * GB);
    expect(storageLimitForPlan('enterprise')).toBe(250 * GB);
    expect(storageLimitForPlan('trial')).toBe(STARTER_LIMIT);
  });

  it('falls back to the smallest tier on an unknown plan, never to unlimited', () => {
    expect(storageLimitForPlan('mystery' as never)).toBe(STARTER_LIMIT);
  });

  it('sums aggregate snapshots and ignores unusable totals', () => {
    const snap = (total: unknown) => ({ data: () => ({ total }) }) as any;
    expect(totalStorageBytes([snap(10), snap(5)])).toBe(15);
    expect(totalStorageBytes([snap(null), snap(-3), snap(Number.NaN)])).toBe(0);
  });
});

describe('PR4: canonical usage counts every billable surface', () => {
  it('sums files, HR documents, managed versions and the document library', async () => {
    db.seed('files', [['f1', { tenantId: TENANT, size: 1 * GB, isDeleted: false }]]);
    db.seed('employeeDocuments', [['e1', { tenantId: TENANT, size: 2 * GB, isDeleted: false }]]);
    db.seed('erp_file_versions', [
      ['v1', { tenantId: TENANT, size: 3 * GB }],
      ['v2', { tenantId: TENANT, size: 4 * GB }],
    ]);
    seedDocumentBytes(TENANT, 5 * GB);

    expect(await getTenantStorageUsage(TENANT)).toBe(15 * GB);
  });

  it('excludes soft-deleted records under either convention', async () => {
    db.seed('files', [
      ['live', { tenantId: TENANT, size: 1 * GB, isDeleted: false }],
      ['gone', { tenantId: TENANT, size: 9 * GB, isDeleted: true }],
    ]);
    db.seed('documents', [
      ['live', { tenantId: TENANT, fileSize: 2 * GB, deletedAt: null }],
      ['gone', { tenantId: TENANT, fileSize: 7 * GB, deletedAt: new Date() }],
    ]);

    expect(await getTenantStorageUsage(TENANT)).toBe(3 * GB);
  });

  it('never counts another tenant’s bytes', async () => {
    seedDocumentBytes(OTHER, 12 * GB);
    expect(await getTenantStorageUsage(TENANT)).toBe(0);
    expect(await getTenantStorageUsage(OTHER)).toBe(12 * GB);
  });
});

describe('PR4: the refusal contract', () => {
  it('carries a stable code and this tenant’s own figures only', () => {
    const body = storageLimitResponseBody({
      ok: false,
      limit: STARTER_LIMIT,
      used: 19 * GB,
      incoming: 2 * GB,
      plan: 'starter',
    });
    expect(body.error).toBe(STORAGE_LIMIT_EXCEEDED);
    expect(body.limit).toBe(STARTER_LIMIT);
    expect(body.used).toBe(19 * GB);
    expect(body.incoming).toBe(2 * GB);
    expect(body.message).toMatch(/upgrade your plan/i);
  });
});

describe('PR4: reservations admit, deny and account correctly', () => {
  const reserve = (bytes: number, tenantId = TENANT, idempotencyKey?: string) =>
    reserveTenantStorage({ tenantId, bytes, kind: 'document_upload', idempotencyKey });

  it('admits an upload that lands exactly on the ceiling', async () => {
    seedDocumentBytes(TENANT, STARTER_LIMIT - 1024);
    const result = await reserve(1024);

    expect(result.ok).toBe(true);
    expect(result.used).toBe(STARTER_LIMIT);
    expect(result.bytes).toBe(1024);
    expect(result.reservationId).toEqual(expect.any(String));
    expect(db.bucket(reservationsPath(TENANT)).size).toBe(1);
  });

  it('denies one byte over the ceiling and writes nothing', async () => {
    seedDocumentBytes(TENANT, STARTER_LIMIT - 1024);
    const result = await reserve(1025);

    expect(result.ok).toBe(false);
    expect(result.reservationId).toBeNull();
    expect(result.bytes).toBe(0);
    expect(result.plan).toBe('starter');
    expect(db.bucket(reservationsPath(TENANT)).size).toBe(0);
  });

  it('counts in-flight reservations as used space', async () => {
    seedDocumentBytes(TENANT, STARTER_LIMIT - 2 * GB);
    const first = await reserve(1 * GB);
    expect(first.ok).toBe(true);

    const second = await reserve(1 * GB);
    expect(second.ok).toBe(true);

    // 2GB of headroom, both gigabytes now held: a third must be refused.
    const third = await reserve(1);
    expect(third.ok).toBe(false);
    expect(third.used).toBe(STARTER_LIMIT);
  });

  it('returns the space as soon as a reservation is released', async () => {
    seedDocumentBytes(TENANT, STARTER_LIMIT - 1 * GB);
    const held = await reserve(1 * GB);
    expect((await reserve(1 * GB)).ok).toBe(false);

    await releaseTenantStorage(held);
    expect(db.bucket(reservationsPath(TENANT)).size).toBe(0);
    expect((await reserve(1 * GB)).ok).toBe(true);
  });

  it('reserves nothing for a zero-byte upload', async () => {
    const result = await reserve(0);
    expect(result.ok).toBe(true);
    expect(result.reservationId).toBeNull();
    expect(db.bucket(reservationsPath(TENANT)).size).toBe(0);
  });

  it('sweeps an abandoned reservation instead of parking quota forever', async () => {
    seedDocumentBytes(TENANT, STARTER_LIMIT - 1 * GB);
    const stale = Date.now() - STORAGE_RESERVATION_TTL_MS - 1000;
    db.seed(reservationsPath(TENANT), [
      ['abandoned', { tenantId: TENANT, bytes: 1 * GB, expiresAt: stale }],
    ]);

    const result = await reserve(1 * GB);
    expect(result.ok).toBe(true);
    expect(db.bucket(reservationsPath(TENANT)).has('abandoned')).toBe(false);
  });

  it('treats a reservation with no expiry as abandoned', async () => {
    seedDocumentBytes(TENANT, STARTER_LIMIT - 1 * GB);
    db.seed(reservationsPath(TENANT), [['malformed', { tenantId: TENANT, bytes: 1 * GB }]]);

    expect((await reserve(1 * GB)).ok).toBe(true);
  });

  it('reuses the reservation a retry already holds instead of charging twice', async () => {
    seedDocumentBytes(TENANT, STARTER_LIMIT - 2 * GB);
    const first = await reserve(2 * GB, TENANT, 'upload-session:a');
    const retry = await reserve(2 * GB, TENANT, 'upload-session:a');

    expect(retry.ok).toBe(true);
    expect(retry.reservationId).toBe(first.reservationId);
    expect(retry.bytes).toBe(2 * GB);
    expect(db.bucket(reservationsPath(TENANT)).size).toBe(1);
  });

  it('keeps one tenant’s reservations invisible to another', async () => {
    seedDocumentBytes(TENANT, STARTER_LIMIT - 1 * GB);
    await reserve(1 * GB);

    // OTHER is on Pro with nothing stored; TENANT's held gigabyte must not reach it.
    const other = await reserve(1 * GB, OTHER);
    expect(other.ok).toBe(true);
    expect(other.used).toBe(1 * GB);
    expect(db.bucket(reservationsPath(OTHER)).size).toBe(1);
  });

  it('refuses a caller with no tenant context', async () => {
    await expect(reserve(1, '')).rejects.toThrow(/Tenant context is required/);
  });

  it('releasing a no-op or missing reservation is safe', async () => {
    await expect(releaseTenantStorage(null)).resolves.toBeUndefined();
    await expect(
      releaseTenantStorage({ tenantId: TENANT, reservationId: null }),
    ).resolves.toBeUndefined();
  });

  it('the throwing form carries the check for service-layer callers', async () => {
    seedDocumentBytes(TENANT, STARTER_LIMIT);
    await expect(
      reserveTenantStorageOrThrow({ tenantId: TENANT, bytes: 1, kind: 'document_upload' }),
    ).rejects.toBeInstanceOf(StorageLimitExceededError);

    const granted = await reserveTenantStorageOrThrow({
      tenantId: OTHER,
      bytes: 1 * GB,
      kind: 'document_upload',
    });
    expect(granted.ok).toBe(true);
  });

  it('the thrown error reports the tenant’s real position', async () => {
    seedDocumentBytes(TENANT, STARTER_LIMIT);
    const error = (await reserveTenantStorageOrThrow({
      tenantId: TENANT,
      bytes: 1,
      kind: 'document_upload',
    }).catch((caught) => caught)) as StorageLimitExceededError;

    expect(error.check.limit).toBe(STARTER_LIMIT);
    expect(error.check.used).toBe(STARTER_LIMIT);
    expect(error.check.plan).toBe('starter');
  });
});

describe('PR4: the object size is measured, not declared', () => {
  it('returns the size Cloud Storage recorded', async () => {
    getMetadata.mockResolvedValue([{ size: '4096' }]);
    await expect(getVerifiedTenantObjectSize(PATH, TENANT)).resolves.toEqual({
      ok: true,
      size: 4096,
    });
  });

  it('refuses a path outside the caller’s own tenant prefix', async () => {
    const result = await getVerifiedTenantObjectSize(`tenants/${OTHER}/client-files/x`, TENANT);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Invalid storage path.');
    expect(getMetadata).not.toHaveBeenCalled();
  });

  it('fails closed when the object is missing', async () => {
    getMetadata.mockRejectedValue(Object.assign(new Error('No such object'), { code: 404 }));
    const result = await getVerifiedTenantObjectSize(PATH, TENANT);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not found in storage/);
  });

  it('fails closed when the metadata carries no usable size', async () => {
    getMetadata.mockResolvedValue([{ size: 'not-a-number' }]);
    const result = await getVerifiedTenantObjectSize(PATH, TENANT);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/could not be measured/);
  });
});

describe('PR4: object removal reports what actually happened', () => {
  it('reports removal for an object inside the tenant prefix', async () => {
    await expect(deleteTenantObject(PATH, TENANT)).resolves.toEqual({
      addressable: true,
      removed: true,
    });
    expect(deleteObject).toHaveBeenCalledWith(PATH, { ignoreNotFound: true });
  });

  it('reports a real failure so the caller keeps the record', async () => {
    deleteObject.mockRejectedValue(new Error('permission denied'));
    await expect(deleteTenantObject(PATH, TENANT)).resolves.toEqual({
      addressable: true,
      removed: false,
    });
  });

  it('reports a legacy flat path as unaddressable without touching it', async () => {
    await expect(deleteTenantObject('projects/legacy/file.pdf', TENANT)).resolves.toEqual({
      addressable: false,
      removed: false,
    });
    expect(deleteObject).not.toHaveBeenCalled();
  });
});

describe('PR4: admission control for browser-direct uploads', () => {
  const admit = (tenantId = TENANT) =>
    admitTenantUpload({ tenantId, storagePath: PATH, kind: 'client_file_register' });

  it('measures, reserves and admits, reporting the measured size', async () => {
    getMetadata.mockResolvedValue([{ size: 1024 }]);
    const admission = await admit();

    expect(admission.ok).toBe(true);
    expect(admission.bytes).toBe(1024);
    expect(admission.reservation?.ok).toBe(true);
    expect(deleteObject).not.toHaveBeenCalled();

    await releaseUploadAdmission(admission);
    expect(db.bucket(reservationsPath(TENANT)).size).toBe(0);
  });

  it('refuses and removes the object when the tenant is out of space', async () => {
    seedDocumentBytes(TENANT, STARTER_LIMIT);
    getMetadata.mockResolvedValue([{ size: 1024 }]);

    const admission = await admit();
    expect(admission.ok).toBe(false);
    expect(admission.status).toBe(403);
    expect(deleteObject).toHaveBeenCalledWith(PATH, { ignoreNotFound: true });

    const body = uploadAdmissionResponseBody(admission) as Record<string, unknown>;
    expect(body.error).toBe(STORAGE_LIMIT_EXCEEDED);
    expect(body.limit).toBe(STARTER_LIMIT);
  });

  it('refuses an object larger than the app ceiling and removes it', async () => {
    // Storage rules allow 50MB per object; the app ceiling is 25MB, and validateFile()
    // only ever saw the declared size.
    getMetadata.mockResolvedValue([{ size: 40 * 1024 * 1024 }]);

    const admission = await admit();
    expect(admission.ok).toBe(false);
    expect(admission.status).toBe(400);
    expect(deleteObject).toHaveBeenCalledWith(PATH, { ignoreNotFound: true });
    expect(uploadAdmissionResponseBody(admission)).toEqual({
      ok: false,
      error: 'File exceeds the maximum upload size.',
    });
  });

  it('refuses an object that was never uploaded', async () => {
    getMetadata.mockRejectedValue(new Error('404'));
    const admission = await admit();

    expect(admission.ok).toBe(false);
    expect(admission.status).toBe(400);
    expect(admission.bytes).toBe(0);
    // Nothing to clean up: there is no object.
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('refuses a caller with no tenant context before touching storage', async () => {
    const admission = await admit('');
    expect(admission.ok).toBe(false);
    expect(admission.status).toBe(403);
    expect(getMetadata).not.toHaveBeenCalled();
    expect(uploadAdmissionResponseBody(admission)).toEqual({ ok: false, error: 'Forbidden' });
  });

  it('releasing a refused admission is safe', async () => {
    seedDocumentBytes(TENANT, STARTER_LIMIT);
    getMetadata.mockResolvedValue([{ size: 1024 }]);
    const admission = await admit();

    await expect(releaseUploadAdmission(admission)).resolves.toBeUndefined();
    await expect(releaseUploadAdmission(null)).resolves.toBeUndefined();
  });
});

describe('PR4: the refusal a route returns', () => {
  it('renders a quota refusal as a 403 carrying the contract', async () => {
    seedDocumentBytes(TENANT, STARTER_LIMIT);
    getMetadata.mockResolvedValue([{ size: 1024 }]);

    const admission = await admitTenantUpload({
      tenantId: TENANT,
      storagePath: PATH,
      kind: 'client_file_register',
    });
    const response = uploadAdmissionRefusal(admission);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: STORAGE_LIMIT_EXCEEDED,
      limit: STARTER_LIMIT,
    });
  });

  it('renders an unmeasurable object as a 400', async () => {
    getMetadata.mockRejectedValue(new Error('404'));

    const admission = await admitTenantUpload({
      tenantId: TENANT,
      storagePath: PATH,
      kind: 'client_file_register',
    });
    const response = uploadAdmissionRefusal(admission);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
  });
});

describe('PR4: a delete frees the bytes before it frees the quota', () => {
  it('lets the delete proceed once the object is gone', async () => {
    await expect(
      purgeRecordStorageObject({ storagePath: PATH, tenantId: TENANT }),
    ).resolves.toBeNull();
    expect(deleteObject).toHaveBeenCalledWith(PATH, { ignoreNotFound: true });
  });

  it('blocks the delete with a 502 when the object could not be removed', async () => {
    deleteObject.mockRejectedValue(new Error('permission denied'));

    const blocked = await purgeRecordStorageObject({ storagePath: PATH, tenantId: TENANT });
    expect(blocked?.status).toBe(502);
    await expect(blocked?.json()).resolves.toMatchObject({ ok: false });
  });

  it('lets a legacy flat path delete rather than trapping the record', async () => {
    await expect(
      purgeRecordStorageObject({ storagePath: 'projects/legacy/f.pdf', tenantId: TENANT }),
    ).resolves.toBeNull();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('is a no-op for a record that never carried a storage path', async () => {
    await expect(purgeRecordStorageObject({ tenantId: TENANT })).resolves.toBeNull();
    await expect(purgeRecordStorageObject(undefined)).resolves.toBeNull();
    expect(deleteObject).not.toHaveBeenCalled();
  });
});
