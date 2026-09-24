/**
 * Behavioural and tenant-isolation coverage for the `app/api/files/[id]` family.
 *
 * These five routes all resolve a file by an id taken straight from the URL, so the only
 * thing standing between a caller and another tenant's file is that the lookup is scoped
 * by the *session's* tenant rather than anything the request supplies. That is asserted
 * here per route, not assumed: every test proves the tenant argument handed to
 * FileManager is the caller's, and that a miss becomes a 404 rather than a leak.
 *
 * The Next 15 async-params migration rewrote each handler's second argument from
 * `{ params: { id } }` to `props: { params: Promise<{ id }> }` plus an awaited read. That
 * is request-handling code on the hot path of every one of these routes: if a handler
 * failed to await, `params.id` would be `undefined` and the tenant-scoped lookup would run
 * with a missing id. Each route is therefore driven with a real Promise and asserted to
 * pass the *resolved* id through to the service layer.
 */

export {}; // module scope: these suites use only dynamic imports, and without this
// TypeScript treats them as global scripts, so their top-level names collide with each other.

const getCurrentUser = jest.fn();

const FileManager = {
  getFileById: jest.fn(),
  // P0-07: the stored per-file ACL is now enforced; allowed unless a test says otherwise.
  canAccessFile: jest.fn(() => true),
  listVersions: jest.fn(),
  restoreVersion: jest.fn(),
  addTags: jest.fn(),
};

jest.mock('@/app/api/admin/_utils', () => ({
  getCurrentUser: () => getCurrentUser(),
}));
jest.mock('@/lib/files/file-manager', () => ({
  get FileManager() {
    return FileManager;
  },
}));

// P0-07: downloads are minted by the shared short-lived minter, after authorization.
const mintProtectedDownloadUrl = jest.fn();
jest.mock('@/lib/storage/protected-download', () => ({
  ...jest.requireActual('@/lib/storage/protected-download'),
  mintProtectedDownloadUrl: (...args: unknown[]) => mintProtectedDownloadUrl(...args),
}));

const TENANT_A = 'tenant_a';
const CALLER_A = { uid: 'user_a', tenantId: TENANT_A, role: 'admin', email: 'a@example.com' };

/** The id is always delivered as a Promise, exactly as Next 15 delivers it. */
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const jsonBody = (url: string, body: unknown) =>
  new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  getCurrentUser.mockResolvedValue(CALLER_A);
  FileManager.canAccessFile.mockReturnValue(true);
});

describe('files/[id] — GET', () => {
  const load = () => import('@/app/api/files/[id]/route');

  it('refuses a caller with no tenant context', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctx('file_1'));
    expect(res.status).toBe(401);
    expect(FileManager.getFileById).not.toHaveBeenCalled();
  });

  it('scopes the lookup to the session tenant, using the awaited param id', async () => {
    FileManager.getFileById.mockResolvedValue({ id: 'file_1', storagePath: 'p/1' });
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctx('file_1'));

    expect(res.status).toBe(200);
    // The resolved id and the caller's tenant — not a request-supplied tenant.
    expect(FileManager.getFileById).toHaveBeenCalledWith('file_1', TENANT_A);
    await expect(res.json()).resolves.toEqual({ file: { id: 'file_1', storagePath: 'p/1' } });
  });

  it("answers 404 for another tenant's file rather than leaking it", async () => {
    FileManager.getFileById.mockResolvedValue(null);
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctx('file_owned_by_tenant_b'));

    expect(res.status).toBe(404);
    expect(FileManager.getFileById).toHaveBeenCalledWith('file_owned_by_tenant_b', TENANT_A);
  });

  it('does not surface an internal failure as a success', async () => {
    FileManager.getFileById.mockRejectedValue(new Error('firestore unavailable'));
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctx('file_1'));
    expect(res.status).toBe(500);
  });
});

describe('files/[id]/download — GET', () => {
  const load = () => import('@/app/api/files/[id]/download/route');
  const FILE = {
    id: 'file_1',
    name: 'brief.pdf',
    mimeType: 'application/pdf',
    storagePath: 'tenants/tenant_a/files/file_1/v1-1-brief.pdf',
  };

  it('refuses a caller with no tenant context', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctx('file_1'));
    expect(res.status).toBe(401);
    expect(mintProtectedDownloadUrl).not.toHaveBeenCalled();
  });

  it('mints a short-lived URL only after the tenant-scoped lookup AND the ACL pass', async () => {
    FileManager.getFileById.mockResolvedValue(FILE);
    mintProtectedDownloadUrl.mockResolvedValue({
      url: 'https://signed.example/u',
      expiresAt: '2026-01-01T00:05:00.000Z',
    });
    const { GET } = await load();
    const res = await GET(
      new Request('https://app.local/api/files/file_1/download'),
      ctx('file_1'),
    );

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://signed.example/u');
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(FileManager.getFileById).toHaveBeenCalledWith('file_1', TENANT_A);
    expect(FileManager.canAccessFile).toHaveBeenCalledWith(FILE, CALLER_A);
    expect(mintProtectedDownloadUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        storagePath: FILE.storagePath,
        tenantId: TENANT_A,
        allowedRoots: ['tenants/tenant_a/files/file_1/'],
        disposition: 'attachment',
      }),
    );
  });

  it('refuses a same-tenant caller the stored ACL does not admit, and mints nothing', async () => {
    FileManager.getFileById.mockResolvedValue(FILE);
    FileManager.canAccessFile.mockReturnValue(false);
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctx('file_1'));

    expect(res.status).toBe(403);
    expect(mintProtectedDownloadUrl).not.toHaveBeenCalled();
  });

  it("never signs a URL for another tenant's (or a deleted) file", async () => {
    FileManager.getFileById.mockResolvedValue(null);
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctx('file_owned_by_tenant_b'));

    expect(res.status).toBe(404);
    // The important half: no signed URL is minted on the refusal path.
    expect(mintProtectedDownloadUrl).not.toHaveBeenCalled();
  });
});

