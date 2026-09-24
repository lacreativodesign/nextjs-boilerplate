/**
 * P0-07 — the server strips the Firebase download token the browser SDK attaches to every
 * upload, and does it safely.
 *
 * __tests__/rules/storage-download-token.rules.test.ts proves, against the emulator, that
 * a browser upload is tokenized without asking. These tests prove what the server does
 * about it: which request it sends, which preconditions bind it to one generation, and that
 * it refuses to report success unless Cloud Storage's own response shows the token gone.
 */

const getMetadata = jest.fn();
const setMetadata = jest.fn();
const bucketName = jest.fn(() => 'bizosto-test-bucket');
const bucket = jest.fn();

jest.mock('@/lib/storage/bucket', () => ({ getStorageBucketName: () => bucketName() }));
jest.mock('@/lib/firebaseAdmin', () => ({
  adminStorage: {
    bucket: (name?: string) => {
      bucket(name);
      return {
        file: (path: string) => ({
          getMetadata: () => getMetadata(path),
          setMetadata: (metadata: unknown, options: unknown) =>
            setMetadata(path, metadata, options),
        }),
      };
    },
  },
}));

import {
  FIREBASE_DOWNLOAD_TOKEN_KEY,
  hasFirebaseDownloadToken,
  stripFirebaseDownloadTokens,
} from '@/lib/storage/download-tokens';
import { StorageBucketNotConfiguredError } from '@/lib/storage/product-bucket';

const TENANT = 'tenant_a';
const PATH = `tenants/${TENANT}/projects/p1/Draft/f1_brief.pdf`;
const GEN = '1700000000000001';
const SECRET = 'SECRET-TOKEN-VALUE-0f5e';

const tokenized = (over: Record<string, unknown> = {}) => ({
  generation: GEN,
  metageneration: '3',
  metadata: { [FIREBASE_DOWNLOAD_TOKEN_KEY]: SECRET, other: 'kept' },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  bucketName.mockReturnValue('bizosto-test-bucket');
});

describe('hasFirebaseDownloadToken', () => {
  it.each([
    [{ metadata: { firebaseStorageDownloadTokens: 'abc' } }, true],
    [{ metadata: { firebaseStorageDownloadTokens: 'a,b' } }, true],
    [{ metadata: { firebaseStorageDownloadTokens: '' } }, false],
    [{ metadata: { firebaseStorageDownloadTokens: '   ' } }, false],
    [{ metadata: { firebaseStorageDownloadTokens: null } }, false],
    [{ metadata: {} }, false],
    [{}, false],
    [null, false],
  ])('%j -> %s', (metadata, expected) => {
    expect(hasFirebaseDownloadToken(metadata)).toBe(expected);
  });
});

