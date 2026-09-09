/**
 * Tenant-isolation and authorisation coverage for three more migrated route families:
 * `import/jobs/[id]`, `webhooks/subscriptions/[id]` and `super_admin/tickets/[ticketId]`.
 *
 * Each guards access differently, and all three shapes are pinned:
 *
 *  - import jobs read the job with an unscoped `doc(id)` and then compare `data.tenantId`
 *    against the caller's in the handler. That comparison is the whole boundary, and it
 *    matters twice over here because the errors route can stream the job's rows out as a
 *    CSV attachment — a leak would be a bulk export of another tenant's data.
 *  - webhook subscriptions push the tenant down into the service call instead, so the
 *    route's contribution is that it passes the *caller's* tenant alongside the id.
 *  - platform tickets are deliberately cross-tenant: they are the support desk, gated by
 *    requireSuperAdmin rather than by a tenant comparison. The test asserts the gate is
 *    what refuses, so the absence of a tenant check here stays a decision rather than
 *    becoming an accident.
 *
 * The tickets route also uses the inline `(await context.params).ticketId` shape rather
 * than the destructured one — the form that silently fell out of the P0-1 ownership
 * detector — so it is driven here with a real Promise like the rest.
 */

export {}; // module scope: dynamic imports only, so without this TypeScript treats the
// file as a global script and its top-level names collide with sibling suites.

const requireBulkDataAccess = jest.fn();
const requireWebhookAdmin = jest.fn();
const requireSuperAdmin = jest.fn();
const updateWebhookSubscription = jest.fn();
const deleteWebhookSubscription = jest.fn();
const writeAuditLog = jest.fn();

const docGet = jest.fn();
const docUpdate = jest.fn();
const docSet = jest.fn();
const docRef = jest.fn(() => ({ get: docGet, update: docUpdate, set: docSet }));
const collection = jest.fn(() => ({ doc: docRef }));

jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return { collection };
  },
}));
jest.mock('@/lib/api/bulk-data-guard', () => ({
  requireBulkDataAccess: () => requireBulkDataAccess(),
}));
jest.mock('@/lib/webhooks/webhook-delivery', () => ({
  updateWebhookSubscription: (...args: unknown[]) => updateWebhookSubscription(...args),
  deleteWebhookSubscription: (...args: unknown[]) => deleteWebhookSubscription(...args),
}));
// The real schema is kept: only the auth guard is replaced, so the 400 path below is the
// project's own validation rejecting the payload rather than a stand-in.
jest.mock('@/app/api/webhooks/_utils', () => ({
  ...jest.requireActual('@/app/api/webhooks/_utils'),
  requireWebhookAdmin: () => requireWebhookAdmin(),
}));
jest.mock('@/app/api/super_admin/_utils', () => ({
  requireSuperAdmin: (...args: unknown[]) => requireSuperAdmin(...args),
}));
jest.mock('@/lib/tenant/audit', () => ({
  writeAuditLog: (...a: unknown[]) => writeAuditLog(...a),
}));

const TENANT_A = 'tenant_a';
const TENANT_B = 'tenant_b';
const USER_A = { uid: 'user_a', tenantId: TENANT_A, role: 'admin', email: 'a@example.com' };

const ctxId = (id: string) => ({ params: Promise.resolve({ id }) });
const ctxTicket = (ticketId: string) => ({ params: Promise.resolve({ ticketId }) });
const snapshot = (data: Record<string, unknown> | null) => ({
  exists: data !== null,
  id: 'doc_id',
  data: () => data,
});

beforeEach(() => {
  jest.clearAllMocks();
  requireBulkDataAccess.mockResolvedValue({ ok: true, user: USER_A });
  requireWebhookAdmin.mockResolvedValue({ ok: true, user: USER_A });
  requireSuperAdmin.mockResolvedValue(USER_A);
});

