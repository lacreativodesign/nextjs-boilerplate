/**
 * Tenant-isolation and authorisation coverage for the migrated production-planning routes
 * and the per-user locale route.
 *
 * The two production routes (`gantt-data`, `critical-path`) share a shape worth pinning
 * twice: the project itself is read with an unscoped `doc(id)` and checked against the
 * caller's tenant, but every follow-up collection query is *also* scoped by tenant. Both
 * halves matter — the doc check stops another tenant's project being addressed at all, and
 * the query scoping stops a project id being used to rake tasks, dependencies or
 * milestones out of a tenant the caller does not belong to. The tests assert the refusal
 * happens before any of those queries run.
 *
 * `users/[id]/locale` is a different kind of boundary: not tenant, but self-or-privileged.
 * A user may set their own locale; setting anyone else's requires the ManageUsers
 * permission. Both directions are covered, using the project's real permission table.
 *
 * All three handlers were rewritten by the async-params migration to await a Promise
 * before the id is used, so each test supplies a real Promise and asserts the resolved id
 * reaches the document read.
 */

export {}; // module scope: dynamic imports only, so without this TypeScript treats the
// file as a global script and its top-level names collide with sibling suites.

const getCurrentUser = jest.fn();
const docGet = jest.fn();
const docSet = jest.fn();
const docUpdate = jest.fn();
const queryGet = jest.fn();

const docRef = jest.fn(() => ({ get: docGet, set: docSet, update: docUpdate }));

/** Chainable query stub: .where(...).where(...).get() and .orderBy/.limit as no-ops. */
const makeQuery = () => {
  const q: Record<string, unknown> = {};
  q.where = jest.fn(() => q);
  q.orderBy = jest.fn(() => q);
  q.limit = jest.fn(() => q);
  q.get = queryGet;
  return q;
};
const collection = jest.fn(() => ({ doc: docRef, ...makeQuery() }));

jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return { collection };
  },
}));
jest.mock('@/app/api/admin/_utils', () => ({
  getCurrentUser: () => getCurrentUser(),
}));
jest.mock('firebase-admin', () => ({
  firestore: { FieldValue: { serverTimestamp: () => ({ __ts: 'now' }) } },
}));

const TENANT_A = 'tenant_a';
const TENANT_B = 'tenant_b';
const USER_A = { uid: 'user_a', tenantId: TENANT_A, role: 'admin', email: 'a@example.com' };

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const snapshot = (data: Record<string, unknown> | null) => ({
  exists: data !== null,
  id: 'doc_id',
  data: () => data,
});

beforeEach(() => {
  jest.clearAllMocks();
  getCurrentUser.mockResolvedValue(USER_A);
  queryGet.mockResolvedValue({ docs: [] });
});

describe.each([
  ['gantt-data', () => import('@/app/api/production/projects/[id]/gantt-data/route')],
  ['critical-path', () => import('@/app/api/production/projects/[id]/critical-path/route')],
])('production/projects/[id]/%s — GET', (_name, load) => {
  it('refuses a caller with no tenant context', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctx('p1'));

    expect(res.status).toBe(401);
    expect(collection).not.toHaveBeenCalled();
  });

  it('answers 404 for a project that does not exist', async () => {
    docGet.mockResolvedValue(snapshot(null));
    const { GET } = await load();
    expect((await GET(new Request('https://app.local'), ctx('missing'))).status).toBe(404);
  });

  it("refuses another tenant's project before running any follow-up query", async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_B, name: 'Their project' }));
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctx('p_of_b'));

    expect(res.status).toBe(403);
    // The refusal must land before tasks/dependencies/milestones are read: otherwise a
    // project id from another tenant becomes a way to enumerate their planning data.
    expect(queryGet).not.toHaveBeenCalled();
  });

  it('serves an in-tenant project, reading it under the awaited id', async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_A, name: 'Our project' }));
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctx('p1'));

    expect(res.status).toBe(200);
    expect(docRef).toHaveBeenCalledWith('p1');
  });
});

describe('users/[id]/locale — PUT', () => {
  const load = () => import('@/app/api/users/[id]/locale/route');

  beforeEach(() => {
    // The route also checks the *target* user is in the caller's tenant before writing.
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_A }));
  });

  const localeRequest = (locale: unknown) =>
    new Request('https://app.local', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale }),
    });

  it('refuses an unauthenticated caller', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { PUT } = await load();
    expect((await PUT(localeRequest('en-US'), ctx('user_a'))).status).toBe(401);
    expect(docSet).not.toHaveBeenCalled();
    expect(docUpdate).not.toHaveBeenCalled();
  });

  it('lets a user set their own locale', async () => {
    const { PUT } = await load();
    const res = await PUT(localeRequest('en-US'), ctx(USER_A.uid));
    expect(res.status).toBe(200);
  });

  it("refuses an ordinary user setting someone else's locale", async () => {
    getCurrentUser.mockResolvedValue({ ...USER_A, role: 'staff' });
    const { PUT } = await load();
    const res = await PUT(localeRequest('en-US'), ctx('someone_else'));

    expect(res.status).toBe(403);
    expect(docSet).not.toHaveBeenCalled();
    expect(docUpdate).not.toHaveBeenCalled();
  });

  it("lets a user-manager set someone else's locale", async () => {
    // USER_A is an admin, which carries ManageUsers in the project's real permission table.
    const { PUT } = await load();
    expect((await PUT(localeRequest('en-US'), ctx('someone_else'))).status).toBe(200);
  });

  it('refuses to set the locale of a user in another tenant', async () => {
    // Self-or-privileged is not the only boundary here: an admin of tenant A must still
    // not be able to reach a user record belonging to tenant B.
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_B }));
    const { PUT } = await load();
    const res = await PUT(localeRequest('en-US'), ctx('user_of_tenant_b'));

    expect(res.status).toBe(403);
    expect(docUpdate).not.toHaveBeenCalled();
  });

  it('rejects a locale too short to be a code (schema)', async () => {
    const { PUT } = await load();
    expect((await PUT(localeRequest('x'), ctx(USER_A.uid))).status).toBe(400);
  });

  it('rejects a well-formed code that is not in the supported set', async () => {
    const { PUT } = await load();
    expect((await PUT(localeRequest('zz-ZZ'), ctx(USER_A.uid))).status).toBe(400);
  });
});
