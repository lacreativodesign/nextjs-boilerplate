/**
 * Behavioural and ownership coverage for the migrated `dashboard/widgets/[id]` and
 * `saved-searches/[id]` routes.
 *
 * These two families guard ownership in opposite ways, and both are asserted here:
 *
 *  - dashboard widgets push the check *down* into the service layer, passing tenant and
 *    uid alongside the id. Nothing in the route re-checks the result, so the route's whole
 *    contribution to isolation is that it forwards the session's own tenant and uid rather
 *    than anything from the request. That is what these tests pin.
 *  - saved searches do the opposite: an unscoped `doc(id)` read followed by two explicit
 *    comparisons in the handler — tenant first, then owner-or-admin. Both refusals are
 *    covered, including the case where a same-tenant non-owner is refused while an admin
 *    of that tenant is allowed.
 *
 * The async-params migration rewrote every one of these handlers to await a Promise before
 * the id is used, so each test supplies a real Promise and asserts the resolved value is
 * what reaches the service or the document read.
 */

export {}; // module scope: this suite uses only dynamic imports, so without this
// TypeScript treats it as a global script and its top-level names collide with sibling suites.

const getCurrentUser = jest.fn();
const removeWidget = jest.fn();
const getWidgetById = jest.fn();
const getWidgetData = jest.fn();

const docDelete = jest.fn();
const docUpdate = jest.fn();
const docGet = jest.fn();
const docRef = jest.fn(() => ({ get: docGet, delete: docDelete, update: docUpdate }));
const collection = jest.fn(() => ({ doc: docRef }));

jest.mock('@/app/api/admin/_utils', () => ({
  getCurrentUser: () => getCurrentUser(),
  normalizeRole: (role: string) => String(role || '').toLowerCase(),
}));
jest.mock('@/lib/dashboard/dashboard-service', () => ({
  removeWidget: (...args: unknown[]) => removeWidget(...args),
  getWidgetById: (...args: unknown[]) => getWidgetById(...args),
}));
jest.mock('@/lib/dashboard/widget-manager', () => ({
  getWidgetData: (...args: unknown[]) => getWidgetData(...args),
}));
jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return { collection };
  },
}));
jest.mock('firebase-admin', () => ({
  firestore: { FieldValue: { increment: (n: number) => ({ __increment: n }) } },
}));
jest.mock('firebase-admin/firestore', () => ({
  Timestamp: { now: () => ({ __ts: 'now' }) },
}));

const TENANT_A = 'tenant_a';
const TENANT_B = 'tenant_b';
const USER_A = { uid: 'user_a', tenantId: TENANT_A, role: 'staff', email: 'a@example.com' };

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const snapshot = (data: Record<string, unknown> | null) => ({
  exists: data !== null,
  data: () => data,
});

beforeEach(() => {
  jest.clearAllMocks();
  getCurrentUser.mockResolvedValue(USER_A);
});

describe('dashboard/widgets/[id] — DELETE', () => {
  const load = () => import('@/app/api/dashboard/widgets/[id]/route');

  it('refuses a caller with no tenant context', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { DELETE } = await load();
    const res = await DELETE(new Request('https://app.local'), ctx('w1'));
    expect(res.status).toBe(401);
    expect(removeWidget).not.toHaveBeenCalled();
  });

  it('removes only within the session tenant and uid, using the awaited id', async () => {
    removeWidget.mockResolvedValue(true);
    const { DELETE } = await load();
    const res = await DELETE(new Request('https://app.local'), ctx('w1'));

    expect(res.status).toBe(200);
    // Tenant and uid come from the session; only the id comes from the request.
    expect(removeWidget).toHaveBeenCalledWith(TENANT_A, USER_A.uid, 'w1');
  });

  it("reports 404 when the widget is not the caller's to remove", async () => {
    // The service returns false for a widget owned by another tenant or user; the route
    // must not translate that into a success.
    removeWidget.mockResolvedValue(false);
    const { DELETE } = await load();
    const res = await DELETE(new Request('https://app.local'), ctx('w_of_tenant_b'));

    expect(res.status).toBe(404);
    expect(removeWidget).toHaveBeenCalledWith(TENANT_A, USER_A.uid, 'w_of_tenant_b');
  });

  it('does not report success when the service throws', async () => {
    removeWidget.mockRejectedValue(new Error('firestore unavailable'));
    const { DELETE } = await load();
    expect((await DELETE(new Request('https://app.local'), ctx('w1'))).status).toBe(500);
  });
});

