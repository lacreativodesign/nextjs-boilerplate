/**
 * Coverage for the migrated `super_admin/tenants/[tenantId]` administration routes.
 *
 * These are the platform-operator endpoints, so a tenant comparison would be meaningless —
 * they are cross-tenant by design and `requireSuperAdmin` is the only gate. The first
 * thing pinned is therefore that the gate actually stops the handler: if it throws, no
 * document may be read or written.
 *
 * Two properties beyond the gate are worth locking in, both of which exist because the
 * tenantId arrives from the URL:
 *
 *  - **No phantom tenants.** `set(..., { merge: true })` CREATES a document when none
 *    exists, so without an existence check any tenantId in the path would mint a tenant
 *    carrying nothing but a brand — invisible to onboarding and absent from every plan and
 *    billing invariant. The 404 path is asserted to write nothing.
 *  - **Constrained inputs.** `logoUrl` is rendered into an `<img src>` shown to everyone in
 *    the workspace, so it must stay an absolute http(s) URL; `javascript:` must not survive
 *    validation. Role keys are likewise held to a fixed list. Both use the project's real
 *    schemas rather than stand-ins.
 *
 * The async-params migration rewrote each handler to await a Promise before the tenantId is
 * used, so every test supplies a real Promise and asserts the resolved value addresses the
 * document.
 */

export {}; // module scope: dynamic imports only, so without this TypeScript treats the
// file as a global script and its top-level names collide with sibling suites.

const requireSuperAdmin = jest.fn();
const writeAuditLog = jest.fn();
const resolveTenantRoles = jest.fn();
const invalidateTenantPlanCache = jest.fn();
const createRoleNotifications = jest.fn();

const docGet = jest.fn();
const docSet = jest.fn();
const docRef = jest.fn(() => ({ get: docGet, set: docSet }));
const collection = jest.fn(() => ({ doc: docRef }));

jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return { collection };
  },
}));
jest.mock('@/app/api/super_admin/_utils', () => ({
  requireSuperAdmin: (...a: unknown[]) => requireSuperAdmin(...a),
}));
jest.mock('@/lib/tenant/audit', () => ({
  writeAuditLog: (...a: unknown[]) => writeAuditLog(...a),
}));
jest.mock('@/lib/tenant/access', () => ({
  resolveTenantRoles: (...a: unknown[]) => resolveTenantRoles(...a),
}));
jest.mock('@/app/lib/plan-enforcement', () => ({
  invalidateTenantPlanCache: (...a: unknown[]) => invalidateTenantPlanCache(...a),
}));
jest.mock('@/lib/notifications', () => ({
  createRoleNotifications: (...a: unknown[]) => createRoleNotifications(...a),
}));
jest.mock('firebase-admin', () => ({
  firestore: { FieldValue: { serverTimestamp: () => ({ __ts: 'now' }) } },
}));

const OPERATOR = { uid: 'op_1', role: 'super_admin', email: 'op@example.com' };
const ctx = (tenantId: string) => ({ params: Promise.resolve({ tenantId }) });

const jsonReq = (body: unknown, method = 'POST') =>
  new Request('https://app.local', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  requireSuperAdmin.mockResolvedValue(OPERATOR);
  resolveTenantRoles.mockReturnValue({});
  docGet.mockResolvedValue({ exists: true, data: () => ({ name: 'Acme' }) });
});

describe('super_admin/tenants/[tenantId]/branding — POST', () => {
  const load = () => import('@/app/api/super_admin/tenants/[tenantId]/branding/route');

  it('writes nothing when the super-admin gate refuses', async () => {
    requireSuperAdmin.mockRejectedValue(new Error('Forbidden'));
    const { POST } = await load();
    const res = await POST(jsonReq({ name: 'Acme' }), ctx('t1'));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(docSet).not.toHaveBeenCalled();
  });

  it('will not mint a phantom tenant for an id that does not exist', async () => {
    // set(..., { merge: true }) would CREATE the document, so the existence check is the
    // only thing stopping any tenantId in the URL becoming a real-looking tenant.
    docGet.mockResolvedValue({ exists: false, data: () => undefined });
    const { POST } = await load();
    const res = await POST(jsonReq({ name: 'Ghost Co' }), ctx('not_a_tenant'));

    expect(res.status).toBe(404);
    expect(docSet).not.toHaveBeenCalled();
  });

  it('rejects a javascript: logoUrl, which is rendered into an img src', async () => {
    const { POST } = await load();
    const res = await POST(jsonReq({ name: 'Acme', logoUrl: 'javascript:alert(1)' }), ctx('t1'));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(docSet).not.toHaveBeenCalled();
  });

  it('rejects a data: logoUrl for the same reason', async () => {
    const { POST } = await load();
    const res = await POST(
      jsonReq({ name: 'Acme', logoUrl: 'data:text/html;base64,PHNjcmlwdD4=' }),
      ctx('t1'),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(docSet).not.toHaveBeenCalled();
  });

  it('accepts an absolute https logoUrl and writes under the awaited tenant id', async () => {
    const { POST } = await load();
    const res = await POST(
      jsonReq({ name: 'Acme', logoUrl: 'https://cdn.example/logo.png' }),
      ctx('t1'),
    );

    expect(res.status).toBeLessThan(400);
    expect(docRef).toHaveBeenCalledWith('t1');
    expect(docSet).toHaveBeenCalled();
  });
});

describe('super_admin/tenants/[tenantId]/roles — PATCH', () => {
  const load = () => import('@/app/api/super_admin/tenants/[tenantId]/roles/route');

  it('writes nothing when the super-admin gate refuses', async () => {
    requireSuperAdmin.mockRejectedValue(new Error('Forbidden'));
    const { PATCH } = await load();
    const res = await PATCH(jsonReq({ rolesEnabled: { admin: true } }, 'PATCH'), ctx('t1'));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(docSet).not.toHaveBeenCalled();
  });

  it('rejects a rolesEnabled that is not an object', async () => {
    const { PATCH } = await load();
    const res = await PATCH(jsonReq({ rolesEnabled: ['admin'] }, 'PATCH'), ctx('t1'));

    expect(res.status).toBe(400);
    expect(docSet).not.toHaveBeenCalled();
  });

  it('rejects a role key outside the canonical list', async () => {
    const { PATCH } = await load();
    const res = await PATCH(jsonReq({ rolesEnabled: { root: true } }, 'PATCH'), ctx('t1'));

    expect(res.status).toBe(400);
    expect(docSet).not.toHaveBeenCalled();
  });

  it('rejects a non-boolean value for a valid role key', async () => {
    const { PATCH } = await load();
    const res = await PATCH(jsonReq({ rolesEnabled: { admin: 'yes' } }, 'PATCH'), ctx('t1'));

    expect(res.status).toBe(400);
    expect(docSet).not.toHaveBeenCalled();
  });

  it('accepts a canonical role map and writes under the awaited tenant id', async () => {
    const { PATCH } = await load();
    const res = await PATCH(
      jsonReq({ rolesEnabled: { admin: true, sales: false } }, 'PATCH'),
      ctx('t1'),
    );

    expect(res.status).toBeLessThan(400);
    expect(docRef).toHaveBeenCalledWith('t1');
  });
});
