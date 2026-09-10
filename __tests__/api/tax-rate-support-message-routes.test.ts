/**
 * Tenant-isolation coverage for the migrated tax-rate and support-message routes.
 *
 * `finance/tax-rates/[taxRateId]` reads with an unscoped `doc(id)` and then applies TWO
 * conditions before answering: the record must belong to the caller's tenant, and it must
 * not be soft-deleted. Both collapse into the same 404 — deliberately, so the endpoint
 * cannot be used to distinguish "belongs to someone else" from "was deleted" from "never
 * existed". Each condition is asserted separately here so neither can be dropped while the
 * other keeps the tests passing. Mutating handlers additionally require a finance or admin
 * role, which is checked before the record is read at all.
 *
 * `support/tickets/[id]/messages` is the route whose migrated shape
 * (`const ticketId = (await context.params).id`) silently fell out of the P0-1 ownership
 * detector. Its isolation works differently from the others: the tenant is part of the
 * *document path* — tenants/{sessionTenant}/support_tickets/{id}/messages — so a ticket id
 * from another tenant simply addresses nothing. The tests assert that path is built from
 * the session's tenant and the awaited id, which is precisely the property the exemption
 * in the P0-1 detector claims.
 */

export {}; // module scope: dynamic imports only, so without this TypeScript treats the
// file as a global script and its top-level names collide with sibling suites.

const getCurrentUser = jest.fn();

const docGet = jest.fn();
const docUpdate = jest.fn();
const messagesAdd = jest.fn();
const messagesGet = jest.fn();

/** Records every collection()/doc() segment so the built path can be asserted. */
const path: string[] = [];
type QueryStub = {
  orderBy: jest.Mock;
  limit: jest.Mock;
  get: jest.Mock;
  add: jest.Mock;
};
const messagesQuery: QueryStub = {
  orderBy: jest.fn(() => messagesQuery),
  limit: jest.fn(() => messagesQuery),
  get: messagesGet,
  add: messagesAdd,
};
const makeDoc = (): Record<string, unknown> => ({
  get: docGet,
  update: docUpdate,
  set: jest.fn(),
  collection: jest.fn((name: string) => {
    path.push(name);
    return name === 'messages' ? messagesQuery : makeCollection();
  }),
});
const makeCollection = (): Record<string, unknown> => ({
  doc: jest.fn((id: string) => {
    path.push(id);
    return makeDoc();
  }),
  where: jest.fn(() => messagesQuery),
  orderBy: jest.fn(() => messagesQuery),
  get: messagesGet,
});
const collection = jest.fn((name: string) => {
  path.push(name);
  return makeCollection();
});

jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return { collection };
  },
}));
jest.mock('@/app/api/admin/_utils', () => ({
  getCurrentUser: () => getCurrentUser(),
  isAdminRole: (role?: string | null) => role === 'admin' || role === 'super_admin',
  normalizeRole: (role: string) => String(role || '').toLowerCase(),
}));

const TENANT_A = 'tenant_a';
const TENANT_B = 'tenant_b';
const FINANCE_A = { uid: 'fin_a', tenantId: TENANT_A, role: 'finance', email: 'f@example.com' };

const ctxTax = (taxRateId: string) => ({ params: Promise.resolve({ taxRateId }) });
const ctxId = (id: string) => ({ params: Promise.resolve({ id }) });
const snapshot = (data: Record<string, unknown> | null) => ({
  exists: data !== null,
  id: 'tr_1',
  data: () => data,
});

beforeEach(() => {
  jest.clearAllMocks();
  path.length = 0;
  getCurrentUser.mockResolvedValue(FINANCE_A);
  messagesGet.mockResolvedValue({ docs: [] });
  messagesAdd.mockResolvedValue({ id: 'msg_1' });
});

describe('finance/tax-rates/[taxRateId] — GET', () => {
  const load = () => import('@/app/api/finance/tax-rates/[taxRateId]/route');

  it('refuses an unauthenticated caller', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { GET } = await load();
    expect((await GET(new Request('https://app.local'), ctxTax('tr_1'))).status).toBe(401);
    expect(collection).not.toHaveBeenCalled();
  });

  it('returns an in-tenant rate under the awaited id', async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_A, name: 'VAT', rate: 20 }));
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctxTax('tr_1'));

    expect(res.status).toBe(200);
    expect(path).toContain('tr_1');
  });

  it("answers 404 for another tenant's rate", async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_B, name: 'Theirs' }));
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctxTax('tr_of_b'));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'Tax rate not found' });
  });

  it('answers the same 404 for a soft-deleted in-tenant rate', async () => {
    // Deliberately indistinguishable from "another tenant's" and "never existed".
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_A, isDeleted: true }));
    const { GET } = await load();
    expect((await GET(new Request('https://app.local'), ctxTax('tr_1'))).status).toBe(404);
  });

  it('answers 404 when the rate does not exist', async () => {
    docGet.mockResolvedValue(snapshot(null));
    const { GET } = await load();
    expect((await GET(new Request('https://app.local'), ctxTax('missing'))).status).toBe(404);
  });
});

