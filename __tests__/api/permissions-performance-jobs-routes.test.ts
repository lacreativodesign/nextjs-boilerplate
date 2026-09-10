/**
 * Authorisation coverage for the remaining migrated admin-surface routes: permission role
 * and user-permission reads, performance targets, saved searches, and the job retry hook.
 *
 * The three `requireAdminOrSuperAdmin` routes are pinned on the guard actually stopping the
 * handler — for the permissions pair that matters more than usual, because these endpoints
 * read and write the permission model itself, so a caller who slipped past the guard would
 * be editing the thing that decides everyone else's access.
 *
 * `permissions/user/[userId]` additionally scopes its snapshot by `auth.user.tenantId`, with
 * only the userId coming from the URL. That pairing is asserted explicitly: a user id alone
 * must not resolve a permission snapshot belonging to another tenant.
 *
 * `performance/targets/[targetId]` layers a manager-role check ahead of a tenant check, and
 * both are covered — including that a manager of one tenant is still refused another
 * tenant's target, so the role check is not mistaken for sufficient authority. Its two
 * handlers gate differently on purpose (PATCH admits the whole manager set, DELETE only
 * admin/super_admin), and that asymmetry is pinned by driving one manager role through both.
 *
 * `search/saved/[id]` pushes ownership down into the service with tenant AND uid, so it is
 * pinned on forwarding the session's own pair rather than anything from the request.
 *
 * Every handler awaits a Promise for its path parameter after the migration, so each test
 * supplies a real Promise and asserts the resolved value is what flows on.
 */

export {}; // module scope: dynamic imports only, so without this TypeScript treats the
// file as a global script and its top-level names collide with sibling suites.

const requireAdminOrSuperAdmin = jest.fn();
const getCurrentUser = jest.fn();
const buildUserPermissionSnapshot = jest.fn();
const assignRolesToUser = jest.fn();
const invalidateUserPermissionCache = jest.fn();
const deleteSavedAdvancedSearch = jest.fn();
const retryFailedJob = jest.fn();
const processDueJobs = jest.fn();

const docGet = jest.fn();
const docSet = jest.fn();
const docUpdate = jest.fn();
const docDelete = jest.fn();
const docRef = jest.fn(() => ({ get: docGet, set: docSet, update: docUpdate, delete: docDelete }));
const collection = jest.fn(() => ({ doc: docRef }));

jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return { collection };
  },
}));
jest.mock('@/app/api/admin/_utils', () => ({
  // Only the two auth entry points are replaced. `normalizeRole` stays real: these routes
  // gate on its output, and a hand-rolled stand-in would silently drop its `-`/`_` folding.
  ...jest.requireActual('@/app/api/admin/_utils'),
  requireAdminOrSuperAdmin: () => requireAdminOrSuperAdmin(),
  getCurrentUser: () => getCurrentUser(),
}));
jest.mock('@/lib/permissions/permission-engine', () => ({
  buildUserPermissionSnapshot: (...a: unknown[]) => buildUserPermissionSnapshot(...a),
  assignRolesToUser: (...a: unknown[]) => assignRolesToUser(...a),
  invalidateUserPermissionCache: (...a: unknown[]) => invalidateUserPermissionCache(...a),
}));
jest.mock('@/lib/search/advanced-search', () => ({
  deleteSavedAdvancedSearch: (...a: unknown[]) => deleteSavedAdvancedSearch(...a),
}));
jest.mock('@/lib/jobs/job-queue', () => ({
  retryFailedJob: (...a: unknown[]) => retryFailedJob(...a),
  processDueJobs: (...a: unknown[]) => processDueJobs(...a),
}));

const TENANT_A = 'tenant_a';
const TENANT_B = 'tenant_b';
const ADMIN_A = { uid: 'admin_a', tenantId: TENANT_A, role: 'admin', email: 'a@example.com' };

const ctxId = (id: string) => ({ params: Promise.resolve({ id }) });
const ctxUserId = (userId: string) => ({ params: Promise.resolve({ userId }) });
const ctxTarget = (targetId: string) => ({ params: Promise.resolve({ targetId }) });

