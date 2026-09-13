/**
 * PR4 remediation — bulk-import payloads spend plan storage.
 *
 * An import payload is a tenant upload of up to 25MB that is written to Cloud Storage
 * and then purged by nothing at all: no retention, no cleanup job, no delete route. A
 * tenant could therefore accumulate import payloads without bound, entirely outside the
 * plan they pay for. It was previously waved through as an "operational" artifact.
 *
 * It is now reserved before the bytes are written and counted afterwards, like every
 * other upload surface.
 */

import { FakeDb } from './test-utils/firestore-quota-double';

const GB = 1024 ** 3;
const STARTER_LIMIT = 20 * GB;
const TENANT = 'tenant_a';

let db: FakeDb;
const save = jest.fn();
const deleteObject = jest.fn();

jest.mock('firebase-admin/firestore', () => ({
  AggregateField: { sum: (field: string) => ({ __sum: field }) },
}));

jest.mock('@/lib/storage/bucket', () => ({ getStorageBucketName: () => undefined }));

jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return db;
  },
  get adminStorage() {
    return {
      bucket: () => ({
        file: (storagePath: string) => ({
          save: (...args: unknown[]) => save(storagePath, ...args),
          delete: (options?: unknown) => deleteObject(storagePath, options),
        }),
      }),
    };
  },
}));

import { BulkImportService } from '@/lib/import/bulk-import';
import { StorageLimitExceededError } from '@/lib/billing/storage-reservation';
import { getTenantStorageUsage } from '@/lib/billing/storage-limit';

const reservationsPath = `tenant_storage_ledgers/${TENANT}/reservations`;

const upload = (bytes: number) =>
  BulkImportService.upload({
    tenantId: TENANT,
    userId: 'user_1',
    entity: 'clients',
    fileName: 'clients.csv',
    mimeType: 'text/csv',
    buffer: Buffer.alloc(bytes, 0x61),
    mappings: [],
    templateId: null,
  });

beforeEach(() => {
  db = new FakeDb();
  db.seed('tenants', [[TENANT, { plan: 'starter' }]]);
  save.mockReset().mockResolvedValue(undefined);
  deleteObject.mockReset().mockResolvedValue(undefined);
});

describe('PR4: an import payload within the plan is stored and counted', () => {
  it('writes the object and a job record carrying the payload size', async () => {
    const jobId = await upload(4096);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toContain(`tenants/${TENANT}/imports/clients/`);

    const job = db.bucket('importJobs').get(jobId);
    expect(job?.tenantId).toBe(TENANT);
    expect(job?.size).toBe(4096);
  });

  it('the payload then counts against the tenant', async () => {
    await upload(4096);
    expect(await getTenantStorageUsage(TENANT)).toBe(4096);
  });

  it('releases the reservation once the job record has landed', async () => {
    await upload(4096);
    expect(db.bucket(reservationsPath).size).toBe(0);
  });
});

describe('PR4: an import payload over the plan is refused', () => {
  beforeEach(() => {
    db.seed('documents', [
      ['bulky', { tenantId: TENANT, fileSize: STARTER_LIMIT, deletedAt: null }],
    ]);
  });

  it('throws the quota error before a byte is written', async () => {
    await expect(upload(4096)).rejects.toBeInstanceOf(StorageLimitExceededError);
    expect(save).not.toHaveBeenCalled();
    expect(db.bucket('importJobs').size).toBe(0);
  });

  it('holds no reservation afterwards', async () => {
    await upload(4096).catch(() => undefined);
    expect(db.bucket(reservationsPath).size).toBe(0);
  });

  it('an accumulated history of import payloads is what fills the plan', async () => {
    // The bypass this closes: payloads nothing ever purges, counted by nothing.
    db.bucket('documents').clear();
    db.seed('importJobs', [
      ['old1', { tenantId: TENANT, size: STARTER_LIMIT / 2 }],
      ['old2', { tenantId: TENANT, size: STARTER_LIMIT / 2 }],
    ]);

    await expect(upload(4096)).rejects.toBeInstanceOf(StorageLimitExceededError);
  });
});

describe('PR4: a failed import upload leaves no orphan and no held quota', () => {
  it('removes the object and releases the reservation when the job record fails', async () => {
    // The object lands in the bucket, then the Firestore write throws.
    db.failingWrites.add('importJobs');

    await expect(upload(4096)).rejects.toThrow(/write to importJobs failed/);

    // Releasing the reservation without removing the object would hand back quota for
    // bytes still in the bucket, with no record pointing at them.
    expect(deleteObject).toHaveBeenCalledWith(
      expect.stringContaining(`tenants/${TENANT}/imports/`),
      { ignoreNotFound: true },
    );
    expect(db.bucket(reservationsPath).size).toBe(0);
  });
});
