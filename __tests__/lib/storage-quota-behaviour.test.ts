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

import { readFileSync } from 'fs';
import { join as pathJoin } from 'path';
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
import {
  deleteTenantObject,
  getVerifiedTenantObjectSize,
  tenantObjectKey,
} from '@/lib/storage/tenant-object';
import {
  admitTenantUpload,
  releaseUploadAdmission,
  uploadAdmissionRefusal,
  uploadAdmissionResponseBody,
} from '@/lib/billing/upload-admission';
import { LEGACY_STORAGE_PATH, purgeRecordStorageObject } from '@/lib/storage/tenant-object';

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
    getMetadata.mockResolvedValue([{ size: '4096', generation: '1700000000000001' }]);
    await expect(getVerifiedTenantObjectSize(PATH, TENANT)).resolves.toEqual({
      ok: true,
      size: 4096,
      generation: '1700000000000001',
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
    getMetadata.mockResolvedValue([{ size: 'not-a-number', generation: '1700000000000001' }]);
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
    getMetadata.mockResolvedValue([{ size: 1024, generation: '1700000000000001' }]);
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
    getMetadata.mockResolvedValue([{ size: 1024, generation: '1700000000000001' }]);

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
    getMetadata.mockResolvedValue([{ size: 40 * 1024 * 1024, generation: '1700000000000002' }]);

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
    getMetadata.mockResolvedValue([{ size: 1024, generation: '1700000000000001' }]);
    const admission = await admit();

    await expect(releaseUploadAdmission(admission)).resolves.toBeUndefined();
    await expect(releaseUploadAdmission(null)).resolves.toBeUndefined();
  });
});

