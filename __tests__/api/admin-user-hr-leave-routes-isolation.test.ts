/**
 * Authorisation coverage for the migrated `admin/users/[uid]` read and the HR leave
 * approve/reject routes.
 *
 * `admin/users/[uid]` layers two independent checks, and both are pinned:
 *   1. role — privileged roles may fetch any user; everyone else may fetch only themselves;
 *   2. tenant — the fetched record must belong to the caller's tenant.
 * The second is what stops a privileged admin of tenant A reading a tenant B user, and it
 * deliberately answers **404, not 403**, so the endpoint never confirms that a uid exists
 * in another tenant. The tests assert the status code, not merely that it refused.
 *
 * The HR leave routes are gated by a plan/module entitlement before anything happens. That
 * gate is asserted to run *before* LeaveService is touched: an approval or rejection is a
 * state transition on someone's leave balance, so a tenant without the HR module must not
 * reach it at all. The tenant handed to LeaveService is likewise the session's own.
 *
 * The async-params migration rewrote all three handlers to await a Promise before the id
 * is used, so each test supplies a real Promise and asserts the resolved id is what flows
 * through to the read or the service call.
 */

export {}; // module scope: dynamic imports only, so without this TypeScript treats the
// file as a global script and its top-level names collide with sibling suites.

const getCurrentUser = jest.fn();
const requireModule = jest.fn();
const approveRequest = jest.fn();
const rejectRequest = jest.fn();
const dispatchWebhookEvent = jest.fn();
const sendEmail = jest.fn();
const createNotification = jest.fn();

const docGet = jest.fn();
const docRef = jest.fn(() => ({ get: docGet }));
const collection = jest.fn(() => ({ doc: docRef }));

class PlanAccessError extends Error {
  status = 403;
}

jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return { collection };
  },
}));
jest.mock('@/app/api/admin/_utils', () => ({ getCurrentUser: () => getCurrentUser() }));
jest.mock('@/app/lib/plan-enforcement', () => ({
  requireModule: (...args: unknown[]) => requireModule(...args),
  isPlanAccessError: (err: unknown) => err instanceof PlanAccessError,
}));
jest.mock('@/lib/hr/leave', () => ({
  LeaveService: {
    approveRequest: (...a: unknown[]) => approveRequest(...a),
    rejectRequest: (...a: unknown[]) => rejectRequest(...a),
  },
}));
jest.mock('@/lib/webhooks/webhook-delivery', () => ({
  dispatchWebhookEvent: (...a: unknown[]) => dispatchWebhookEvent(...a),
}));
jest.mock('@/lib/email/email-service', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
jest.mock('@/lib/notifications', () => ({
  createNotification: (...a: unknown[]) => createNotification(...a),
}));

const TENANT_A = 'tenant_a';
const TENANT_B = 'tenant_b';
const ADMIN_A = { uid: 'admin_a', tenantId: TENANT_A, role: 'admin', email: 'a@example.com' };

const ctxUid = (uid: string) => ({ params: Promise.resolve({ uid }) });
const ctxId = (id: string) => ({ params: Promise.resolve({ id }) });
const snapshot = (data: Record<string, unknown> | null) => ({
  exists: data !== null,
  data: () => data,
});

beforeEach(() => {
  jest.clearAllMocks();
  getCurrentUser.mockResolvedValue(ADMIN_A);
  requireModule.mockResolvedValue(undefined);
});

describe('admin/users/[uid] — GET', () => {
  const load = () => import('@/app/api/admin/users/[uid]/route');

  it('refuses an unauthenticated caller', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { GET } = await load();
    expect((await GET(new Request('https://app.local'), ctxUid('u1'))).status).toBe(401);
    expect(collection).not.toHaveBeenCalled();
  });

  it('refuses an unprivileged caller asking for somebody else', async () => {
    getCurrentUser.mockResolvedValue({ ...ADMIN_A, role: 'staff' });
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctxUid('someone_else'));

    expect(res.status).toBe(403);
    expect(collection).not.toHaveBeenCalled();
  });

  it('lets an unprivileged caller fetch themselves', async () => {
    getCurrentUser.mockResolvedValue({ ...ADMIN_A, uid: 'staff_1', role: 'staff' });
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_A, name: 'Staff One' }));
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctxUid('staff_1'));

    expect(res.status).toBe(200);
    expect(docRef).toHaveBeenCalledWith('staff_1');
  });

  it('lets a privileged role fetch another user in the same tenant', async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_A, name: 'Someone' }));
    const { GET } = await load();
    expect((await GET(new Request('https://app.local'), ctxUid('u1'))).status).toBe(200);
  });

  it('answers 404 — not 403 — for a user in another tenant, even to a privileged role', async () => {
    // Role alone is not sufficient: the tenant check is what stops cross-tenant reads, and
    // 404 keeps the endpoint from confirming the uid exists elsewhere.
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_B, name: 'Theirs' }));
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctxUid('u_of_b'));

    expect(res.status).toBe(404);
    await expect(res.text()).resolves.toBe('User not found');
  });

  it('answers 404 for a user that does not exist', async () => {
    docGet.mockResolvedValue(snapshot(null));
    const { GET } = await load();
    expect((await GET(new Request('https://app.local'), ctxUid('missing'))).status).toBe(404);
  });
});

describe.each([
  ['approve', () => import('@/app/api/hr/leave/requests/[id]/approve/route'), () => approveRequest],
  ['reject', () => import('@/app/api/hr/leave/requests/[id]/reject/route'), () => rejectRequest],
])('hr/leave/requests/[id]/%s — PUT', (name, load, service) => {
  const body = () =>
    new Request('https://app.local', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Not enough cover that week' }),
    });

  it('refuses a caller with no tenant context', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { PUT } = await load();
    expect((await PUT(body() as never, ctxId('lr1'))).status).toBe(401);
    expect(service()).not.toHaveBeenCalled();
  });

  it('refuses when the tenant lacks the HR module, before any state transition', async () => {
    requireModule.mockRejectedValue(new PlanAccessError('HR module not enabled'));
    const { PUT } = await load();
    const res = await PUT(body() as never, ctxId('lr1'));

    expect(res.status).toBe(403);
    // The decisive part: approving or rejecting moves someone's leave balance, so an
    // unentitled tenant must not reach the service at all.
    expect(service()).not.toHaveBeenCalled();
  });

  it('does not fall through to the service when module validation fails unexpectedly', async () => {
    requireModule.mockRejectedValue(new Error('firestore unavailable'));
    const { PUT } = await load();
    const res = await PUT(body() as never, ctxId('lr1'));

    expect(res.status).toBe(500);
    expect(service()).not.toHaveBeenCalled();
  });

  it(`passes the session tenant and the awaited request id to ${name}Request`, async () => {
    const { PUT } = await load();
    const res = await PUT(body() as never, ctxId('lr1'));

    expect(res.status).toBeLessThan(400);
    expect(service()).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_A,
        requestId: 'lr1',
        actorUserId: ADMIN_A.uid,
      }),
    );
  });
});
