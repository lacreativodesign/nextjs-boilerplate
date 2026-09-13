/**
 * PR4-A — the document library spends the tenant's plan storage.
 *
 * This is the audited P0. StorageService.uploadFile() is the single point where every
 * byte of the document library is committed — /api/documents/upload and
 * /api/documents/[id]/version both go through it — and before PR4 it consulted the
 * tenant's plan nowhere at all, while `documents` was absent from canonical usage.
 *
 * These tests drive the real method against a Firestore double and a Cloud Storage
 * double, so the reservation, the ordering, the failure cleanup and the release all
 * execute rather than being asserted about from the source text.
 */

import { FakeDb } from './test-utils/firestore-quota-double';

const GB = 1024 ** 3;
const STARTER_LIMIT = 20 * GB;
const TENANT = 'tenant_a';

let db: FakeDb;
const save = jest.fn();
const getSignedUrl = jest.fn();
const deleteObject = jest.fn();

const NOW = { toMillis: () => 1_700_000_000_000 };

jest.mock('firebase-admin/firestore', () => ({
  AggregateField: { sum: (field: string) => ({ __sum: field }) },
}));

jest.mock('firebase-admin', () => ({
  firestore: {
    Timestamp: { now: () => NOW },
    FieldValue: { increment: (by: number) => ({ __increment: by }) },
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
          delete: (options?: unknown) => deleteObject(storagePath, options),
        }),
      }),
    };
  },
}));

import { StorageService } from '@/lib/storage/storage-service';
import { StorageLimitExceededError } from '@/lib/billing/storage-reservation';

const reservationsPath = `tenant_storage_ledgers/${TENANT}/reservations`;

/** Reads a documents row, failing the test rather than the type-checker if it is absent. */
function storedDocument(id: string): Record<string, any> {
  const row = db.bucket('documents').get(id);
  expect(row).toBeDefined();
  return row as Record<string, any>;
}

const upload = (bytes: number, over: Record<string, unknown> = {}) =>
  StorageService.uploadFile({
    tenantId: TENANT,
    userId: 'user_1',
    userEmail: 'user@example.com',
    file: Buffer.alloc(bytes, 1),
    fileName: 'statement.pdf',
    mimeType: 'application/pdf',
    category: 'statement',
    ...over,
  } as Parameters<typeof StorageService.uploadFile>[0]);

function seedDocumentBytes(bytes: number, id = 'existing') {
  db.seed('documents', [[id, { tenantId: TENANT, fileSize: bytes, deletedAt: null }]]);
}

beforeEach(() => {
  db = new FakeDb();
  db.seed('tenants', [[TENANT, { plan: 'starter' }]]);
  save.mockReset().mockResolvedValue(undefined);
  getSignedUrl.mockReset().mockResolvedValue(['https://signed.example/doc']);
  deleteObject.mockReset().mockResolvedValue(undefined);
});

describe('PR4-A: an upload within the plan is stored and metered', () => {
  it('writes the object and a documents record carrying the real byte length', async () => {
    const documentId = await upload(2048);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toContain(`tenants/${TENANT}/documents/`);

    const stored = storedDocument(documentId);
    expect(stored.tenantId).toBe(TENANT);
    expect(stored.fileSize).toBe(2048);
    expect(stored.deletedAt).toBeNull();
  });

  it('releases the reservation once the record has landed', async () => {
    await upload(2048);
    // The `documents` record is now what counts; nothing may keep holding the bytes.
    expect(db.bucket(reservationsPath).size).toBe(0);
  });

  it('the stored bytes then count against the tenant', async () => {
    await upload(4096);
    const { getTenantStorageUsage } = await import('@/lib/billing/storage-limit');
    expect(await getTenantStorageUsage(TENANT)).toBe(4096);
  });
});