const jsonReq = (body: unknown, method = 'PUT') =>
  new Request('https://app.local', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  requireAdminOrSuperAdmin.mockResolvedValue({ ok: true, user: ADMIN_A });
  getCurrentUser.mockResolvedValue(ADMIN_A);
  buildUserPermissionSnapshot.mockResolvedValue({ modules: [] });
  deleteSavedAdvancedSearch.mockResolvedValue(true);
  retryFailedJob.mockResolvedValue(undefined);
  processDueJobs.mockResolvedValue({ processed: 0 });
  docGet.mockResolvedValue({ exists: true, data: () => ({ tenantId: TENANT_A }) });
  docDelete.mockResolvedValue(undefined);
});

describe('permissions/user/[userId] — GET', () => {
  const load = () => import('@/app/api/permissions/user/[userId]/route');

  it('refuses a caller the admin guard rejects, without building a snapshot', async () => {
    requireAdminOrSuperAdmin.mockResolvedValue({ ok: false, error: 'Forbidden', status: 403 });
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctxUserId('u1'));

    expect(res.status).toBe(403);
    expect(buildUserPermissionSnapshot).not.toHaveBeenCalled();
  });

  it('scopes the snapshot to the caller tenant and the awaited user id', async () => {
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctxUserId('u_target'));

    expect(res.status).toBe(200);
    // Tenant from the session, user id from the URL — a user id alone must not resolve a
    // snapshot belonging to another tenant.
    expect(buildUserPermissionSnapshot).toHaveBeenCalledWith(TENANT_A, 'u_target');
  });

  it('does not leak an internal failure as a partial snapshot', async () => {
    buildUserPermissionSnapshot.mockRejectedValue(new Error('firestore unavailable'));
    const { GET } = await load();
    expect((await GET(new Request('https://app.local'), ctxUserId('u1'))).status).toBe(500);
  });
});

describe('permissions/roles/[id] — PUT', () => {
  const load = () => import('@/app/api/permissions/roles/[id]/route');

  it('refuses a caller the admin guard rejects, without touching the role', async () => {
    // These endpoints edit the permission model itself, so slipping past the guard would
    // mean editing what decides everyone else's access.
    requireAdminOrSuperAdmin.mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });
    const { PUT } = await load();
    const res = await PUT(jsonReq({ name: 'Ops' }), ctxId('role_1'));

    expect(res.status).toBe(401);
    expect(collection).not.toHaveBeenCalled();
  });

  it('addresses the role document under the awaited id', async () => {
    const { PUT } = await load();
    await PUT(jsonReq({ name: 'Ops', permissions: [] }), ctxId('role_9'));

    expect(docRef).toHaveBeenCalledWith('role_9');
  });
});

describe('performance/targets/[targetId] — PATCH', () => {
  const load = () => import('@/app/api/performance/targets/[targetId]/route');

  it('refuses an unauthenticated caller', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { PATCH } = await load();
    const res = await PATCH(jsonReq({ value: 10 }, 'PATCH') as never, ctxTarget('t1'));

    expect(res.status).toBe(401);
    expect(collection).not.toHaveBeenCalled();
  });

  it('refuses a non-manager role before reading the target', async () => {
    getCurrentUser.mockResolvedValue({ ...ADMIN_A, role: 'sales' });
    const { PATCH } = await load();
    const res = await PATCH(jsonReq({ value: 10 }, 'PATCH') as never, ctxTarget('t1'));

    expect(res.status).toBe(403);
    expect(collection).not.toHaveBeenCalled();
  });

  it("refuses a manager of one tenant another tenant's target", async () => {
    // The manager-role check is necessary but not sufficient: tenant is checked too.
    docGet.mockResolvedValue({ exists: true, data: () => ({ tenantId: TENANT_B }) });
    const { PATCH } = await load();
    const res = await PATCH(jsonReq({ value: 10 }, 'PATCH') as never, ctxTarget('t_of_b'));

    expect(res.status).toBe(403);
    expect(docUpdate).not.toHaveBeenCalled();
    expect(docSet).not.toHaveBeenCalled();
  });

  it('answers 404 for a target that does not exist', async () => {
    docGet.mockResolvedValue({ exists: false, data: () => undefined });
    const { PATCH } = await load();
    expect(
      (await PATCH(jsonReq({ value: 10 }, 'PATCH') as never, ctxTarget('missing'))).status,
    ).toBe(404);
  });
});

