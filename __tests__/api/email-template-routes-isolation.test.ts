/**
 * Tenant-isolation coverage for the migrated `email/templates/[id]` routes.
 *
 * All three read the template with an unscoped `doc(id)` and then compare its tenant
 * against the caller's — but they compare it through `normalizeTenantId` on both sides
 * rather than by raw string equality. That normalisation is the actual boundary here, so
 * the suite exercises it rather than mocking it away. It trims and falls back to the
 * default tenant; it does NOT fold case. Both halves are asserted, so a padded value still
 * resolves to the same tenant while a differently cased one stays a different tenant and is
 * refused — neither behaviour can drift unnoticed.
 *
 * The consequences differ per route and each is pinned separately: `preview` renders the
 * template body, so a leak would disclose another tenant's email content; `variables`
 * discloses the merge fields, which describe that tenant's data model; the collection read
 * returns the template plus its version history.
 *
 * The async-params migration rewrote each handler to await a Promise before the id is
 * used, so every test supplies a real Promise and asserts the resolved id addresses the
 * document.
 */

export {}; // module scope: dynamic imports only, so without this TypeScript treats the
// file as a global script and its top-level names collide with sibling suites.

const getCurrentUser = jest.fn();
const renderTemplate = jest.fn();
const generatePreviewPayload = jest.fn();
const getVariablesForCategory = jest.fn();
const getTenantBranding = jest.fn();
const buildEmailBrandingTemplate = jest.fn();

const docGet = jest.fn();
const queryGet = jest.fn();
const collectionAdd = jest.fn();
const docSet = jest.fn();
const docRef = jest.fn(() => ({ get: docGet, set: docSet }));

const makeQuery = () => {
  const q: Record<string, unknown> = {};
  q.where = jest.fn(() => q);
  q.orderBy = jest.fn(() => q);
  q.limit = jest.fn(() => q);
  q.get = queryGet;
  return q;
};
const collection = jest.fn(() => ({ doc: docRef, add: collectionAdd, ...makeQuery() }));

jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return { collection };
  },
}));
jest.mock('@/app/api/admin/_utils', () => ({
  getCurrentUser: () => getCurrentUser(),
  isAdminOrSuper: (role?: string | null) => role === 'admin' || role === 'super_admin',
}));
jest.mock('@/lib/email/template-engine', () => ({
  renderTemplate: (...a: unknown[]) => renderTemplate(...a),
  generatePreviewPayload: (...a: unknown[]) => generatePreviewPayload(...a),
}));
jest.mock('@/lib/email/template-catalog', () => ({
  getVariablesForCategory: (...a: unknown[]) => getVariablesForCategory(...a),
}));
jest.mock('@/lib/white-label/branding', () => ({
  getTenantBranding: (...a: unknown[]) => getTenantBranding(...a),
  buildEmailBrandingTemplate: (...a: unknown[]) => buildEmailBrandingTemplate(...a),
}));
jest.mock('@/lib/email/template-repository', () => ({
  toIso: (v: unknown) => (v ? '2026-01-01T00:00:00.000Z' : null),
  emailTemplateSchema: { safeParse: () => ({ success: false, error: { flatten: () => ({}) } }) },
  buildTemplatePayload: (d: unknown) => d,
  writeTemplateVersion: jest.fn(),
}));

const TENANT_A = 'tenant_a';
const TENANT_B = 'tenant_b';
const USER_A = { uid: 'user_a', tenantId: TENANT_A, role: 'admin', email: 'a@example.com' };

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const snapshot = (data: Record<string, unknown> | null) => ({
  exists: data !== null,
  id: 'tpl_1',
  data: () => data,
});

beforeEach(() => {
  jest.clearAllMocks();
  getCurrentUser.mockResolvedValue(USER_A);
  queryGet.mockResolvedValue({ docs: [] });
  collectionAdd.mockResolvedValue({ id: 'usage_1' });
  generatePreviewPayload.mockReturnValue({});
  renderTemplate.mockReturnValue({ subject: 's', body: 'b' });
  getVariablesForCategory.mockReturnValue(['first_name']);
  getTenantBranding.mockResolvedValue({});
  buildEmailBrandingTemplate.mockReturnValue({});
});

describe('email/templates/[id] — GET', () => {
  const load = () => import('@/app/api/email/templates/[id]/route');
  const req = () => new Request('https://app.local') as never;

  it('refuses an unauthenticated caller', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { GET } = await load();
    expect((await GET(req(), ctx('tpl_1'))).status).toBe(401);
    expect(collection).not.toHaveBeenCalled();
  });

  it('answers 404 for a template that does not exist', async () => {
    docGet.mockResolvedValue(snapshot(null));
    const { GET } = await load();
    expect((await GET(req(), ctx('missing'))).status).toBe(404);
  });

  it("refuses another tenant's template and reads no version history", async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_B, name: 'Theirs' }));
    const { GET } = await load();
    const res = await GET(req(), ctx('tpl_of_b'));

    expect(res.status).toBe(403);
    expect(queryGet).not.toHaveBeenCalled();
  });

  it('returns an in-tenant template under the awaited id', async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_A, name: 'Ours' }));
    const { GET } = await load();
    const res = await GET(req(), ctx('tpl_1'));

    expect(res.status).toBe(200);
    expect(docRef).toHaveBeenCalledWith('tpl_1');
  });
});