describe('import/jobs/[id]/status — GET', () => {
  const load = () => import('@/app/api/import/jobs/[id]/status/route');

  it('propagates the bulk-data guard’s refusal verbatim', async () => {
    requireBulkDataAccess.mockResolvedValue({ ok: false, error: 'Client portal', status: 403 });
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctxId('j1'));

    expect(res.status).toBe(403);
    expect(collection).not.toHaveBeenCalled();
  });

  it('reads the job under the awaited id and returns its progress', async () => {
    docGet.mockResolvedValue(
      snapshot({ tenantId: TENANT_A, status: 'running', progress: 42, totalRows: 100 }),
    );
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctxId('j1'));

    expect(res.status).toBe(200);
    expect(docRef).toHaveBeenCalledWith('j1');
    await expect(res.json()).resolves.toMatchObject({ status: 'running', progress: 42 });
  });

  it('answers 404 for a job that does not exist', async () => {
    docGet.mockResolvedValue(snapshot(null));
    const { GET } = await load();
    expect((await GET(new Request('https://app.local'), ctxId('missing'))).status).toBe(404);
  });

  it("refuses another tenant's import job", async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_B, status: 'running' }));
    const { GET } = await load();
    const res = await GET(new Request('https://app.local'), ctxId('j_of_b'));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden' });
  });
});

describe('import/jobs/[id]/errors — GET', () => {
  const load = () => import('@/app/api/import/jobs/[id]/errors/route');

  it('propagates the bulk-data guard’s refusal', async () => {
    requireBulkDataAccess.mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });
    const { GET } = await load();
    expect((await GET(new Request('https://app.local'), ctxId('j1'))).status).toBe(401);
  });

  it("will not export another tenant's error rows, in any format", async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_B, errors: [{ row: 1, code: 'x' }] }));
    const { GET } = await load();
    const res = await GET(
      new Request('https://app.local/api/import/jobs/j/errors?download=csv'),
      ctxId('j_of_b'),
    );

    // The CSV branch is the bulk-export path; it must not be reachable cross-tenant.
    expect(res.status).toBe(403);
    expect(res.headers.get('Content-Type')).not.toContain('text/csv');
  });

  it('returns the caller’s own error rows as CSV when asked', async () => {
    docGet.mockResolvedValue(
      snapshot({
        tenantId: TENANT_A,
        errors: [{ row: 2, field: 'email', code: 'invalid', message: 'bad, value', value: 'x' }],
      }),
    );
    const { GET } = await load();
    const res = await GET(
      new Request('https://app.local/api/import/jobs/j/errors?download=csv'),
      ctxId('j1'),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv');
    const body = await res.text();
    expect(body).toContain('row,field,code,message,value');
    // Commas inside a message are neutralised so they cannot forge extra CSV columns.
    expect(body).toContain('bad  value');
  });
});

describe('webhooks/subscriptions/[id] — PUT and DELETE', () => {
  const load = () => import('@/app/api/webhooks/subscriptions/[id]/route');

  it('refuses a caller the webhook-admin guard rejects', async () => {
    requireWebhookAdmin.mockResolvedValue({ ok: false, error: 'Forbidden', status: 403 });
    const { PUT } = await load();
    const req = new Request('https://app.local', { method: 'PUT', body: '{}' });
    expect((await PUT(req, ctxId('s1'))).status).toBe(403);
    expect(updateWebhookSubscription).not.toHaveBeenCalled();
  });

  it('rejects an invalid payload with the project’s own schema', async () => {
    const { PUT } = await load();
    const req = new Request('https://app.local', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'not-a-url' }),
    });

    expect((await PUT(req, ctxId('s1'))).status).toBe(400);
    expect(updateWebhookSubscription).not.toHaveBeenCalled();
  });

  it('updates against the caller tenant using the awaited id', async () => {
    updateWebhookSubscription.mockResolvedValue({ id: 's1' });
    const { PUT } = await load();
    const req = new Request('https://app.local', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'disabled' }),
    });
    const res = await PUT(req, ctxId('s1'));

    expect(res.status).toBe(200);
    expect(updateWebhookSubscription).toHaveBeenCalledWith(
      's1',
      TENANT_A,
      expect.objectContaining({ actorUid: USER_A.uid }),
    );
  });

  it("reports 404 when the subscription is not the caller's", async () => {
    // The service scopes by tenant and returns nothing for another tenant's subscription.
    updateWebhookSubscription.mockResolvedValue(null);
    const { PUT } = await load();
    const req = new Request('https://app.local', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'disabled' }),
    });

    expect((await PUT(req, ctxId('s_of_b'))).status).toBe(404);
  });

  it('deletes against the caller tenant using the awaited id', async () => {
    deleteWebhookSubscription.mockResolvedValue(true);
    const { DELETE } = await load();
    const res = await DELETE(new Request('https://app.local'), ctxId('s1'));

    expect(res.status).toBe(200);
    expect(deleteWebhookSubscription).toHaveBeenCalledWith('s1', TENANT_A);
  });
});

