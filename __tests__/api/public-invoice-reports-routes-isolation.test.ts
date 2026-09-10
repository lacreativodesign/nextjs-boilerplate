/**
 * Access-control coverage for the migrated public invoice route and the reports routes.
 *
 * `public/invoice/[invoiceId]` is the only family here with no session at all: it is
 * reachable by an unauthenticated payer, and the single thing standing in front of a
 * customer's invoice is the token checked by `getInvoiceWithValidation`. So the tests pin
 * that the token from the query string is actually passed to that validator alongside the
 * awaited invoice id, and that a rejected validation is returned verbatim without any
 * invoice, tenant or client data being fetched or leaked.
 *
 * The reports routes stack four checks in order — module entitlement, tenant, role/category,
 * then per-report sharing — and each is pinned separately. The ordering matters: the
 * tenant comparison must refuse before the category and sharing rules are consulted, or a
 * report id from another tenant becomes a probe for what categories exist there. Financial
 * and HR presets are additionally restricted by role, which is asserted in both directions
 * so the allow-lists cannot quietly widen.
 *
 * All three handlers await a Promise for their path parameter after the async-params
 * migration, so each test supplies a real Promise.
 */

export {}; // module scope: dynamic imports only, so without this TypeScript treats the
// file as a global script and its top-level names collide with sibling suites.

const getInvoiceWithValidation = jest.fn();
const getTenantRecord = jest.fn();
const getClientRecord = jest.fn();
const getCurrentUserOrThrow = jest.fn();
const getTenantIdForRequestOrThrow = jest.fn();
const requireModule = jest.fn();
const getPresetReportById = jest.fn();
const executeReport = jest.fn();

const docGet = jest.fn();
const docRef = jest.fn(() => ({ get: docGet }));
const collection = jest.fn(() => ({ doc: docRef }));

class PlanAccessError extends Error {
  status = 403;
}

jest.mock('@/app/api/public/invoice/shared', () => ({
  getInvoiceWithValidation: (...a: unknown[]) => getInvoiceWithValidation(...a),
  getTenantRecord: (...a: unknown[]) => getTenantRecord(...a),
  getClientRecord: (...a: unknown[]) => getClientRecord(...a),
}));
jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return { collection };
  },
}));
jest.mock('@/lib/tenant/server', () => ({
  getCurrentUserOrThrow: (...a: unknown[]) => getCurrentUserOrThrow(...a),
  getTenantIdForRequestOrThrow: (...a: unknown[]) => getTenantIdForRequestOrThrow(...a),
}));
jest.mock('@/app/lib/plan-enforcement', () => ({
  requireModule: (...a: unknown[]) => requireModule(...a),
  isPlanAccessError: (err: unknown) => err instanceof PlanAccessError,
}));
jest.mock('@/lib/reports/preset-reports', () => ({
  getPresetReportById: (...a: unknown[]) => getPresetReportById(...a),
}));
jest.mock('@/lib/reports/report-engine', () => ({
  ReportEngine: { execute: (...a: unknown[]) => executeReport(...a) },
}));

const TENANT_A = 'tenant_a';
const TENANT_B = 'tenant_b';
const USER_A = { uid: 'user_a', tenantId: TENANT_A, role: 'admin', email: 'a@example.com' };

const ctxInvoice = (invoiceId: string) => ({ params: Promise.resolve({ invoiceId }) });
const ctxId = (id: string) => ({ params: Promise.resolve({ id }) });
const snapshot = (data: Record<string, unknown> | null) => ({
  exists: data !== null,
  id: 'rep_1',
  data: () => data,
});

beforeEach(() => {
  jest.clearAllMocks();
  getCurrentUserOrThrow.mockResolvedValue(USER_A);
  getTenantIdForRequestOrThrow.mockResolvedValue(TENANT_A);
  requireModule.mockResolvedValue(undefined);
  getPresetReportById.mockReturnValue(null);
});