describe('performance/targets/[targetId] — DELETE', () => {
  const load = () => import('@/app/api/performance/targets/[targetId]/route');

  it('refuses an unauthenticated caller', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { DELETE } = await load();
    const res = await DELETE(new Request('https://app.local') as never, ctxTarget('t1'));

    expect(res.status).toBe(401);
    expect(collection).not.toHaveBeenCalled();
  });

  it('admits a manager to EDIT a target but refuses that same manager the DELETE', async () => {
    // The two handlers in this file deliberately gate differently: PATCH admits the whole
    // manager set, DELETE only admin/super_admin. If DELETE ever widened to match PATCH,
    // every sales/production/HR manager would silently gain destructive authority — so the
    // asymmetry is asserted with one role, driven through both handlers.
    getCurrentUser.mockResolvedValue({ ...ADMIN_A, role: 'sales_manager' });
    const mod = await load();

    expect(
      (await mod.PATCH(jsonReq({ metrics: { calls: 10 } }, 'PATCH') as never, ctxTarget('t1')))
        .status,
    ).toBe(200);

    const res = await mod.DELETE(new Request('https://app.local') as never, ctxTarget('t1'));
    expect(res.status).toBe(403);
    expect(docDelete).not.toHaveBeenCalled();
  });

  it("refuses an admin another tenant's target", async () => {
    // Being an admin is authority within your own tenant, not across tenants.
    docGet.mockResolvedValue({ exists: true, data: () => ({ tenantId: TENANT_B }) });
    const { DELETE } = await load();
    const res = await DELETE(new Request('https://app.local') as never, ctxTarget('t_of_b'));

    expect(res.status).toBe(403);
    expect(docDelete).not.toHaveBeenCalled();
  });

  it('answers 404 for a target that does not exist, without deleting', async () => {
    docGet.mockResolvedValue({ exists: false, data: () => undefined });
    const { DELETE } = await load();
    const res = await DELETE(new Request('https://app.local') as never, ctxTarget('missing'));

    expect(res.status).toBe(404);
    expect(docDelete).not.toHaveBeenCalled();
  });

  it('deletes the target addressed by the AWAITED path parameter', async () => {
    const { DELETE } = await load();
    const res = await DELETE(new Request('https://app.local') as never, ctxTarget('t_9'));

    expect(res.status).toBe(200);
    // An unawaited params object would address the document id "undefined".
    expect(docRef).toHaveBeenCalledWith('t_9');
    expect(docDelete).toHaveBeenCalledTimes(1);
  });
});

describe('search/saved/[id] — DELETE', () => {
  const load = () => import('@/app/api/search/saved/[id]/route');

  it('refuses a caller with no tenant or uid', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { DELETE } = await load();
    const res = await DELETE(new Request('https://app.local') as never, ctxId('s1'));

    expect(res.status).toBe(401);
    expect(deleteSavedAdvancedSearch).not.toHaveBeenCalled();
  });

  it('deletes with the session tenant AND uid, plus the awaited id', async () => {
    const { DELETE } = await load();
    const res = await DELETE(new Request('https://app.local') as never, ctxId('s1'));

    expect(res.status).toBe(200);
    expect(deleteSavedAdvancedSearch).toHaveBeenCalledWith({
      tenantId: TENANT_A,
      uid: ADMIN_A.uid,
      id: 's1',
    });
  });

  it("reports 404 when the saved search is not the caller's", async () => {
    deleteSavedAdvancedSearch.mockResolvedValue(false);
    const { DELETE } = await load();
    expect((await DELETE(new Request('https://app.local') as never, ctxId('s_of_b'))).status).toBe(
      404,
    );
  });
});

describe('admin/jobs/[id]/retry — POST', () => {
  const load = () => import('@/app/api/admin/jobs/[id]/retry/route');

  it('refuses a caller the admin guard rejects, without retrying anything', async () => {
    requireAdminOrSuperAdmin.mockResolvedValue({ ok: false, error: 'Forbidden', status: 403 });
    const { POST } = await load();
    const res = await POST(new Request('https://app.local') as never, ctxId('job_1'));

    expect(res.status).toBe(403);
    expect(retryFailedJob).not.toHaveBeenCalled();
  });

  it('retries the awaited job id', async () => {
    const { POST } = await load();
    const res = await POST(new Request('https://app.local') as never, ctxId('job_9'));

    expect(res.status).toBe(200);
    expect(retryFailedJob).toHaveBeenCalledWith('job_9');
  });

  it('reports a retry failure as a client error rather than a success', async () => {
    retryFailedJob.mockRejectedValue(new Error('Job is not in a failed state.'));
    const { POST } = await load();
    expect((await POST(new Request('https://app.local') as never, ctxId('job_9'))).status).toBe(
      400,
    );
  });
});
