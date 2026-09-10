/**
 * Tenant-isolation coverage for the migrated `automation/workflows/[id]` routes.
 *
 * All three guard the same way and all three are pinned: the workflow is read with an
 * unscoped `doc(id)`, and the handler then requires `snap.data().tenantId` to equal the
 * caller's. Note the deliberate choice being locked in here — a workflow belonging to
 * another tenant is reported as **404, not 403**, so the endpoint does not confirm that an
 * id exists in some other tenant. The tests assert the status code, not merely "refused".
 *
 * The write paths matter more than a read would: `PUT` merges an arbitrary request body
 * into the workflow document, so the tenant check is the only thing standing between a
 * caller and overwriting another tenant's automation. The suite asserts no write happens
 * on the refusal path, and that the tenant stamped onto the document on the success path
 * comes from the session rather than the body.
 *
 * The async-params migration rewrote each handler to await a Promise before the id is
 * used, so every test supplies a real Promise and asserts the resolved id reaches the read.
 */

export {}; // module scope: dynamic imports only, so without this TypeScript treats the
// file as a global script and its top-level names collide with sibling suites.

const requireAutomationAdmin = jest.fn();
const docGet = jest.fn();
const docSet = jest.fn();
const queryGet = jest.fn();

const docRef = jest.fn(() => ({ get: docGet, set: docSet }));

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
jest.mock('@/app/api/automation/_utils', () => ({
  requireAutomationAdmin: () => requireAutomationAdmin(),
}));

const TENANT_A = 'tenant_a';
const TENANT_B = 'tenant_b';
const USER_A = { uid: 'user_a', tenantId: TENANT_A, role: 'admin', email: 'a@example.com' };

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const snapshot = (data: Record<string, unknown> | null) => ({
  exists: data !== null,
  data: () => data,
});

const jsonPut = (body: unknown) =>
  new Request('https://app.local', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  requireAutomationAdmin.mockResolvedValue({ ok: true, user: USER_A });
  queryGet.mockResolvedValue({ docs: [] });
});

describe('automation/workflows/[id] — PUT', () => {
  const load = () => import('@/app/api/automation/workflows/[id]/route');

  it('propagates the automation-admin guard’s refusal without reading anything', async () => {
    requireAutomationAdmin.mockResolvedValue({ ok: false, error: 'Forbidden', status: 403 });
    const { PUT } = await load();
    const res = await PUT(jsonPut({ name: 'x' }), ctx('w1'));

    expect(res.status).toBe(403);
    expect(collection).not.toHaveBeenCalled();
  });

  it('reports 404 — not 403 — for a workflow in another tenant, and writes nothing', async () => {
    // 404 is deliberate: a 403 would confirm the id exists somewhere else.
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_B, name: 'Theirs' }));
    const { PUT } = await load();
    const res = await PUT(jsonPut({ name: 'hijacked' }), ctx('w_of_b'));

    expect(res.status).toBe(404);
    expect(docSet).not.toHaveBeenCalled();
  });

  it('reports 404 for a workflow that does not exist at all', async () => {
    docGet.mockResolvedValue(snapshot(null));
    const { PUT } = await load();
    expect((await PUT(jsonPut({ name: 'x' }), ctx('missing'))).status).toBe(404);
    expect(docSet).not.toHaveBeenCalled();
  });

  it('stamps the session tenant onto the document, not one supplied in the body', async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_A }));
    const { PUT } = await load();
    const res = await PUT(jsonPut({ name: 'ours', tenantId: TENANT_B }), ctx('w1'));

    expect(res.status).toBe(200);
    expect(docRef).toHaveBeenCalledWith('w1');
    // The body tried to set tenantId to tenant B; the route must overwrite it with the
    // caller's own tenant, so the record cannot be re-homed by a crafted payload.
    expect(docSet).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A, updatedBy: USER_A.uid }),
      { merge: true },
    );
  });
});

describe('automation/workflows/[id]/toggle — PUT', () => {
  const load = () => import('@/app/api/automation/workflows/[id]/toggle/route');

  it('propagates the guard’s refusal', async () => {
    requireAutomationAdmin.mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });
    const { PUT } = await load();
    expect((await PUT(new Request('https://app.local'), ctx('w1'))).status).toBe(401);
    expect(collection).not.toHaveBeenCalled();
  });

  it("will not toggle another tenant's workflow", async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_B, status: 'active' }));
    const { PUT } = await load();
    const res = await PUT(new Request('https://app.local'), ctx('w_of_b'));

    expect(res.status).toBe(404);
    expect(docSet).not.toHaveBeenCalled();
  });

  it('disables an active workflow', async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_A, status: 'active' }));
    const { PUT } = await load();
    const res = await PUT(new Request('https://app.local'), ctx('w1'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: 'disabled' });
    expect(docSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'disabled' }), {
      merge: true,
    });
  });

  it('treats any non-active status as disabled and enables it', async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_A, status: 'something_else' }));
    const { PUT } = await load();
    const res = await PUT(new Request('https://app.local'), ctx('w1'));

    await expect(res.json()).resolves.toMatchObject({ status: 'active' });
  });
});

describe('automation/workflows/[id]/runs — GET', () => {
  const load = () => import('@/app/api/automation/workflows/[id]/runs/route');

  it('propagates the guard’s refusal without querying runs', async () => {
    requireAutomationAdmin.mockResolvedValue({ ok: false, error: 'Forbidden', status: 403 });
    const { GET } = await load();
    expect((await GET(new Request('https://app.local'), ctx('w1'))).status).toBe(403);
    expect(queryGet).not.toHaveBeenCalled();
  });

  it('scopes the run query by the caller tenant as well as the awaited workflow id', async () => {
    const logsGet = jest.fn().mockResolvedValue({ docs: [{ data: () => ({ ts: 1 }) }] });
    const runDoc = {
      id: 'r1',
      data: () => ({ status: 'succeeded' }),
      ref: { collection: () => ({ orderBy: () => ({ get: logsGet }) }) },
    };
    queryGet.mockResolvedValue({ docs: [runDoc] });

    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctx('w1'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      runs: [{ id: 'r1', status: 'succeeded', logs: [{ ts: 1 }] }],
    });

    // Tenant is part of the query, so a workflow id alone cannot reach another tenant's runs.
    const query = collection.mock.results[0].value as { where: jest.Mock };
    expect(query.where).toHaveBeenCalledWith('tenantId', '==', TENANT_A);
    expect(query.where).toHaveBeenCalledWith('workflowId', '==', 'w1');
  });
});