describe('public/invoice/[invoiceId] — GET', () => {
  const load = () => import('@/app/api/public/invoice/[invoiceId]/route');
  const req = (qs = '') => new Request(`https://app.local/api/public/invoice/inv_1${qs}`);

  it('rejects a blank invoice id without consulting the validator', async () => {
    const { GET } = await load();
    const res = await GET(req(), ctxInvoice('   '));

    expect(res.status).toBe(400);
    expect(getInvoiceWithValidation).not.toHaveBeenCalled();
  });

  it('passes the awaited id and the query token to the validator', async () => {
    getInvoiceWithValidation.mockResolvedValue({ error: 'Invalid token', status: 403 });
    const { GET } = await load();
    await GET(req('?token=abc123'), ctxInvoice('inv_1'));

    expect(getInvoiceWithValidation).toHaveBeenCalledWith('inv_1', 'abc123');
  });

  it('returns the validator’s refusal verbatim and fetches nothing else', async () => {
    getInvoiceWithValidation.mockResolvedValue({ error: 'Invalid token', status: 403 });
    const { GET } = await load();
    const res = await GET(req('?token=wrong'), ctxInvoice('inv_1'));

    expect(res.status).toBe(403);
    // No tenant or client record may be read for an invoice that failed validation.
    expect(getTenantRecord).not.toHaveBeenCalled();
    expect(getClientRecord).not.toHaveBeenCalled();
  });

  it('treats a missing token as no token rather than skipping validation', async () => {
    getInvoiceWithValidation.mockResolvedValue({ error: 'Token required', status: 401 });
    const { GET } = await load();
    const res = await GET(req(), ctxInvoice('inv_1'));

    expect(res.status).toBe(401);
    expect(getInvoiceWithValidation).toHaveBeenCalledWith('inv_1', null);
  });

  it('short-circuits an already-paid invoice without exposing its details', async () => {
    getInvoiceWithValidation.mockResolvedValue({
      payload: { status: 'PAID', paidAt: '2026-01-01', tenantId: TENANT_A, amount: 500 },
    });
    const { GET } = await load();
    const res = await GET(req('?token=ok'), ctxInvoice('inv_1'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      alreadyPaid: true,
      paidAt: '2026-01-01',
    });
    expect(getTenantRecord).not.toHaveBeenCalled();
  });

  it('answers 404 when the invoice’s tenant no longer exists', async () => {
    getInvoiceWithValidation.mockResolvedValue({
      payload: { status: 'unpaid', tenantId: TENANT_A, clientId: 'c1' },
    });
    getTenantRecord.mockResolvedValue(null);
    const { GET } = await load();

    expect((await GET(req('?token=ok'), ctxInvoice('inv_1'))).status).toBe(404);
  });
});

describe('reports/[id] — GET', () => {
  const load = () => import('@/app/api/reports/[id]/route');
  const req = () => new Request('https://app.local') as never;

  it('refuses when the tenant lacks the reports module', async () => {
    requireModule.mockRejectedValue(new PlanAccessError('Reports module not enabled'));
    const { GET } = await load();
    const res = await GET(req(), ctxId('r1'));

    expect(res.status).toBe(403);
    expect(collection).not.toHaveBeenCalled();
  });

  it('serves a preset the caller’s role may see', async () => {
    getPresetReportById.mockReturnValue({ id: 'preset_ops', category: 'operations' });
    const { GET } = await load();
    const res = await GET(req(), ctxId('preset_ops'));

    expect(res.status).toBe(200);
    expect(collection).not.toHaveBeenCalled();
  });

  it('refuses a financial preset to a role outside the finance allow-list', async () => {
    getCurrentUserOrThrow.mockResolvedValue({ ...USER_A, role: 'sales' });
    getPresetReportById.mockReturnValue({ id: 'preset_fin', category: 'financial' });
    const { GET } = await load();

    expect((await GET(req(), ctxId('preset_fin'))).status).toBe(403);
  });

  it('refuses an HR preset to a role outside the hr allow-list', async () => {
    getCurrentUserOrThrow.mockResolvedValue({ ...USER_A, role: 'sales' });
    getPresetReportById.mockReturnValue({ id: 'preset_hr', category: 'hr' });
    const { GET } = await load();

    expect((await GET(req(), ctxId('preset_hr'))).status).toBe(403);
  });

  it('refuses a stored report from another tenant before any category rule is consulted', async () => {
    docGet.mockResolvedValue(
      snapshot({ tenantId: TENANT_B, category: 'operations', isPublic: true }),
    );
    const { GET } = await load();
    const res = await GET(req(), ctxId('r_of_b'));

    // isPublic would otherwise grant access; tenant is checked first, so it cannot.
    expect(res.status).toBe(403);
  });

  it('refuses an in-tenant report the caller is not shared on', async () => {
    docGet.mockResolvedValue(
      snapshot({
        tenantId: TENANT_A,
        category: 'operations',
        isPublic: false,
        createdBy: 'someone_else',
        sharedWith: [],
      }),
    );
    const { GET } = await load();

    expect((await GET(req(), ctxId('r1'))).status).toBe(403);
  });

  it('serves an in-tenant report the caller was shared on', async () => {
    docGet.mockResolvedValue(
      snapshot({
        tenantId: TENANT_A,
        category: 'operations',
        isPublic: false,
        createdBy: 'someone_else',
        sharedWith: [USER_A.uid],
      }),
    );
    const { GET } = await load();
    const res = await GET(req(), ctxId('r1'));

    expect(res.status).toBe(200);
    expect(docRef).toHaveBeenCalledWith('r1');
  });

  it('answers 404 for a report that does not exist', async () => {
    docGet.mockResolvedValue(snapshot(null));
    const { GET } = await load();
    expect((await GET(req(), ctxId('missing'))).status).toBe(404);
  });
});
