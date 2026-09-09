/**
 * Behavioural, tenant-isolation and access-control coverage for `app/api/documents/[id]`.
 *
 * Both routes load a document straight from a URL id with an unscoped
 * `collection('documents').doc(id)` read, so — unlike the files family — the tenant check
 * happens *after* the read, in the handler itself. That makes the comparison
 * `document.tenantId !== session.tenantId` the entire isolation boundary, and it is
 * asserted here rather than assumed.
 *
 * The download route additionally carries a defence-in-depth gate: a document whose
 * virus scan came back `infected` must never be served even to a caller who legitimately
 * owns it. That gate is pinned too, along with the deliberate decision that non-definitive
 * verdicts stay downloadable.
 *
 * The async-params migration rewrote both handlers to await a Promise before that id is
 * ever used. A handler that failed to await would read `documents/undefined`, so each test
 * drives a real Promise and asserts the resolved id reaches the read and the storage layer.
 */

const getCurrentUser = jest.fn();
const docGet = jest.fn();
const docRef = jest.fn(() => ({ get: docGet }));
const collection = jest.fn(() => ({ doc: docRef }));

const StorageService = {
  getDownloadUrl: jest.fn(),
  createVersion: jest.fn(),
};

jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return { collection };
  },
}));
jest.mock('@/app/api/admin/_utils', () => ({
  getCurrentUser: () => getCurrentUser(),
  isAdminOrSuper: (role?: string | null) => role === 'admin' || role === 'super_admin',
}));
jest.mock('@/lib/storage/storage-service', () => ({
  get StorageService() {
    return StorageService;
  },
}));

const TENANT_A = 'tenant_a';
const TENANT_B = 'tenant_b';
const OWNER = { uid: 'user_a', tenantId: TENANT_A, role: 'staff', email: 'a@example.com' };

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const snapshot = (data: Record<string, unknown> | null) => ({
  exists: data !== null,
  data: () => data,
});

beforeEach(() => {
  jest.clearAllMocks();
  getCurrentUser.mockResolvedValue(OWNER);
  StorageService.getDownloadUrl.mockResolvedValue('https://signed.example/doc');
});

describe('documents/[id]/download — GET', () => {
  const load = () => import('@/app/api/documents/[id]/download/route');

  it('refuses a caller with no tenant context', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctx('doc_1'));
    expect(res.status).toBe(401);
    expect(collection).not.toHaveBeenCalled();
  });

  it('reads the document under the awaited id and serves it to its owner', async () => {
    docGet.mockResolvedValue(
      snapshot({ tenantId: TENANT_A, uploadedBy: OWNER.uid, visibility: 'private' }),
    );
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctx('doc_1'));

    expect(res.status).toBe(200);
    expect(docRef).toHaveBeenCalledWith('doc_1');
    expect(StorageService.getDownloadUrl).toHaveBeenCalledWith('doc_1');
    await expect(res.json()).resolves.toEqual({ downloadUrl: 'https://signed.example/doc' });
  });

  it('answers 404 when the document does not exist', async () => {
    docGet.mockResolvedValue(snapshot(null));
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctx('missing'));
    expect(res.status).toBe(404);
    expect(StorageService.getDownloadUrl).not.toHaveBeenCalled();
  });

  it('refuses a document belonging to another tenant, even one marked public', async () => {
    // visibility 'public' would pass the access check on its own — tenant is checked first,
    // so a public document in tenant B is still unreachable from tenant A.
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_B, visibility: 'public' }));
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctx('doc_of_tenant_b'));

    expect(res.status).toBe(403);
    expect(StorageService.getDownloadUrl).not.toHaveBeenCalled();
  });

  it('refuses a private in-tenant document the caller has no claim on', async () => {
    docGet.mockResolvedValue(
      snapshot({ tenantId: TENANT_A, uploadedBy: 'someone_else', visibility: 'private' }),
    );
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctx('doc_1'));

    expect(res.status).toBe(403);
    expect(StorageService.getDownloadUrl).not.toHaveBeenCalled();
  });

  it('allows a private in-tenant document the caller was explicitly shared on', async () => {
    docGet.mockResolvedValue(
      snapshot({
        tenantId: TENANT_A,
        uploadedBy: 'someone_else',
        visibility: 'private',
        sharedWith: [OWNER.uid],
      }),
    );
    const { GET } = await load();
    expect((await GET(new Request('https://app.local'), ctx('doc_1'))).status).toBe(200);
  });

  it('never serves a file the scanner flagged as infected, even to its owner', async () => {
    docGet.mockResolvedValue(
      snapshot({
        tenantId: TENANT_A,
        uploadedBy: OWNER.uid,
        visibility: 'private',
        virusScanStatus: 'infected',
      }),
    );
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctx('doc_1'));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ code: 'file_infected' });
    expect(StorageService.getDownloadUrl).not.toHaveBeenCalled();
  });

  it('still serves a document whose scan verdict is not definitive', async () => {
    // Deliberate: most uploads are stored with no scanner deployed, and blocking
    // 'unscanned' would break normal file access. Only 'infected' blocks.
    docGet.mockResolvedValue(
      snapshot({
        tenantId: TENANT_A,
        uploadedBy: OWNER.uid,
        visibility: 'private',
        virusScanStatus: 'unscanned',
      }),
    );
    const { GET } = await load();
    expect((await GET(new Request('https://app.local'), ctx('doc_1'))).status).toBe(200);
  });
});

