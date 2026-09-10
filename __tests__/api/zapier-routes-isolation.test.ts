/**
 * Tenant-binding coverage for the migrated Zapier integration routes.
 *
 * These three are the only routes in the change authenticated by an API key rather than a
 * session cookie, and that changes where the tenant comes from: `requireZapierApiKey`
 * resolves it from the key itself. The property worth pinning is therefore that the tenant
 * passed downstream is **`auth.tenantId`** and never anything the caller put in the body —
 * an integration surface that trusted a body-supplied tenant would let any valid key act
 * against every tenant.
 *
 * Each test sends a body that also carries a `tenantId` for a different tenant, and asserts
 * the service receives the key's tenant regardless.
 *
 * The path parameter here is not an id but a verb (`action`, `search`) or a subscription
 * id, and it is forwarded to the service, so each route is driven through a real Promise
 * and the resolved value is asserted — an unawaited params object would dispatch the action
 * name "undefined".
 */

export {}; // module scope: dynamic imports only, so without this TypeScript treats the
// file as a global script and its top-level names collide with sibling suites.

const requireZapierApiKey = jest.fn();
const executeZapierAction = jest.fn();
const executeZapierSearch = jest.fn();
const deleteZapierHookSubscription = jest.fn();

jest.mock('@/app/api/zapier/_utils', () => ({
  requireZapierApiKey: (...a: unknown[]) => requireZapierApiKey(...a),
}));
jest.mock('@/lib/zapier/service', () => ({
  executeZapierAction: (...a: unknown[]) => executeZapierAction(...a),
  executeZapierSearch: (...a: unknown[]) => executeZapierSearch(...a),
  deleteZapierHookSubscription: (...a: unknown[]) => deleteZapierHookSubscription(...a),
}));

const TENANT_A = 'tenant_a';
const TENANT_B = 'tenant_b';

const ctxAction = (action: string) => ({ params: Promise.resolve({ action }) });
const ctxSearch = (search: string) => ({ params: Promise.resolve({ search }) });
const ctxId = (id: string) => ({ params: Promise.resolve({ id }) });

/** Every request body also claims a DIFFERENT tenant, which must be ignored. */
const req = (method: string, extra: Record<string, unknown> = {}) =>
  new Request('https://app.local', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantId: TENANT_B, ...extra }),
  }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  requireZapierApiKey.mockResolvedValue({ ok: true, tenantId: TENANT_A });
  executeZapierAction.mockResolvedValue({ id: 'created_1' });
  executeZapierSearch.mockResolvedValue([{ id: 'found_1' }]);
  deleteZapierHookSubscription.mockResolvedValue(true);
});

describe('zapier/actions/[action] — POST', () => {
  const load = () => import('@/app/api/zapier/actions/[action]/route');

  it('propagates the API-key guard’s refusal without dispatching', async () => {
    requireZapierApiKey.mockResolvedValue({ ok: false, error: 'Invalid API key', status: 401 });
    const { POST } = await load();
    const res = await POST(req('POST'), ctxAction('create_lead'));

    expect(res.status).toBe(401);
    expect(executeZapierAction).not.toHaveBeenCalled();
  });

  it('dispatches under the KEY’s tenant, ignoring a tenantId in the body', async () => {
    const { POST } = await load();
    const res = await POST(req('POST', { input: { name: 'Acme' } }), ctxAction('create_lead'));

    expect(res.status).toBe(200);
    expect(executeZapierAction).toHaveBeenCalledWith({
      tenantId: TENANT_A,
      action: 'create_lead',
      input: { name: 'Acme' },
    });
  });

  it('reports an unknown action as a client error rather than a server fault', async () => {
    executeZapierAction.mockRejectedValue(new Error('Unknown action.'));
    const { POST } = await load();
    const res = await POST(req('POST'), ctxAction('not_a_real_action'));

    expect(res.status).toBe(400);
  });
});

describe('zapier/searches/[search] — POST', () => {
  const load = () => import('@/app/api/zapier/searches/[search]/route');

  it('propagates the API-key guard’s refusal without searching', async () => {
    requireZapierApiKey.mockResolvedValue({ ok: false, error: 'Invalid API key', status: 401 });
    const { POST } = await load();
    const res = await POST(req('POST'), ctxSearch('find_client'));

    expect(res.status).toBe(401);
    expect(executeZapierSearch).not.toHaveBeenCalled();
  });

  it('searches under the KEY’s tenant, ignoring a tenantId in the body', async () => {
    const { POST } = await load();
    const res = await POST(req('POST', { input: { email: 'a@b.c' } }), ctxSearch('find_client'));

    expect(res.status).toBe(200);
    expect(executeZapierSearch).toHaveBeenCalledWith({
      tenantId: TENANT_A,
      search: 'find_client',
      input: { email: 'a@b.c' },
    });
  });

  it('reports an unknown search as a client error', async () => {
    executeZapierSearch.mockRejectedValue(new Error('Unknown search.'));
    const { POST } = await load();
    expect((await POST(req('POST'), ctxSearch('nope'))).status).toBe(400);
  });
});

describe('zapier/hooks/[id]/unsubscribe — DELETE', () => {
  const load = () => import('@/app/api/zapier/hooks/[id]/unsubscribe/route');

  it('propagates the API-key guard’s refusal without deleting', async () => {
    requireZapierApiKey.mockResolvedValue({ ok: false, error: 'Invalid API key', status: 401 });
    const { DELETE } = await load();
    const res = await DELETE(req('DELETE'), ctxId('sub_1'));

    expect(res.status).toBe(401);
    expect(deleteZapierHookSubscription).not.toHaveBeenCalled();
  });

  it('deletes under the KEY’s tenant and the awaited subscription id', async () => {
    const { DELETE } = await load();
    const res = await DELETE(req('DELETE'), ctxId('sub_1'));

    expect(res.status).toBe(200);
    // A key for tenant A cannot unsubscribe tenant B's hook by naming its id.
    expect(deleteZapierHookSubscription).toHaveBeenCalledWith({
      id: 'sub_1',
      tenantId: TENANT_A,
    });
  });

  it("reports 404 when the subscription is not the key tenant's", async () => {
    deleteZapierHookSubscription.mockResolvedValue(false);
    const { DELETE } = await load();
    const res = await DELETE(req('DELETE'), ctxId('sub_of_b'));

    expect(res.status).toBe(404);
  });
});