describe('files/[id]/versions — GET', () => {
  const load = () => import('@/app/api/files/[id]/versions/route');

  it('refuses a caller with no tenant context', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctx('file_1'));
    expect(res.status).toBe(401);
    expect(FileManager.listVersions).not.toHaveBeenCalled();
  });

  it('lists versions with the awaited id and the caller tenant', async () => {
    FileManager.getFileById.mockResolvedValue({ id: 'file_1' });
    FileManager.listVersions.mockResolvedValue([{ id: 'v1' }]);
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctx('file_1'));

    expect(res.status).toBe(200);
    expect(FileManager.listVersions).toHaveBeenCalledWith('file_1', TENANT_A);
    await expect(res.json()).resolves.toEqual({ versions: [{ id: 'v1' }] });
  });

  it("does not enumerate versions of another tenant's file", async () => {
    FileManager.getFileById.mockResolvedValue(null);
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctx('file_owned_by_tenant_b'));

    expect(res.status).toBe(404);
    expect(FileManager.listVersions).not.toHaveBeenCalled();
  });
});

describe('files/[id]/restore — POST', () => {
  const load = () => import('@/app/api/files/[id]/restore/route');

  it('refuses a caller with no tenant context before reading the body', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { POST } = await load();
    const res = await POST(
      jsonBody('https://app.local', { versionId: 'v1' }),
      ctx('file_1') as never,
    );
    expect(res.status).toBe(401);
    expect(FileManager.restoreVersion).not.toHaveBeenCalled();
  });

  it('restores against the caller tenant and the awaited file id', async () => {
    FileManager.restoreVersion.mockResolvedValue(undefined);
    const { POST } = await load();
    const res = await POST(
      jsonBody('https://app.local', { versionId: 'v1' }),
      ctx('file_1') as never,
    );

    expect(res.status).toBe(200);
    expect(FileManager.restoreVersion).toHaveBeenCalledWith({
      tenantId: TENANT_A,
      fileId: 'file_1',
      versionId: 'v1',
    });
  });

  it('rejects a malformed body instead of restoring an unvalidated version', async () => {
    const { POST } = await load();
    const res = await POST(
      jsonBody('https://app.local', { versionId: '' }),
      ctx('file_1') as never,
    );

    expect(res.status).toBe(500);
    expect(FileManager.restoreVersion).not.toHaveBeenCalled();
  });
});

describe('files/[id]/tags — POST', () => {
  const load = () => import('@/app/api/files/[id]/tags/route');
  const tags = [{ name: 'contract', color: '#aabbcc' }];

  it('refuses a caller with no tenant context', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { POST } = await load();
    const res = await POST(jsonBody('https://app.local', { tags }), ctx('file_1') as never);
    expect(res.status).toBe(401);
    expect(FileManager.addTags).not.toHaveBeenCalled();
  });

  it('tags only after proving the file belongs to the caller tenant', async () => {
    FileManager.getFileById.mockResolvedValue({ id: 'file_1' });
    FileManager.addTags.mockResolvedValue(undefined);
    const { POST } = await load();
    const res = await POST(jsonBody('https://app.local', { tags }), ctx('file_1') as never);

    expect(res.status).toBe(200);
    expect(FileManager.getFileById).toHaveBeenCalledWith('file_1', TENANT_A);
    expect(FileManager.addTags).toHaveBeenCalledWith({
      tenantId: TENANT_A,
      fileId: 'file_1',
      tags,
      createdBy: CALLER_A.uid,
    });
  });

  it("will not write tags onto another tenant's file", async () => {
    FileManager.getFileById.mockResolvedValue(null);
    const { POST } = await load();
    const res = await POST(
      jsonBody('https://app.local', { tags }),
      ctx('file_owned_by_tenant_b') as never,
    );

    expect(res.status).toBe(404);
    expect(FileManager.addTags).not.toHaveBeenCalled();
  });

  it('rejects a tag colour that is not a hex triplet', async () => {
    const { POST } = await load();
    const res = await POST(
      jsonBody('https://app.local', { tags: [{ name: 'x', color: 'red' }] }),
      ctx('file_1') as never,
    );

    expect(res.status).toBe(500);
    expect(FileManager.addTags).not.toHaveBeenCalled();
  });
});
