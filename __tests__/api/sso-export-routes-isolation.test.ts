/**
 * Authorisation coverage for the migrated SSO routes and the export-download route.
 *
 * The SSO routes take the provider from the URL path, so the first thing worth pinning is
 * that the provider name is validated against a fixed allow-list rather than passed
 * through — an unvalidated provider would flow into OAuth URL construction. `authorize`
 * additionally has two modes: `login` is deliberately open (there is no session yet), but
 * `link` binds an external identity to the *current* user and therefore must refuse an
 * unauthenticated caller. Both directions are covered, because collapsing them would
 * either break sign-in or let anyone link an identity to an account.
 *
 * `export/jobs/[id]/download` returns a signed URL to an exported data file. Two gates
 * stand in front of it and both are pinned: the job must belong to the caller's tenant,
 * and it must actually be completed. The cross-tenant test asserts no signed URL appears
 * in the response at all, since leaking one would hand over a whole export.
 *
 * All handlers were rewritten by the async-params migration to await a Promise before the
 * path value is used, so each test supplies a real Promise.
 */

export {}; // module scope: dynamic imports only, so without this TypeScript treats the
// file as a global script and its top-level names collide with sibling suites.

const getCurrentUser = jest.fn();
const requireBulkDataAccess = jest.fn();
const createOAuthAuthorizationUrl = jest.fn();
const linkSsoForUser = jest.fn();
const getTenantIdForRequestOrThrow = jest.fn();

const docGet = jest.fn();
const docRef = jest.fn(() => ({ get: docGet }));
const collection = jest.fn(() => ({ doc: docRef }));

jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return { collection };
  },
}));
jest.mock('@/app/api/admin/_utils', () => ({ getCurrentUser: () => getCurrentUser() }));
jest.mock('@/lib/api/bulk-data-guard', () => ({
  requireBulkDataAccess: () => requireBulkDataAccess(),
}));
jest.mock('@/lib/auth/sso-oauth', () => ({
  createOAuthAuthorizationUrl: (...a: unknown[]) => createOAuthAuthorizationUrl(...a),
  linkSsoForUser: (...a: unknown[]) => linkSsoForUser(...a),
}));
jest.mock('@/lib/tenant/server', () => ({
  getTenantIdForRequestOrThrow: (...a: unknown[]) => getTenantIdForRequestOrThrow(...a),
}));

const TENANT_A = 'tenant_a';
const TENANT_B = 'tenant_b';
const USER_A = { uid: 'user_a', tenantId: TENANT_A, role: 'admin', email: 'a@example.com' };

const ctxProvider = (provider: string) => ({ params: Promise.resolve({ provider }) });
const ctxId = (id: string) => ({ params: Promise.resolve({ id }) });
const snapshot = (data: Record<string, unknown> | null) => ({
  exists: data !== null,
  id: 'job_1',
  data: () => data,
});

beforeEach(() => {
  jest.clearAllMocks();
  getCurrentUser.mockResolvedValue(USER_A);
  requireBulkDataAccess.mockResolvedValue({ ok: true, user: USER_A });
  getTenantIdForRequestOrThrow.mockResolvedValue(TENANT_A);
  createOAuthAuthorizationUrl.mockResolvedValue({ authorizeUrl: 'https://idp.example/auth' });
  linkSsoForUser.mockResolvedValue({ ok: true });
});

