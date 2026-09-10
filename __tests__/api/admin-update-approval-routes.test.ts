/**
 * Coverage for the migrated admin user-update path adapter and the automation approval
 * response route.
 *
 * `admin/users/[uid]/update` is a backwards-compatible adapter: it forwards to the one
 * canonical implementation at `/api/admin/users/update`, injecting the uid from the URL
 * into the payload. The property that matters is which uid wins. If a body-supplied `uid`
 * could override the path one, the legacy URL would become a way to aim the canonical
 * update at a different user than the URL names — so the test sends a body carrying a
 * DIFFERENT uid and asserts the path's uid is what reaches the canonical handler.
 *
 * `automation/approvals/[id]/respond` decides a pending approval. Two guards precede the
 * decision and both are pinned: the approval must belong to the caller's tenant (reported
 * as 404, not 403, so a foreign id is never confirmed), and it must still be pending, so a
 * resolved approval cannot be re-decided.
 *
 * Both handlers await a Promise for their path parameter after the migration, so each test
 * supplies a real Promise.
 */

export {}; // module scope: dynamic imports only, so without this TypeScript treats the
// file as a global script and its top-level names collide with sibling suites.

const canonicalUpdate = jest.fn();
const requireAutomationAdmin = jest.fn();

const docGet = jest.fn();
const docSet = jest.fn();
const docUpdate = jest.fn();
const docRef = jest.fn(() => ({ get: docGet, set: docSet, update: docUpdate }));
const collection = jest.fn(() => ({ doc: docRef }));

jest.mock('@/app/api/admin/users/update/route', () => ({
  POST: (...a: unknown[]) => canonicalUpdate(...a),
}));
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

const ctxUid = (uid: string) => ({ params: Promise.resolve({ uid }) });
const ctxId = (id: string) => ({ params: Promise.resolve({ id }) });

const jsonReq = (body: unknown) =>
  new Request('https://app.local/api/admin/users/u_from_path/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  requireAutomationAdmin.mockResolvedValue({ ok: true, user: USER_A });
  canonicalUpdate.mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
  docGet.mockResolvedValue({
    exists: true,
    data: () => ({ tenantId: TENANT_A, status: 'pending', approvers: [USER_A.uid] }),
  });
});

describe('admin/users/[uid]/update — POST (path adapter)', () => {
  const load = () => import('@/app/api/admin/users/[uid]/update/route');

  it('forwards to the single canonical implementation rather than duplicating policy', async () => {
    const { POST } = await load();
    await POST(jsonReq({ name: 'New Name' }), ctxUid('u_from_path'));

    expect(canonicalUpdate).toHaveBeenCalledTimes(1);
  });

  it('injects the AWAITED path uid into the payload', async () => {
    const { POST } = await load();
    await POST(jsonReq({ name: 'New Name' }), ctxUid('u_from_path'));

    const forwarded = canonicalUpdate.mock.calls[0][0] as Request;
    await expect(forwarded.json()).resolves.toMatchObject({ uid: 'u_from_path' });
  });

  it('lets the path uid win over a uid supplied in the body', async () => {
    // Otherwise the legacy URL becomes a way to aim the canonical update at a different
    // user than the one the URL names.
    const { POST } = await load();
    await POST(jsonReq({ name: 'New Name', uid: 'someone_else' }), ctxUid('u_from_path'));

    const forwarded = canonicalUpdate.mock.calls[0][0] as Request;
    await expect(forwarded.json()).resolves.toMatchObject({ uid: 'u_from_path' });
  });

  it('survives a malformed body by forwarding just the path uid', async () => {
    const { POST } = await load();
    const bad = new Request('https://app.local/api/admin/users/u1/update', {
      method: 'POST',
      body: 'not json',
    });
    await POST(bad, ctxUid('u_from_path'));

    const forwarded = canonicalUpdate.mock.calls[0][0] as Request;
    await expect(forwarded.json()).resolves.toEqual({ uid: 'u_from_path' });
  });
});

describe('automation/approvals/[id]/respond — POST', () => {
  const load = () => import('@/app/api/automation/approvals/[id]/respond/route');
  const req = (decision = 'approve') =>
    new Request('https://app.local', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision }),
    });

  it('propagates the automation-admin guard’s refusal without reading anything', async () => {
    requireAutomationAdmin.mockResolvedValue({ ok: false, error: 'Forbidden', status: 403 });
    const { POST } = await load();
    const res = await POST(req(), ctxId('ap_1'));

    expect(res.status).toBe(403);
    expect(collection).not.toHaveBeenCalled();
  });

  it("reports 404 — not 403 — for another tenant's approval", async () => {
    docGet.mockResolvedValue({
      exists: true,
      data: () => ({ tenantId: TENANT_B, status: 'pending' }),
    });
    const { POST } = await load();
    const res = await POST(req(), ctxId('ap_of_b'));

    expect(res.status).toBe(404);
    expect(docSet).not.toHaveBeenCalled();
    expect(docUpdate).not.toHaveBeenCalled();
  });

  it('reports 404 for an approval that does not exist', async () => {
    docGet.mockResolvedValue({ exists: false, data: () => undefined });
    const { POST } = await load();
    expect((await POST(req(), ctxId('missing'))).status).toBe(404);
  });

  it('refuses to re-decide an approval that is already resolved', async () => {
    docGet.mockResolvedValue({
      exists: true,
      data: () => ({ tenantId: TENANT_A, status: 'approved' }),
    });
    const { POST } = await load();
    const res = await POST(req(), ctxId('ap_1'));

    expect(res.status).toBe(400);
    expect(docSet).not.toHaveBeenCalled();
    expect(docUpdate).not.toHaveBeenCalled();
  });

  it('reads the approval under the awaited id', async () => {
    const { POST } = await load();
    await POST(req(), ctxId('ap_1'));

    expect(docRef).toHaveBeenCalledWith('ap_1');
  });
});
