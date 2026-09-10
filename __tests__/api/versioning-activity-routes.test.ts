/**
 * Coverage for the migrated API-version catch-alls and the activity read-receipt route.
 *
 * The `v1` and `v2` catch-alls are the two routes the codemod could not migrate: their
 * handler is a single shared `handle` function assigned to seven method exports rather than
 * a named `export async function GET`, so the async-params rewrite was done by hand. That
 * makes them the highest-risk migration in the change — an unawaited `context.params` here
 * would break every versioned API path at once — and every exported method is therefore
 * driven through a real Promise here, not just one of them.
 *
 * `v1` proxies to the unversioned path, so the test asserts the *resolved* segments are
 * what gets joined into the target path. `v2` is not published and must answer 501 without
 * proxying anything at all.
 *
 * The activity route is a small ownership case: the read receipt is written against the
 * caller's own tenant and uid with only the activity id coming from the URL, and the
 * service's refusal is passed through with its own status rather than being flattened.
 */

export {}; // module scope: dynamic imports only, so without this TypeScript treats the
// file as a global script and its top-level names collide with sibling suites.

const proxyVersionedRequest = jest.fn();
const applyVersionHeaders = jest.fn();
const getCurrentUser = jest.fn();
const markActivityReadForUser = jest.fn();

jest.mock('@/lib/api/versioning', () => ({
  proxyVersionedRequest: (...a: unknown[]) => proxyVersionedRequest(...a),
  applyVersionHeaders: (...a: unknown[]) => applyVersionHeaders(...a),
}));
jest.mock('@/app/api/admin/_utils', () => ({ getCurrentUser: () => getCurrentUser() }));
jest.mock('@/lib/activity/activity-service', () => ({
  markActivityReadForUser: (...a: unknown[]) => markActivityReadForUser(...a),
}));

const TENANT_A = 'tenant_a';
const USER_A = { uid: 'user_a', tenantId: TENANT_A, role: 'admin', email: 'a@example.com' };

const ctxPath = (path?: string[]) => ({ params: Promise.resolve({ path }) });
const ctxId = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  jest.clearAllMocks();
  getCurrentUser.mockResolvedValue(USER_A);
  markActivityReadForUser.mockResolvedValue({ ok: true });
  proxyVersionedRequest.mockResolvedValue(new Response('{}', { status: 200 }));
  applyVersionHeaders.mockImplementation((res: Response) => res);
});

describe('api/v1/[[...path]] — every method export', () => {
  const load = () => import('@/app/api/v1/[[...path]]/route');
  const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

  it('joins the awaited path segments into the unversioned target', async () => {
    const mod = await load();
    await mod.GET(
      new Request('https://app.local/api/v1/crm/deals') as never,
      ctxPath(['crm', 'deals']),
    );

    expect(proxyVersionedRequest).toHaveBeenCalledWith(expect.anything(), '/api/crm/deals');
  });

  it('falls back to /api when the catch-all matched nothing', async () => {
    const mod = await load();
    await mod.GET(new Request('https://app.local/api/v1') as never, ctxPath(undefined));

    expect(proxyVersionedRequest).toHaveBeenCalledWith(expect.anything(), '/api');
  });

  it('treats an empty segment list the same as no segments', async () => {
    const mod = await load();
    await mod.GET(new Request('https://app.local/api/v1') as never, ctxPath([]));

    expect(proxyVersionedRequest).toHaveBeenCalledWith(expect.anything(), '/api');
  });

  it.each(METHODS)('%s awaits its params rather than proxying "undefined"', async (method) => {
    const mod = (await load()) as unknown as Record<
      string,
      (r: Request, c: unknown) => Promise<Response>
    >;
    await mod[method](new Request('https://app.local/api/v1/x') as never, ctxPath(['x']));

    // All seven exports are the same shared `handle`, hand-migrated rather than codemodded.
    // If it failed to await, the path would render as "/api/undefined".
    expect(proxyVersionedRequest).toHaveBeenCalledWith(expect.anything(), '/api/x');
    expect(applyVersionHeaders).toHaveBeenCalledWith(expect.anything(), '/api/v1');
  });
});

describe('api/v2/[[...path]] — every method export', () => {
  const load = () => import('@/app/api/v2/[[...path]]/route');
  const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

  it.each(METHODS)('%s answers 501 without proxying anything', async (method) => {
    const mod = (await load()) as unknown as Record<
      string,
      (r: Request, c: unknown) => Promise<Response>
    >;
    const res = await mod[method](
      new Request('https://app.local/api/v2/x') as never,
      ctxPath(['x']),
    );

    expect(res.status).toBe(501);
    // v2 is unpublished: nothing may be forwarded to a real handler.
    expect(proxyVersionedRequest).not.toHaveBeenCalled();
  });

  it('reports the requested path back from the awaited segments', async () => {
    const mod = await load();
    const res = await mod.GET(
      new Request('https://app.local/api/v2/crm/deals') as never,
      ctxPath(['crm', 'deals']),
    );

    await expect(res.json()).resolves.toMatchObject({ requestedPath: '/crm/deals' });
  });

  it('reports "/" when the catch-all matched nothing', async () => {
    const mod = await load();
    const res = await mod.GET(new Request('https://app.local/api/v2') as never, ctxPath(undefined));

    await expect(res.json()).resolves.toMatchObject({ requestedPath: '/' });
  });
});

describe('activities/[id]/read — PUT', () => {
  const load = () => import('@/app/api/activities/[id]/read/route');

  it('refuses an unauthenticated caller', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { PUT } = await load();
    const res = await PUT(new Request('https://app.local'), ctxId('act_1'));

    expect(res.status).toBe(401);
    expect(markActivityReadForUser).not.toHaveBeenCalled();
  });

  it('writes the receipt against the caller’s own tenant and uid', async () => {
    const { PUT } = await load();
    const res = await PUT(new Request('https://app.local'), ctxId('act_1'));

    expect(res.status).toBe(200);
    // Only the activity id comes from the URL; tenant and uid come from the session.
    expect(markActivityReadForUser).toHaveBeenCalledWith({
      tenantId: TENANT_A,
      uid: USER_A.uid,
      activityId: 'act_1',
    });
  });

  it('passes the service’s refusal through with its own status', async () => {
    markActivityReadForUser.mockResolvedValue({ ok: false, status: 403, error: 'Forbidden' });
    const { PUT } = await load();
    const res = await PUT(new Request('https://app.local'), ctxId('act_of_other_tenant'));

    expect(res.status).toBe(403);
  });
});