describe('dashboard/widgets/[id]/data — GET', () => {
  const load = () => import('@/app/api/dashboard/widgets/[id]/data/route');

  it('refuses a caller with no tenant context', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctx('w1'));
    expect(res.status).toBe(401);
    expect(getWidgetById).not.toHaveBeenCalled();
  });

  it('resolves the widget under the session tenant before computing any data', async () => {
    getWidgetById.mockResolvedValue({ id: 'w1', type: 'revenue_chart' });
    getWidgetData.mockResolvedValue({ series: [1, 2] });
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctx('w1'));

    expect(res.status).toBe(200);
    expect(getWidgetById).toHaveBeenCalledWith(TENANT_A, USER_A.uid, 'w1');
    expect(getWidgetData).toHaveBeenCalledWith({ id: 'w1', type: 'revenue_chart' });
    await expect(res.json()).resolves.toEqual({ ok: true, series: [1, 2] });
  });

  it('computes no data for a widget the caller cannot resolve', async () => {
    getWidgetById.mockResolvedValue(null);
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctx('w_of_tenant_b'));

    expect(res.status).toBe(404);
    // The point: the data layer is never reached for a widget that did not resolve.
    expect(getWidgetData).not.toHaveBeenCalled();
  });
});

describe('saved-searches/[id] — DELETE', () => {
  const load = () => import('@/app/api/saved-searches/[id]/route');

  it('refuses a caller with no tenant context', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { DELETE } = await load();
    const res = await DELETE(new Request('https://app.local') as never, ctx('s1') as never);
    expect(res.status).toBe(401);
    expect(collection).not.toHaveBeenCalled();
  });

  it('deletes the caller’s own saved search under the awaited id', async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_A, userId: USER_A.uid }));
    const { DELETE } = await load();
    const res = await DELETE(new Request('https://app.local') as never, ctx('s1') as never);

    expect(res.status).toBe(200);
    expect(docRef).toHaveBeenCalledWith('s1');
    expect(docDelete).toHaveBeenCalled();
  });

  it('answers 404 for a saved search that does not exist', async () => {
    docGet.mockResolvedValue(snapshot(null));
    const { DELETE } = await load();
    const res = await DELETE(new Request('https://app.local') as never, ctx('missing') as never);
    expect(res.status).toBe(404);
    expect(docDelete).not.toHaveBeenCalled();
  });

  it("refuses another tenant's saved search even when the uid happens to match", async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_B, userId: USER_A.uid }));
    const { DELETE } = await load();
    const res = await DELETE(new Request('https://app.local') as never, ctx('s_of_b') as never);

    expect(res.status).toBe(403);
    expect(docDelete).not.toHaveBeenCalled();
  });

  it('refuses a same-tenant saved search belonging to another user', async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_A, userId: 'someone_else' }));
    const { DELETE } = await load();
    const res = await DELETE(new Request('https://app.local') as never, ctx('s1') as never);

    expect(res.status).toBe(403);
    expect(docDelete).not.toHaveBeenCalled();
  });

  it('allows an admin of the same tenant to delete another user’s saved search', async () => {
    getCurrentUser.mockResolvedValue({ ...USER_A, role: 'admin' });
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_A, userId: 'someone_else' }));
    const { DELETE } = await load();
    const res = await DELETE(new Request('https://app.local') as never, ctx('s1') as never);

    expect(res.status).toBe(200);
    expect(docDelete).toHaveBeenCalled();
  });
});

describe('saved-searches/[id] — PATCH', () => {
  const load = () => import('@/app/api/saved-searches/[id]/route');

  it('refuses a caller with no tenant context', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { PATCH } = await load();
    const res = await PATCH(new Request('https://app.local') as never, ctx('s1') as never);
    expect(res.status).toBe(401);
    expect(docUpdate).not.toHaveBeenCalled();
  });

  it("will not increment usage on another tenant's saved search", async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_B, userId: USER_A.uid }));
    const { PATCH } = await load();
    const res = await PATCH(new Request('https://app.local') as never, ctx('s_of_b') as never);

    expect(res.status).toBe(403);
    expect(docUpdate).not.toHaveBeenCalled();
  });

  it('increments usage for an in-tenant saved search under the awaited id', async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_A, userId: USER_A.uid }));
    const { PATCH } = await load();
    const res = await PATCH(new Request('https://app.local') as never, ctx('s1') as never);

    expect(res.status).toBe(200);
    expect(docRef).toHaveBeenCalledWith('s1');
    expect(docUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ usageCount: { __increment: 1 } }),
    );
  });
});
