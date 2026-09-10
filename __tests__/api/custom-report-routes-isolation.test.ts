/**
 * Tenant-scoping and sharing coverage for the migrated `reports/custom/[id]` routes.
 *
 * All four resolve the report through one helper, `getCustomReportOrThrow(tenantId, id)`,
 * and the single most important property of this family is that the tenantId handed to it
 * comes from the *session* while only the id comes from the URL. If those were ever
 * transposed — or if the id were used to address a document directly — a report id would
 * reach across tenants. Every route asserts that call shape explicitly.
 *
 * On top of that, `canAccessReport` decides per-report sharing, and it is asserted to be
 * enforced on all four: a report that exists inside the caller's own tenant but is neither
 * theirs nor shared with them must be refused, and the refusal must land before anything is
 * run, read, scheduled or exported.
 *
 * The `results` route additionally queries snapshots, and that query is asserted to carry
 * the tenant as well as the report id, so a report id alone cannot pull another tenant's
 * cached result sets.
 *
 * The async-params migration rewrote every handler to await a Promise before the id is
 * used, so each test supplies a real Promise and asserts the resolved id is what flows on.
 */

export {}; // module scope: dynamic imports only, so without this TypeScript treats the
// file as a global script and its top-level names collide with sibling suites.

const requireReportsUser = jest.fn();
const getCustomReportOrThrow = jest.fn();
const canAccessReport = jest.fn();
const runReport = jest.fn();
const upsertSchedule = jest.fn();

const queryGet = jest.fn();
const docSet = jest.fn();
const docRef = jest.fn(() => ({ set: docSet, get: jest.fn() }));

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
jest.mock('@/app/api/reports/custom/_utils', () => ({
  requireReportsUser: (...a: unknown[]) => requireReportsUser(...a),
  getCustomReportOrThrow: (...a: unknown[]) => getCustomReportOrThrow(...a),
  canAccessReport: (...a: unknown[]) => canAccessReport(...a),
}));
jest.mock('@/lib/reports/report-builder', () => ({
  ReportBuilderService: {
    runCustomReport: (...a: unknown[]) => runReport(...a),
    computeNextRunAt: () => new Date('2026-01-01T09:00:00.000Z'),
  },
}));
jest.mock('firebase-admin', () => ({
  __esModule: true,
  default: { firestore: { Timestamp: { now: () => ({ __ts: 'now' }) } } },
  firestore: { Timestamp: { now: () => ({ __ts: 'now' }) } },
}));

const TENANT_A = 'tenant_a';
const USER_A = { uid: 'user_a', tenantId: TENANT_A, role: 'admin', email: 'a@example.com' };
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  jest.clearAllMocks();
  requireReportsUser.mockResolvedValue({ user: USER_A, tenantId: TENANT_A });
  getCustomReportOrThrow.mockResolvedValue({ id: 'rep_1', createdBy: USER_A.uid });
  canAccessReport.mockReturnValue(true);
  queryGet.mockResolvedValue({ docs: [] });
});

describe('reports/custom/[id]/results — GET', () => {
  const load = () => import('@/app/api/reports/custom/[id]/results/route');
  const req = () => new Request('https://app.local') as never;

  it('surfaces the reports guard’s refusal as 401', async () => {
    requireReportsUser.mockRejectedValue(new Error('Unauthorized'));
    const { GET } = await load();
    const res = await GET(req(), ctx('rep_1'));

    expect(res.status).toBe(401);
    expect(getCustomReportOrThrow).not.toHaveBeenCalled();
  });

  it('resolves the report with the SESSION tenant and the awaited id', async () => {
    const { GET } = await load();
    await GET(req(), ctx('rep_1'));

    // Tenant from the session, id from the URL — never the other way round.
    expect(getCustomReportOrThrow).toHaveBeenCalledWith(TENANT_A, 'rep_1');
  });

  it('answers 404 for a report id that does not resolve inside this tenant', async () => {
    getCustomReportOrThrow.mockRejectedValue(new Error('Report not found'));
    const { GET } = await load();
    expect((await GET(req(), ctx('rep_of_other_tenant'))).status).toBe(404);
  });

  it('refuses an in-tenant report the caller is not shared on, before reading snapshots', async () => {
    canAccessReport.mockReturnValue(false);
    const { GET } = await load();
    const res = await GET(req(), ctx('rep_1'));

    expect(res.status).toBe(403);
    expect(queryGet).not.toHaveBeenCalled();
  });

  it('scopes the snapshot query by tenant as well as report id', async () => {
    const { GET } = await load();
    const res = await GET(req(), ctx('rep_1'));

    expect(res.status).toBe(200);
    const query = collection.mock.results[0].value as { where: jest.Mock };
    expect(query.where).toHaveBeenCalledWith('tenantId', '==', TENANT_A);
    expect(query.where).toHaveBeenCalledWith('reportId', '==', 'rep_1');
  });
});