describe('stripFirebaseDownloadTokens', () => {
  it('PATCHes the token to null, bound to the measured generation AND metageneration', async () => {
    getMetadata.mockResolvedValue([tokenized()]);
    setMetadata.mockResolvedValue([
      { generation: GEN, metageneration: '4', metadata: { other: 'kept' } },
    ]);

    await expect(
      stripFirebaseDownloadTokens({ storagePath: PATH, tenantId: TENANT, generation: GEN }),
    ).resolves.toEqual({ ok: true, stripped: true });

    expect(bucket).toHaveBeenCalledWith('bizosto-test-bucket');
    expect(setMetadata).toHaveBeenCalledTimes(1);
    expect(setMetadata).toHaveBeenCalledWith(
      PATH,
      { metadata: { [FIREBASE_DOWNLOAD_TOKEN_KEY]: null } },
      { ifGenerationMatch: GEN, ifMetagenerationMatch: '3' },
    );
  });

  it('is a no-op success when the object carries no token (idempotent retry)', async () => {
    getMetadata.mockResolvedValue([{ generation: GEN, metageneration: '4', metadata: {} }]);

    await expect(
      stripFirebaseDownloadTokens({ storagePath: PATH, tenantId: TENANT, generation: GEN }),
    ).resolves.toEqual({ ok: true, stripped: false });
    expect(setMetadata).not.toHaveBeenCalled();
  });

  it('refuses success when Cloud Storage still reports a token after the PATCH', async () => {
    getMetadata.mockResolvedValue([tokenized()]);
    setMetadata.mockResolvedValue([tokenized({ metageneration: '4' })]);

    await expect(
      stripFirebaseDownloadTokens({ storagePath: PATH, tenantId: TENANT, generation: GEN }),
    ).resolves.toEqual({ ok: false, reason: 'strip_unverified' });
  });

  it('refuses success when the PATCH response names a different generation', async () => {
    getMetadata.mockResolvedValue([tokenized()]);
    setMetadata.mockResolvedValue([{ generation: '999', metadata: {} }]);

    await expect(
      stripFirebaseDownloadTokens({ storagePath: PATH, tenantId: TENANT, generation: GEN }),
    ).resolves.toEqual({ ok: false, reason: 'strip_unverified' });
  });

  it('never touches a different generation than the one measured', async () => {
    getMetadata.mockResolvedValue([tokenized({ generation: '1700000000000002' })]);

    await expect(
      stripFirebaseDownloadTokens({ storagePath: PATH, tenantId: TENANT, generation: GEN }),
    ).resolves.toEqual({ ok: false, reason: 'generation_changed' });
    expect(setMetadata).not.toHaveBeenCalled();
  });

  it('maps a failed precondition (412) to generation_changed', async () => {
    getMetadata.mockResolvedValue([tokenized()]);
    setMetadata.mockRejectedValue(Object.assign(new Error('precondition'), { code: 412 }));

    await expect(
      stripFirebaseDownloadTokens({ storagePath: PATH, tenantId: TENANT, generation: GEN }),
    ).resolves.toEqual({ ok: false, reason: 'generation_changed' });
  });

  it('maps a vanished object to not_found', async () => {
    getMetadata.mockRejectedValue(Object.assign(new Error('gone'), { code: 404 }));

    await expect(
      stripFirebaseDownloadTokens({ storagePath: PATH, tenantId: TENANT, generation: GEN }),
    ).resolves.toEqual({ ok: false, reason: 'not_found' });
  });

  it('fails closed on any other storage error, without logging the token or the error body', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    getMetadata.mockResolvedValue([tokenized()]);
    setMetadata.mockRejectedValue(
      Object.assign(new Error(`upstream echoed ${SECRET}`), { code: 500 }),
    );

    await expect(
      stripFirebaseDownloadTokens({ storagePath: PATH, tenantId: TENANT, generation: GEN }),
    ).resolves.toEqual({ ok: false, reason: 'storage_error' });
    expect(JSON.stringify(log.mock.calls)).not.toContain(SECRET);
    log.mockRestore();
  });

  it('refuses without a metageneration to bind the PATCH to', async () => {
    getMetadata.mockResolvedValue([tokenized({ metageneration: undefined })]);

    await expect(
      stripFirebaseDownloadTokens({ storagePath: PATH, tenantId: TENANT, generation: GEN }),
    ).resolves.toEqual({ ok: false, reason: 'strip_unverified' });
    expect(setMetadata).not.toHaveBeenCalled();
  });

  it.each([
    ['another tenant', `tenants/tenant_b/projects/p1/x.pdf`],
    ['a legacy flat path', `projects/p1/x.pdf`],
    ['a traversal', `tenants/${TENANT}/../tenant_b/x.pdf`],
  ])('refuses %s without a request', async (_label, storagePath) => {
    await expect(
      stripFirebaseDownloadTokens({ storagePath, tenantId: TENANT, generation: GEN }),
    ).resolves.toEqual({ ok: false, reason: 'invalid_path' });
    expect(getMetadata).not.toHaveBeenCalled();
  });

  it('refuses without a generation', async () => {
    await expect(
      stripFirebaseDownloadTokens({ storagePath: PATH, tenantId: TENANT, generation: '' }),
    ).resolves.toEqual({ ok: false, reason: 'missing_generation' });
    expect(getMetadata).not.toHaveBeenCalled();
  });

  it('fails closed when no bucket is configured, rather than using the Admin SDK default', async () => {
    bucketName.mockReturnValue(undefined as unknown as string);
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      stripFirebaseDownloadTokens({ storagePath: PATH, tenantId: TENANT, generation: GEN }),
    ).resolves.toEqual({ ok: false, reason: 'storage_error' });
    expect(bucket).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

describe('productStorageBucket', () => {
  it('names the error for an unconfigured bucket', () => {
    expect(new StorageBucketNotConfiguredError().name).toBe('StorageBucketNotConfiguredError');
  });
});