describe('PR4: the refusal a route returns', () => {
  it('renders a quota refusal as a 403 carrying the contract', async () => {
    seedDocumentBytes(TENANT, STARTER_LIMIT);
    getMetadata.mockResolvedValue([{ size: 1024, generation: '1700000000000001' }]);

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

  it('blocks the delete with a 409 for an unprovable legacy path', async () => {
    // A pre-S5 flat path cannot be proven to belong to this tenant, so the object is not
    // touched. The record must therefore NOT be cleared: usage excludes soft-deleted
    // records, so clearing it would recover quota for bytes still in the bucket — the
    // exact bypass this PR closes. An earlier revision let this through.
    const blocked = await purgeRecordStorageObject({
      storagePath: 'projects/legacy/f.pdf',
      tenantId: TENANT,
    });

    expect(blocked?.status).toBe(409);
    await expect(blocked?.json()).resolves.toMatchObject({
      ok: false,
      error: LEGACY_STORAGE_PATH,
    });
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('a legacy record keeps counting, so no free quota is manufactured', async () => {
    db.seed('files', [
      [
        'legacy',
        { tenantId: TENANT, size: 4 * GB, isDeleted: false, storagePath: 'projects/l.pdf' },
      ],
    ]);
    expect(await getTenantStorageUsage(TENANT)).toBe(4 * GB);

    // The delete is refused, so the record is never marked deleted...
    const blocked = await purgeRecordStorageObject({
      storagePath: 'projects/l.pdf',
      tenantId: TENANT,
    });
    expect(blocked).not.toBeNull();

    // ...and its bytes still count.
    expect(await getTenantStorageUsage(TENANT)).toBe(4 * GB);
  });

  it('a failed physical deletion cannot manufacture free quota either', async () => {
    deleteObject.mockRejectedValue(new Error('permission denied'));
    db.seed('files', [
      ['stuck', { tenantId: TENANT, size: 2 * GB, isDeleted: false, storagePath: PATH }],
    ]);

    const blocked = await purgeRecordStorageObject({ storagePath: PATH, tenantId: TENANT });
    expect(blocked?.status).toBe(502);
    expect(await getTenantStorageUsage(TENANT)).toBe(2 * GB);
  });

  it('a successful deletion is the only thing that recovers quota', async () => {
    db.seed('files', [
      ['live', { tenantId: TENANT, size: 2 * GB, isDeleted: false, storagePath: PATH }],
    ]);
    expect(await getTenantStorageUsage(TENANT)).toBe(2 * GB);

    const blocked = await purgeRecordStorageObject({ storagePath: PATH, tenantId: TENANT });
    expect(blocked).toBeNull();

    // The route may now clear the record, and only now do the bytes stop counting.
    db.bucket('files').set('live', {
      ...db.bucket('files').get('live'),
      isDeleted: true,
    });
    expect(await getTenantStorageUsage(TENANT)).toBe(0);
  });

  it('never purges under another tenant’s prefix', async () => {
    const blocked = await purgeRecordStorageObject({
      storagePath: `tenants/${OTHER}/client-files/p1/f1.pdf`,
      tenantId: TENANT,
    });

    // Not addressable as this tenant, so refused rather than deleted cross-tenant.
    expect(blocked?.status).toBe(409);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('is a no-op for a record that never carried a storage path', async () => {
    await expect(purgeRecordStorageObject({ tenantId: TENANT })).resolves.toBeNull();
    await expect(purgeRecordStorageObject(undefined)).resolves.toBeNull();
    expect(deleteObject).not.toHaveBeenCalled();
  });
});

/**
 * PR4 remediation — a reservation may only be reused for the same bytes.
 *
 * Admission keys its reservation on the object, so a retry reuses what it already holds
 * instead of being charged twice. That is only safe while the key means one set of
 * bytes. Cloud Storage lets an object at a path be replaced, which keeps the path and
 * changes the size, so a path-only key would let a retry for a LARGER object reuse a
 * smaller object's reservation and overshoot the plan.
 */
describe('PR4: reservation reuse is byte-stable and object-identified', () => {
  it('reuses a reservation for the identical byte count', async () => {
    seedDocumentBytes(TENANT, STARTER_LIMIT - 2 * GB);
    const key = 'tenants/a/client-files/p/f.pdf#1700000000000001';

    const first = await reserveTenantStorage({
      tenantId: TENANT,
      bytes: 1 * GB,
      kind: 'client_file_register',
      idempotencyKey: key,
    });
    const retry = await reserveTenantStorage({
      tenantId: TENANT,
      bytes: 1 * GB,
      kind: 'client_file_register',
      idempotencyKey: key,
    });

    expect(retry.ok).toBe(true);
    expect(retry.reservationId).toBe(first.reservationId);
    expect(db.bucket(reservationsPath(TENANT)).size).toBe(1);
  });

  it('refuses to reuse a reservation holding a different byte count', async () => {
    seedDocumentBytes(TENANT, STARTER_LIMIT - 2 * GB);
    const key = 'tenants/a/client-files/p/f.pdf#1700000000000001';

    await reserveTenantStorage({
      tenantId: TENANT,
      bytes: 1024,
      kind: 'client_file_register',
      idempotencyKey: key,
    });

    // The same key asking for 2GB is not a retry of the 1KB upload. Honouring it would
    // admit 2GB against a 1KB reservation.
    const collision = await reserveTenantStorage({
      tenantId: TENANT,
      bytes: 2 * GB,
      kind: 'client_file_register',
      idempotencyKey: key,
    });

    expect(collision.ok).toBe(false);
    expect(collision.reservationId).toBeNull();
    expect(db.bucket(reservationsPath(TENANT)).size).toBe(1);
  });

  it('the object key changes when the bytes at a path are replaced', () => {
    const path = `tenants/${TENANT}/client-files/p/f.pdf`;
    expect(tenantObjectKey(path, '1')).not.toBe(tenantObjectKey(path, '2'));
    expect(tenantObjectKey(path, '1')).toBe(tenantObjectKey(path, '1'));
  });

  it('a replaced, larger object cannot ride the smaller object’s reservation', async () => {
    // 10MB of headroom, which is under the 25MB per-object app ceiling so the quota
    // branch is what decides. A small object is admitted and its reservation is live.
    const MB = 1024 * 1024;
    seedDocumentBytes(TENANT, STARTER_LIMIT - 10 * MB);
    getMetadata.mockResolvedValue([{ size: 1024, generation: '1700000000000001' }]);

    const first = await admitTenantUpload({
      tenantId: TENANT,
      storagePath: PATH,
      kind: 'client_file_register',
    });
    expect(first.ok).toBe(true);
    expect(first.bytes).toBe(1024);

    // The object at that same path is replaced with one larger than the headroom.
    getMetadata.mockResolvedValue([{ size: 20 * MB, generation: '1700000000000002' }]);
    const second = await admitTenantUpload({
      tenantId: TENANT,
      storagePath: PATH,
      kind: 'client_file_register',
    });

    // It gets its own decision against the real remaining quota, and is refused.
    expect(second.ok).toBe(false);
    expect(second.check?.incoming).toBe(20 * MB);
    expect(second.generation).toBe('1700000000000002');
  });

  it('a replaced object that does fit is charged its own, larger size', async () => {
    seedDocumentBytes(TENANT, 1 * GB);
    getMetadata.mockResolvedValue([{ size: 1024, generation: '1700000000000001' }]);
    const first = await admitTenantUpload({
      tenantId: TENANT,
      storagePath: PATH,
      kind: 'client_file_register',
    });
    expect(first.bytes).toBe(1024);

    getMetadata.mockResolvedValue([{ size: 4096, generation: '1700000000000002' }]);
    const second = await admitTenantUpload({
      tenantId: TENANT,
      storagePath: PATH,
      kind: 'client_file_register',
    });

    expect(second.ok).toBe(true);
    expect(second.bytes).toBe(4096);
    // A distinct object, so a distinct reservation — not the 1KB one reused.
    expect(second.reservation?.reservationId).not.toBe(first.reservation?.reservationId);
    // ...but the same record, because it is the same path.
    expect(second.registrationId).toBe(first.registrationId);
  });

  it('an object with no generation is refused rather than guessed at', async () => {
    getMetadata.mockResolvedValue([{ size: 1024 }]);
    const admission = await admitTenantUpload({
      tenantId: TENANT,
      storagePath: PATH,
      kind: 'client_file_register',
    });

    expect(admission.ok).toBe(false);
    expect(admission.status).toBe(400);
  });
});

/**
 * PR4 remediation — a missing Firestore index must refuse uploads, never admit them.
 *
 * Canonical usage sums `documents` with `tenantId == x AND deletedAt == null`. The
 * read-only production inventory run against this PR head reports that index as the one
 * and only entry the live project does not yet carry, so the owner must create it before
 * the application depends on it (see the PR body for the exact procedure).
 *
 * What matters for the monetization invariant is the failure mode if that sequencing is
 * ever missed. A usage query that cannot be served must not be read as "this tenant has
 * used nothing" — that would turn a missing index into an unmetered-upload bypass on
 * every path at once. It propagates instead: no reservation is granted and the upload is
 * refused. Loud and closed, never quiet and open.
 */
describe('PR4: a usage query that cannot be served fails closed', () => {
  it('refuses the reservation instead of counting the tenant as empty', async () => {
    seedDocumentBytes(TENANT, 1 * GB);
    db.failingAggregates.add('documents');

    await expect(
      reserveTenantStorage({ tenantId: TENANT, bytes: 1024, kind: 'document_upload' }),
    ).rejects.toThrow(/FAILED_PRECONDITION/);

    // Nothing was granted, so nothing can be stored against a usage figure of zero.
    expect(db.bucket(reservationsPath(TENANT)).size).toBe(0);
  });

  it('refuses a browser-direct admission for the same reason', async () => {
    db.failingAggregates.add('documents');
    getMetadata.mockResolvedValue([{ size: 1024, generation: '1700000000000001' }]);

    await expect(
      admitTenantUpload({ tenantId: TENANT, storagePath: PATH, kind: 'client_file_register' }),
    ).rejects.toThrow(/FAILED_PRECONDITION/);
    expect(db.bucket(reservationsPath(TENANT)).size).toBe(0);
  });

  it('the same holds for every other byte source, not just documents', async () => {
    for (const collection of ['files', 'employeeDocuments', 'erp_file_versions', 'importJobs']) {
      db = new FakeDb();
      db.seed('tenants', [[TENANT, { plan: 'starter' }]]);
      db.failingAggregates.add(collection);

      await expect(
        reserveTenantStorage({ tenantId: TENANT, bytes: 1024, kind: 'document_upload' }),
      ).rejects.toThrow(/FAILED_PRECONDITION/);
    }
  });
});

/**
 * PR4 remediation — the surfaces previously waved through as "ancillary".
 *
 * Each was examined rather than classified by category. Import payloads, export outputs
 * and DocuSign signed documents are all tenant-controlled, uncapped in count, and purged
 * by nothing, so they accumulate without bound in Bizosto-billed storage; they are now
 * counted. The tenant logo (fixed path, overwritten, super_admin only) and support
 * screenshots (3MB, one per rate-limited and deduped ticket, on the platform support
 * desk) are bounded, and stay outside paid quota.
 */
describe('PR4: unbounded ancillary surfaces are metered', () => {
  it('counts bulk-import payloads', async () => {
    db.seed('importJobs', [['j1', { tenantId: TENANT, size: 2 * GB, storagePath: 'x' }]]);
    expect(await getTenantStorageUsage(TENANT)).toBe(2 * GB);
  });

  it('counts bulk-export outputs', async () => {
    db.seed('exportJobs', [['e1', { tenantId: TENANT, size: 3 * GB, storagePath: 'x' }]]);
    expect(await getTenantStorageUsage(TENANT)).toBe(3 * GB);
  });

  it('counts DocuSign signed documents', async () => {
    db.seed(`tenants/${TENANT}/docusignEnvelopes`, [
      ['env1', { signedDocumentSize: 1 * GB }],
      ['env2', { signedDocumentSize: 2 * GB }],
    ]);
    expect(await getTenantStorageUsage(TENANT)).toBe(3 * GB);
  });

  it('keeps every ancillary surface tenant-scoped', async () => {
    db.seed('importJobs', [['j1', { tenantId: OTHER, size: 5 * GB }]]);
    db.seed('exportJobs', [['e1', { tenantId: OTHER, size: 5 * GB }]]);
    db.seed(`tenants/${OTHER}/docusignEnvelopes`, [['env1', { signedDocumentSize: 5 * GB }]]);

    expect(await getTenantStorageUsage(TENANT)).toBe(0);
    expect(await getTenantStorageUsage(OTHER)).toBe(15 * GB);
  });

  it('an over-quota tenant cannot add another import payload', async () => {
    db.seed('importJobs', [['j1', { tenantId: TENANT, size: STARTER_LIMIT }]]);
    const reservation = await reserveTenantStorage({
      tenantId: TENANT,
      bytes: 1024,
      kind: 'bulk_import_upload',
    });
    expect(reservation.ok).toBe(false);
  });

  it('leaves the bounded platform surfaces out of paid quota', () => {
    const src = readFileSync(pathJoin(process.cwd(), 'lib/billing/storage-limit.ts'), 'utf8');
    const sources = src.slice(
      src.indexOf('export function tenantStorageSources'),
      src.indexOf('\n}', src.indexOf('export function tenantStorageSources')),
    );
    // Bounded: a fixed overwritten path, and one 3MB object per rate-limited ticket.
    expect(sources).not.toContain('branding');
    expect(sources).not.toContain('platform_tickets');
  });
});