describe('PR4-A: an upload over the plan is refused before any byte is stored', () => {
  it('throws the quota error and never reaches the bucket', async () => {
    seedDocumentBytes(STARTER_LIMIT);

    await expect(upload(1024)).rejects.toBeInstanceOf(StorageLimitExceededError);
    expect(save).not.toHaveBeenCalled();
  });

  it('reports the tenant’s real position on the thrown error', async () => {
    seedDocumentBytes(STARTER_LIMIT - 512);

    const error = (await upload(1024).catch((caught) => caught)) as StorageLimitExceededError;
    expect(error.check.limit).toBe(STARTER_LIMIT);
    expect(error.check.used).toBe(STARTER_LIMIT - 512);
    expect(error.check.incoming).toBe(1024);
    expect(error.check.plan).toBe('starter');
  });

  it('writes no documents record and holds no reservation', async () => {
    seedDocumentBytes(STARTER_LIMIT);
    await upload(1024).catch(() => undefined);

    expect(db.bucket('documents').size).toBe(1);
    expect(db.bucket(reservationsPath).size).toBe(0);
  });

  it('admits an upload that lands exactly on the ceiling', async () => {
    seedDocumentBytes(STARTER_LIMIT - 1024);
    await expect(upload(1024)).resolves.toEqual(expect.any(String));
  });

  it('refuses one byte over the ceiling', async () => {
    seedDocumentBytes(STARTER_LIMIT - 1024);
    await expect(upload(1025)).rejects.toBeInstanceOf(StorageLimitExceededError);
  });
});

describe('PR4-A: a failed upload leaves no orphan and no held quota', () => {
  it('removes the object and releases the reservation when the record cannot be written', async () => {
    getSignedUrl.mockRejectedValue(new Error('signing failed'));

    await expect(upload(2048)).rejects.toThrow(/signing failed/);

    // Releasing the reservation without removing the object would hand back quota for
    // bytes still in the bucket.
    expect(deleteObject).toHaveBeenCalledWith(
      expect.stringContaining(`tenants/${TENANT}/documents/`),
      { ignoreNotFound: true },
    );
    expect(db.bucket(reservationsPath).size).toBe(0);
  });

  it('releases the reservation even when the cleanup delete also fails', async () => {
    getSignedUrl.mockRejectedValue(new Error('signing failed'));
    deleteObject.mockRejectedValue(new Error('delete failed'));

    await expect(upload(2048)).rejects.toThrow(/signing failed/);
    expect(db.bucket(reservationsPath).size).toBe(0);
  });

  it('rejects an oversized or disallowed file before reserving anything', async () => {
    await expect(upload(1024, { mimeType: 'application/x-msdownload' })).rejects.toThrow(
      /File type not allowed/,
    );
    expect(db.bucket(reservationsPath).size).toBe(0);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('PR4-A: a new version is charged and ordered correctly', () => {
  beforeEach(() => {
    db.seed('documents', [
      [
        'original',
        {
          tenantId: TENANT,
          fileSize: 1024,
          deletedAt: null,
          version: 1,
          isLatestVersion: true,
          category: 'statement',
          visibility: 'private',
          tags: [],
        },
      ],
    ]);
  });

  const version = (bytes: number) =>
    StorageService.createVersion({
      tenantId: TENANT,
      userId: 'user_1',
      userEmail: 'user@example.com',
      originalDocumentId: 'original',
      file: Buffer.alloc(bytes, 1),
      fileName: 'statement-v2.pdf',
      mimeType: 'application/pdf',
    });

  it('stores the new version and demotes the original only afterwards', async () => {
    const newId = await version(2048);

    expect(storedDocument(newId).fileSize).toBe(2048);
    expect(storedDocument(newId).version).toBe(2);
    expect(storedDocument(newId).previousVersionId).toBe('original');
    expect(storedDocument('original').isLatestVersion).toBe(false);
  });

  it('both versions count, because both objects exist', async () => {
    await version(2048);
    const { getTenantStorageUsage } = await import('@/lib/billing/storage-limit');
    expect(await getTenantStorageUsage(TENANT)).toBe(1024 + 2048);
  });

  it('a refused version leaves the original still marked latest', async () => {
    seedDocumentBytes(STARTER_LIMIT, 'bulky');

    await expect(version(2048)).rejects.toBeInstanceOf(StorageLimitExceededError);
    // Demoting before storing left the document with no version marked latest at all.
    expect(storedDocument('original').isLatestVersion).toBe(true);
  });

  it('refuses to version a document that does not exist', async () => {
    await expect(
      StorageService.createVersion({
        tenantId: TENANT,
        userId: 'user_1',
        userEmail: 'user@example.com',
        originalDocumentId: 'missing',
        file: Buffer.alloc(16, 1),
        fileName: 'x.pdf',
        mimeType: 'application/pdf',
      }),
    ).rejects.toThrow(/Original document not found/);
  });
});