describe('super_admin/tickets/[ticketId] — GET', () => {
  const load = () => import('@/app/api/super_admin/tickets/[ticketId]/route');

  it('is gated by requireSuperAdmin, not by a tenant comparison', async () => {
    // Platform tickets are cross-tenant by design. The guard is therefore the only thing
    // standing in front of them, so its refusal must actually stop the read.
    requireSuperAdmin.mockRejectedValue(new Error('Forbidden'));
    const { GET } = await load();
    const res = await GET(new Request('https://app.local') as never, ctxTicket('t1'));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(collection).not.toHaveBeenCalled();
  });

  it('reads the ticket under the inline-awaited id', async () => {
    docGet.mockResolvedValue(snapshot({ subject: 'Cannot log in', status: 'open' }));
    const { GET } = await load();
    const res = await GET(new Request('https://app.local') as never, ctxTicket('tk_1'));

    expect(res.status).toBe(200);
    // `(await context.params).ticketId` — the shape that fell out of the P0-1 detector.
    expect(docRef).toHaveBeenCalledWith('tk_1');
  });

  it('answers 404 for a ticket that does not exist', async () => {
    docGet.mockResolvedValue(snapshot(null));
    const { GET } = await load();
    expect((await GET(new Request('https://app.local') as never, ctxTicket('nope'))).status).toBe(
      404,
    );
  });
});

describe('super_admin/tickets/[ticketId] — PATCH', () => {
  const load = () => import('@/app/api/super_admin/tickets/[ticketId]/route');
  const req = (body: unknown) =>
    new Request('https://app.local', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never;

  it('writes nothing when the super-admin gate refuses', async () => {
    requireSuperAdmin.mockRejectedValue(new Error('Forbidden'));
    const { PATCH } = await load();
    const res = await PATCH(req({ status: 'open' }), ctxTicket('tk_1'));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(docUpdate).not.toHaveBeenCalled();
    expect(docSet).not.toHaveBeenCalled();
  });

  it('rejects a body that is not an object', async () => {
    const { PATCH } = await load();
    const res = await PATCH(
      new Request('https://app.local', { method: 'PATCH', body: 'not json' }) as never,
      ctxTicket('tk_1'),
    );

    expect(res.status).toBe(400);
  });

  it('answers 404 for a ticket that does not exist', async () => {
    docGet.mockResolvedValue(snapshot(null));
    const { PATCH } = await load();
    expect((await PATCH(req({ status: 'open' }), ctxTicket('nope'))).status).toBe(404);
  });

  it('rejects a status outside the parser’s vocabulary', async () => {
    docGet.mockResolvedValue(snapshot({ status: 'open', priority: 'low' }));
    const { PATCH } = await load();
    const res = await PATCH(req({ status: 'not_a_status' }), ctxTicket('tk_1'));

    expect(res.status).toBe(400);
    expect(docUpdate).not.toHaveBeenCalled();
  });

  it('reads the ticket under the inline-awaited id', async () => {
    docGet.mockResolvedValue(snapshot({ status: 'open', priority: 'low' }));
    const { PATCH } = await load();
    await PATCH(req({ status: 'resolved' }), ctxTicket('tk_1'));

    // `(await context.params).ticketId` — the shape that fell out of the P0-1 detector.
    expect(docRef).toHaveBeenCalledWith('tk_1');
  });
});