describe('documents/[id]/version — POST', () => {
  const load = () => import('@/app/api/documents/[id]/version/route');

  /**
   * The route consumes exactly one thing from the request: `(await request.formData()).get('file')`,
   * and then the entry's name, size, type and bytes. This stubs that contract directly.
   *
   * A real FormData cannot be used here: jsdom's FormData rejects the polyfilled global
   * File as "not of type 'Blob'", and routing a File through `new Request({ body: form })`
   * drops the filename, so the route's extension check — the thing under test — would never
   * see an extension at all. Stubbing the contract keeps the assertions about the route's
   * validation rather than about the environment's FormData implementation.
   */
  const upload = (name: string, bytes = 'hello world') => ({
    name,
    size: bytes.length,
    type: 'text/plain',
    arrayBuffer: async () => new TextEncoder().encode(bytes).buffer,
  });

  const formRequest = (file?: ReturnType<typeof upload>) =>
    ({
      formData: async () => ({ get: (key: string) => (key === 'file' ? (file ?? null) : null) }),
    }) as unknown as Request;

  it('refuses a caller with no tenant context', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { POST } = await load();
    const res = await POST(formRequest(), ctx('doc_1') as never);
    expect(res.status).toBe(401);
    expect(collection).not.toHaveBeenCalled();
  });

  it("refuses to version another tenant's document", async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_B, uploadedBy: OWNER.uid }));
    const { POST } = await load();
    const res = await POST(formRequest(), ctx('doc_of_tenant_b') as never);

    expect(res.status).toBe(403);
    expect(StorageService.createVersion).not.toHaveBeenCalled();
  });

  it('refuses an in-tenant document the caller neither owns nor administers', async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_A, uploadedBy: 'someone_else' }));
    const { POST } = await load();
    const res = await POST(formRequest(), ctx('doc_1') as never);

    expect(res.status).toBe(403);
    expect(StorageService.createVersion).not.toHaveBeenCalled();
  });

  it('rejects a request with no file rather than creating an empty version', async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_A, uploadedBy: OWNER.uid }));
    const { POST } = await load();
    const res = await POST(formRequest(), ctx('doc_1') as never);

    expect(res.status).toBe(400);
    expect(StorageService.createVersion).not.toHaveBeenCalled();
  });

  it('rejects a file whose extension is not permitted', async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_A, uploadedBy: OWNER.uid }));
    const { POST } = await load();
    const res = await POST(formRequest(upload('payload.sh', '#!/bin/sh')), ctx('doc_1') as never);

    expect(res.status).toBe(400);
    expect(StorageService.createVersion).not.toHaveBeenCalled();
  });

  it('creates the version against the caller tenant and the awaited document id', async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_A, uploadedBy: OWNER.uid }));
    StorageService.createVersion.mockResolvedValue('doc_2');
    const { POST } = await load();
    const res = await POST(formRequest(upload('notes.txt')), ctx('doc_1') as never);

    expect(res.status).toBe(200);
    expect(StorageService.createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_A,
        userId: OWNER.uid,
        originalDocumentId: 'doc_1',
        fileName: 'notes.txt',
      }),
    );
  });
});