describe('auth/sso/[provider]/authorize — GET', () => {
  const load = () => import('@/app/api/auth/sso/[provider]/authorize/route');
  const req = (qs: string) =>
    new Request(`https://app.local/api/auth/sso/google/authorize${qs}`) as never;

  it('refuses a provider that is not on the allow-list', async () => {
    const { GET } = await load();
    const res = await GET(req('?tenantId=tenant_a'), ctxProvider('evil-idp'));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(createOAuthAuthorizationUrl).not.toHaveBeenCalled();
  });

  it('requires a tenantId before building an authorization URL', async () => {
    const { GET } = await load();
    const res = await GET(req(''), ctxProvider('google'));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(createOAuthAuthorizationUrl).not.toHaveBeenCalled();
  });

  it('allows login mode without a session, since there is no session yet', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { GET } = await load();
    const res = await GET(req('?tenantId=tenant_a'), ctxProvider('google'));

    expect(res.status).toBeLessThan(400);
    expect(createOAuthAuthorizationUrl).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google', tenantId: TENANT_A, mode: 'login' }),
    );
  });

  it('refuses link mode without a session, because it binds an identity to a user', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { GET } = await load();
    const res = await GET(req('?tenantId=tenant_a&mode=link'), ctxProvider('google'));

    expect(res.status).toBe(401);
    expect(createOAuthAuthorizationUrl).not.toHaveBeenCalled();
  });

  it('binds link mode to the calling user’s own uid', async () => {
    const { GET } = await load();
    const res = await GET(req('?tenantId=tenant_a&mode=link'), ctxProvider('google'));

    expect(res.status).toBeLessThan(400);
    expect(createOAuthAuthorizationUrl).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'link', linkedUid: USER_A.uid }),
    );
  });
});

describe('auth/sso/[provider]/link — POST', () => {
  const load = () => import('@/app/api/auth/sso/[provider]/link/route');
  const req = (body: unknown) =>
    new Request('https://app.local', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never;

  it('refuses an unauthenticated caller', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { POST } = await load();
    const res = await POST(req({ code: 'c' }), ctxProvider('google'));

    expect(res.status).toBe(401);
    expect(linkSsoForUser).not.toHaveBeenCalled();
  });

  it('refuses a provider that is not on the allow-list', async () => {
    const { POST } = await load();
    const res = await POST(req({ code: 'c' }), ctxProvider('evil-idp'));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(linkSsoForUser).not.toHaveBeenCalled();
  });

  it('links against the caller’s own uid and resolved tenant', async () => {
    const { POST } = await load();
    const res = await POST(
      req({ code: 'c', redirectUri: 'https://app.local/cb', codeVerifier: 'v' }),
      ctxProvider('google'),
    );

    expect(res.status).toBeLessThan(400);
    expect(linkSsoForUser).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google', tenantId: TENANT_A, uid: USER_A.uid }),
    );
  });
});

describe('export/jobs/[id]/download — GET', () => {
  const load = () => import('@/app/api/export/jobs/[id]/download/route');

  it('propagates the bulk-data guard’s refusal', async () => {
    requireBulkDataAccess.mockResolvedValue({ ok: false, error: 'Client portal', status: 403 });
    const { GET } = await load();
    expect((await GET(new Request('https://app.local'), ctxId('j1'))).status).toBe(403);
    expect(collection).not.toHaveBeenCalled();
  });

  it('answers 404 for an export job that does not exist', async () => {
    docGet.mockResolvedValue(snapshot(null));
    const { GET } = await load();
    expect((await GET(new Request('https://app.local'), ctxId('missing'))).status).toBe(404);
  });

  it("never hands back a signed URL for another tenant's export", async () => {
    docGet.mockResolvedValue(
      snapshot({ tenantId: TENANT_B, status: 'completed', signedUrl: 'https://leak.example/f' }),
    );
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctxId('j_of_b'));

    expect(res.status).toBe(403);
    // A leaked signed URL would hand over an entire export, so assert it is absent.
    await expect(res.text()).resolves.not.toContain('leak.example');
  });

  it('refuses to serve an export that has not finished', async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_A, status: 'running' }));
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctxId('j1'));

    expect(res.status).toBe(409);
    await expect(res.text()).resolves.not.toContain('signedUrl');
  });

  it('returns the caller’s completed export under the awaited id', async () => {
    docGet.mockResolvedValue(
      snapshot({
        tenantId: TENANT_A,
        status: 'completed',
        fileName: 'export.csv',
        signedUrl: 'https://files.example/ours',
      }),
    );
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctxId('j1'));

    expect(res.status).toBe(200);
    expect(docRef).toHaveBeenCalledWith('j1');
    await expect(res.json()).resolves.toMatchObject({
      fileName: 'export.csv',
      downloadUrl: 'https://files.example/ours',
    });
  });
});
