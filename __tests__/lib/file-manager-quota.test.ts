/**
 * PR4-E — the chunked managed-file upload reserves quota rather than reading it.
 *
 * FileManager.initOrAppendChunk() assembles the uploaded chunks and only then knows the
 * real byte length, so it is the right place to charge the tenant. It used to call
 * checkStorageLimit(), which is a read: two uploads assembling at the same moment both
 * observed the same free space and both were admitted.
 *
 * It now reserves, keyed on the upload session so a retried final chunk is not charged
 * twice, and releases whether or not the version was stored. These tests drive the real
 * method to completion against a Firestore double and a Cloud Storage double.
 */

import { FakeDb } from './test-utils/firestore-quota-double';

const GB = 1024 ** 3;
const STARTER_LIMIT = 20 * GB;
const TENANT = 'tenant_a';

let db: FakeDb;
const save = jest.fn();
const getSignedUrl = jest.fn();

const stamp = (ms: number) => ({ toMillis: () => ms, _ms: ms });

jest.mock('firebase-admin/firestore', () => ({
  AggregateField: { sum: (field: string) => ({ __sum: field }) },
}));

jest.mock('firebase-admin', () => ({
  __esModule: true,
  firestore: {
    Timestamp: {
      now: () => ({ toMillis: () => 1_700_000_000_000 }),
      fromMillis: (ms: number) => ({ toMillis: () => ms }),
    },
  },
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
          getSignedUrl: () => getSignedUrl(storagePath),
        }),
      }),
    };
  },
}));

import { FileManager, UploadRejected } from '@/lib/files/file-manager';

// A real PDF header, so the assembled buffer passes the magic-byte gate.
const PDF = Buffer.concat([
  Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]),
  Buffer.alloc(56, 0x20),
]);

const reservationsPath = `tenant_storage_ledgers/${TENANT}/reservations`;

const uploadOnce = (uploadId: string, chunk: Buffer = PDF) =>
  FileManager.initOrAppendChunk({
    tenantId: TENANT,
    uploadId,
    chunkIndex: 0,
    totalChunks: 1,
    chunk,
    fileName: 'brief.pdf',
    mimeType: 'application/pdf',
    size: chunk.length,
    userId: 'user_1',
    userEmail: 'user@example.com',
  });

beforeEach(() => {
  db = new FakeDb();
  db.seed('tenants', [[TENANT, { plan: 'starter' }]]);
  save.mockReset().mockResolvedValue(undefined);
  getSignedUrl.mockReset().mockResolvedValue(['https://signed.example/file']);
});

describe('PR4-E: an assembled upload within the plan is stored and metered', () => {
  it('stores the object and a version row carrying the assembled length', async () => {
    const result = await uploadOnce('upload-session-aaa1');

    expect(result.completed).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toContain(`tenants/${TENANT}/files/`);

    const versions = Array.from(db.bucket('erp_file_versions').values());
    expect(versions).toHaveLength(1);
    expect(versions[0].size).toBe(PDF.length);
    expect(versions[0].tenantId).toBe(TENANT);
  });

  it('releases the reservation once the version row has landed', async () => {
    await uploadOnce('upload-session-aaa2');
    expect(db.bucket(reservationsPath).size).toBe(0);
  });

  it('the stored version then counts against the tenant', async () => {
    await uploadOnce('upload-session-aaa3');
    const { getTenantStorageUsage } = await import('@/lib/billing/storage-limit');
    expect(await getTenantStorageUsage(TENANT)).toBe(PDF.length);
  });

  it('clears the upload session so it cannot be replayed', async () => {
    await uploadOnce('upload-session-aaa4');
    expect(db.bucket('erp_file_upload_sessions').size).toBe(0);
  });
});

describe('PR4-E: an assembled upload over the plan is refused', () => {
  beforeEach(() => {
    db.seed('documents', [
      ['bulky', { tenantId: TENANT, fileSize: STARTER_LIMIT, deletedAt: null }],
    ]);
  });

  it('rejects the caller with a 403-shaped rejection and stores nothing', async () => {
    const error = (await uploadOnce('upload-session-bbb1').catch((e) => e)) as UploadRejected;

    expect(error).toBeInstanceOf(UploadRejected);
    expect(error.status).toBe(403);
    expect(error.message).toMatch(/storage/i);
    expect(save).not.toHaveBeenCalled();
    expect(db.bucket('erp_file_versions').size).toBe(0);
  });

  it('holds no reservation after the refusal', async () => {
    await uploadOnce('upload-session-bbb2').catch(() => undefined);
    expect(db.bucket(reservationsPath).size).toBe(0);
  });

  it('charges the assembled bytes, so a tenant with room for them succeeds', async () => {
    // Same upload, a tenant that is not full: the only difference is the quota.
    db.bucket('documents').clear();
    await expect(uploadOnce('upload-session-bbb3')).resolves.toMatchObject({ completed: true });
  });
});

describe('PR4-E: the reservation is released even when storing fails', () => {
  it('does not leave the space held after a storage failure', async () => {
    save.mockRejectedValue(new Error('bucket unavailable'));

    await expect(uploadOnce('upload-session-ccc1')).rejects.toThrow(/bucket unavailable/);
    expect(db.bucket(reservationsPath).size).toBe(0);
  });
});