describe('email/templates/[id] — PUT', () => {
  const load = () => import('@/app/api/email/templates/[id]/route');
  const req = () =>
    new Request('https://app.local', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    }) as never;

  it('refuses an unauthenticated caller', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { PUT } = await load();
    expect((await PUT(req(), ctx('tpl_1'))).status).toBe(401);
    expect(docSet).not.toHaveBeenCalled();
  });

  it('refuses a non-admin before the template is even read', async () => {
    // Editing a template changes what every recipient in the tenant receives, so the
    // role check deliberately precedes the read.
    getCurrentUser.mockResolvedValue({ ...USER_A, role: 'staff' });
    const { PUT } = await load();
    const res = await PUT(req(), ctx('tpl_1'));

    expect(res.status).toBe(403);
    expect(collection).not.toHaveBeenCalled();
  });

  it("refuses to edit another tenant's template", async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_B }));
    const { PUT } = await load();
    const res = await PUT(req(), ctx('tpl_of_b'));

    expect(res.status).toBe(403);
    expect(docSet).not.toHaveBeenCalled();
  });

  it('answers 404 for a template that does not exist', async () => {
    docGet.mockResolvedValue(snapshot(null));
    const { PUT } = await load();
    expect((await PUT(req(), ctx('missing'))).status).toBe(404);
    expect(docSet).not.toHaveBeenCalled();
  });
});

describe('email/templates/[id]/preview — POST', () => {
  const load = () => import('@/app/api/email/templates/[id]/preview/route');
  const req = () =>
    new Request('https://app.local', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ context: {} }),
    }) as never;

  it('refuses an unauthenticated caller', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { POST } = await load();
    expect((await POST(req(), ctx('tpl_1'))).status).toBe(401);
    expect(renderTemplate).not.toHaveBeenCalled();
  });

  it("never renders another tenant's template body", async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_B, body: 'their secret copy' }));
    const { POST } = await load();
    const res = await POST(req(), ctx('tpl_of_b'));

    expect(res.status).toBe(403);
    // Rendering would disclose the other tenant's email content, so it must not happen.
    expect(renderTemplate).not.toHaveBeenCalled();
  });

  it('renders an in-tenant template', async () => {
    docGet.mockResolvedValue(snapshot({ tenantId: TENANT_A, body: 'ours' }));
    const { POST } = await load();
    const res = await POST(req(), ctx('tpl_1'));

    expect(res.status).toBe(200);
    expect(renderTemplate).toHaveBeenCalled();
  });

  it('treats a padded tenant value as the same tenant, but a differently cased one as foreign', async () => {
    // normalizeTenantId is the real boundary here and is deliberately not mocked. It trims
    // and falls back to the default tenant — it does NOT fold case, so 'Tenant_A' is a
    // different tenant from 'tenant_a'. Both halves are asserted so neither can drift.
    docGet.mockResolvedValue(snapshot({ tenantId: '  tenant_a  ', body: 'ours' }));
    const { POST } = await load();
    expect((await POST(req(), ctx('tpl_1'))).status).toBe(200);

    jest.clearAllMocks();
    getCurrentUser.mockResolvedValue(USER_A);
    docGet.mockResolvedValue(snapshot({ tenantId: 'Tenant_A', body: 'theirs' }));
    expect((await POST(req(), ctx('tpl_1'))).status).toBe(403);
  });
});

describe('email/templates/[id]/variables — GET', () => {
  const load = () => import('@/app/api/email/templates/[id]/variables/route');
  const req = () => new Request('https://app.local');

  it('refuses an unauthenticated caller', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { GET } = await load();
    expect((await GET(req(), ctx('tpl_1'))).status).toBe(401);
  });

  it("does not disclose another tenant's merge fields", async () => {
    docGet.mockResolvedValue(
      snapshot({ tenantId: TENANT_B, category: 'invoice', variables: ['their_field'] }),
    );
    const { GET } = await load();
    const res = await GET(req(), ctx('tpl_of_b'));

    expect(res.status).toBe(403);
    await expect(res.text()).resolves.not.toContain('their_field');
  });

  it('merges stored and catalogue variables for an in-tenant template', async () => {
    docGet.mockResolvedValue(
      snapshot({ tenantId: TENANT_A, category: 'invoice', variables: ['invoice_no'] }),
    );
    const { GET } = await load();
    const res = await GET(req(), ctx('tpl_1'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      variables: ['first_name', 'invoice_no'],
      category: 'invoice',
    });
  });
});