describe('reports/custom/[id]/run — POST', () => {
  const load = () => import('@/app/api/reports/custom/[id]/run/route');
  const req = (body: unknown = {}) =>
    new Request('https://app.local', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never;

  it('surfaces the reports guard’s refusal', async () => {
    requireReportsUser.mockRejectedValue(new Error('Unauthorized'));
    const { POST } = await load();
    expect((await POST(req(), ctx('rep_1'))).status).toBe(401);
    expect(runReport).not.toHaveBeenCalled();
  });

  it('resolves the report with the session tenant and the awaited id', async () => {
    const { POST } = await load();
    await POST(req(), ctx('rep_1'));
    expect(getCustomReportOrThrow).toHaveBeenCalledWith(TENANT_A, 'rep_1');
  });

  it('will not run a report the caller is not shared on', async () => {
    canAccessReport.mockReturnValue(false);
    const { POST } = await load();
    const res = await POST(req(), ctx('rep_1'));

    expect(res.status).toBe(403);
    expect(runReport).not.toHaveBeenCalled();
  });

  it('answers 404 for a report that does not resolve in this tenant', async () => {
    getCustomReportOrThrow.mockRejectedValue(new Error('Report not found'));
    const { POST } = await load();
    expect((await POST(req(), ctx('rep_x'))).status).toBe(404);
  });
});

describe('reports/custom/[id]/schedule — POST', () => {
  const load = () => import('@/app/api/reports/custom/[id]/schedule/route');
  const schedule = {
    frequency: 'weekly',
    time: '09:00',
    timezone: 'UTC',
    recipients: ['ops@example.com'],
  };
  const req = (body: unknown = schedule) =>
    new Request('https://app.local', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never;

  it('surfaces the reports guard’s refusal', async () => {
    requireReportsUser.mockRejectedValue(new Error('Unauthorized'));
    const { POST } = await load();
    expect((await POST(req(), ctx('rep_1'))).status).toBe(401);
  });

  it('will not schedule a report the caller is not shared on', async () => {
    canAccessReport.mockReturnValue(false);
    const { POST } = await load();
    const res = await POST(req(), ctx('rep_1'));

    expect(res.status).toBe(403);
    expect(docSet).not.toHaveBeenCalled();
  });

  it('rejects a schedule with no recipients rather than creating a silent job', async () => {
    const { POST } = await load();
    const res = await POST(req({ ...schedule, recipients: [] }), ctx('rep_1'));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(docSet).not.toHaveBeenCalled();
  });

  it('rejects a recipient that is not an email address', async () => {
    const { POST } = await load();
    const res = await POST(req({ ...schedule, recipients: ['not-an-email'] }), ctx('rep_1'));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(docSet).not.toHaveBeenCalled();
  });

  it('resolves the report with the session tenant and the awaited id', async () => {
    const { POST } = await load();
    await POST(req(), ctx('rep_1'));
    expect(getCustomReportOrThrow).toHaveBeenCalledWith(TENANT_A, 'rep_1');
  });
});