describe('finance/tax-rates/[taxRateId] — PATCH', () => {
  const load = () => import('@/app/api/finance/tax-rates/[taxRateId]/route');
  const req = () =>
    new Request('https://app.local', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'VAT 20' }),
    });

  it('refuses an unauthenticated caller', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { PATCH } = await load();
    expect((await PATCH(req(), ctxTax('tr_1'))).status).toBe(401);
  });

  it('refuses a role that may not manage tax, before reading the record', async () => {
    getCurrentUser.mockResolvedValue({ ...FINANCE_A, role: 'sales' });
    const { PATCH } = await load();
    const res = await PATCH(req(), ctxTax('tr_1'));

    expect(res.status).toBe(403);
    expect(collection).not.toHaveBeenCalled();
  });

  it("will not update another tenant's rate", async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_B }));
    const { PATCH } = await load();
    const res = await PATCH(req(), ctxTax('tr_of_b'));

    expect(res.status).toBe(404);
    expect(docUpdate).not.toHaveBeenCalled();
  });
});

describe('finance/tax-rates/[taxRateId] — DELETE', () => {
  const load = () => import('@/app/api/finance/tax-rates/[taxRateId]/route');
  const req = () => new Request('https://app.local', { method: 'DELETE' });

  it('refuses an unauthenticated caller', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { DELETE } = await load();
    expect((await DELETE(req(), ctxTax('tr_1'))).status).toBe(401);
    expect(docUpdate).not.toHaveBeenCalled();
  });

  it('refuses a role that may not manage tax', async () => {
    getCurrentUser.mockResolvedValue({ ...FINANCE_A, role: 'sales' });
    const { DELETE } = await load();
    const res = await DELETE(req(), ctxTax('tr_1'));

    expect(res.status).toBe(403);
    expect(docUpdate).not.toHaveBeenCalled();
  });

  it("will not delete another tenant's rate", async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_B }));
    const { DELETE } = await load();
    const res = await DELETE(req(), ctxTax('tr_of_b'));

    expect(res.status).toBe(404);
    expect(docUpdate).not.toHaveBeenCalled();
  });
});

describe('support/tickets/[id]/messages — GET and POST', () => {
  const load = () => import('@/app/api/support/tickets/[id]/messages/route');
  const ADMIN_A = { ...FINANCE_A, role: 'admin' };

  beforeEach(() => {
    // This route is admin-only, unlike the tax-rate routes above which admit finance.
    getCurrentUser.mockResolvedValue(ADMIN_A);
  });

  it('refuses a finance role, which is not admin here', async () => {
    getCurrentUser.mockResolvedValue(FINANCE_A);
    const { GET } = await load();
    expect((await GET(new Request('https://app.local'), ctxId('tk_1'))).status).toBe(401);
    expect(collection).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller on read', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { GET } = await load();
    expect((await GET(new Request('https://app.local'), ctxId('tk_1'))).status).toBe(401);
    expect(collection).not.toHaveBeenCalled();
  });

  it('builds the message path from the session tenant and the awaited ticket id', async () => {
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctxId('tk_1'));

    expect(res.status).toBe(200);
    // tenants/{sessionTenant}/support_tickets/{awaited id}/messages — the tenant is in the
    // document path, which is exactly what the P0-1 exemption for this route asserts.
    expect(path).toEqual(
      expect.arrayContaining(['tenants', TENANT_A, 'support_tickets', 'tk_1', 'messages']),
    );
    // The ticket id never appears without the caller's tenant ahead of it in the path.
    expect(path.indexOf(TENANT_A)).toBeLessThan(path.indexOf('tk_1'));
  });

  it('builds the same tenant-scoped path when posting a message', async () => {
    const { POST } = await load();
    const req = new Request('https://app.local', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'hello' }),
    });
    await POST(req, ctxId('tk_1'));

    // POST resolves its id with the same inline `(await context.params).id` shape as GET.
    expect(path).toEqual(expect.arrayContaining(['tenants', TENANT_A, 'support_tickets', 'tk_1']));
    expect(path.indexOf(TENANT_A)).toBeLessThan(path.indexOf('tk_1'));
  });

  it('refuses an unauthenticated caller on write', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { POST } = await load();
    const req = new Request('https://app.local', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'hello' }),
    });

    expect((await POST(req, ctxId('tk_1'))).status).toBe(401);
    expect(messagesAdd).not.toHaveBeenCalled();
  });
});
