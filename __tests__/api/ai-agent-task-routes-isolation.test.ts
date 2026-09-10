/**
 * RBAC, plan-gate and tenant-isolation coverage for the migrated `ai/agent-tasks` routes.
 *
 * These four routes share a near-identical preamble — authenticate, check a per-route role
 * set, check the AI plan entitlement, then resolve the task and compare its tenant. That
 * repetition is why Sonar counts them as duplicated, and it is also exactly why they must
 * NOT be collapsed into a shared helper: the role sets differ per route, and a helper
 * would put a security-relevant difference behind a parameter.
 *
 * So the difference is pinned instead. `run-finance` admits `finance` and refuses `sales`;
 * `run-sales` admits `sales` and refuses `finance`. If either set were ever widened by an
 * accidental copy-paste between these two near-identical files, these tests fail.
 *
 * The async-params migration rewrote each handler to await a Promise before the task id is
 * used, so every test supplies a real Promise and asserts the resolved id reaches
 * getAgentTask — a handler that failed to await would look up the string "undefined".
 */

export {}; // module scope: dynamic imports only, so without this TypeScript treats the
// file as a global script and its top-level names collide with sibling suites.

const getCurrentUser = jest.fn();
const checkAiPlan = jest.fn();
const getAgentTask = jest.fn();
const runFinanceAgent = jest.fn();
const runSalesAgent = jest.fn();
const listAgentTasks = jest.fn();
const createAgentTask = jest.fn();

jest.mock('next/headers', () => ({ cookies: async () => ({}) }));
jest.mock('@/lib/tenant/server', () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUser(...args),
}));
jest.mock('@/lib/ai/plan-gate', () => ({
  checkAiPlan: (...args: unknown[]) => checkAiPlan(...args),
  aiPlanLockedBody: (check: unknown) => ({ ok: false, error: 'AI plan locked', check }),
}));
jest.mock('@/lib/ai/agent-task', () => ({
  getAgentTask: (...args: unknown[]) => getAgentTask(...args),
  listAgentTasks: (...args: unknown[]) => listAgentTasks(...args),
  createAgentTask: (...args: unknown[]) => createAgentTask(...args),
}));
jest.mock('@/lib/ai/finance-agent', () => ({
  runFinanceAgent: (...args: unknown[]) => runFinanceAgent(...args),
}));
jest.mock('@/lib/ai/sales-agent', () => ({
  runSalesAgent: (...args: unknown[]) => runSalesAgent(...args),
}));

const TENANT_A = 'tenant_a';
const TENANT_B = 'tenant_b';
const asRole = (role: string) => ({ uid: 'u1', tenantId: TENANT_A, role, email: 'u@example.com' });

const ctx = (taskId: string) => ({ params: Promise.resolve({ taskId }) });
const queued = (tenantId = TENANT_A) => ({ id: 't1', tenantId, status: 'queued' });

beforeEach(() => {
  jest.clearAllMocks();
  getCurrentUser.mockResolvedValue(asRole('admin'));
  checkAiPlan.mockResolvedValue({ ok: true });
});

describe('ai/agent-tasks/[taskId] — GET', () => {
  const load = () => import('@/app/api/ai/agent-tasks/[taskId]/route');

  it('refuses an unauthenticated caller', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { GET } = await load();
    expect((await GET(new Request('https://app.local') as never, ctx('t1'))).status).toBe(401);
    expect(getAgentTask).not.toHaveBeenCalled();
  });

  it('refuses a role outside this route’s allow-list', async () => {
    getCurrentUser.mockResolvedValue(asRole('sales'));
    const { GET } = await load();
    expect((await GET(new Request('https://app.local') as never, ctx('t1'))).status).toBe(401);
    expect(checkAiPlan).not.toHaveBeenCalled();
  });

  it('refuses when the tenant has no AI entitlement, before touching the task', async () => {
    checkAiPlan.mockResolvedValue({ ok: false, reason: 'plan' });
    const { GET } = await load();
    const res = await GET(new Request('https://app.local') as never, ctx('t1'));

    expect(res.status).toBe(403);
    expect(getAgentTask).not.toHaveBeenCalled();
  });

  it('rejects a blank task id rather than looking one up', async () => {
    const { GET } = await load();
    expect((await GET(new Request('https://app.local') as never, ctx('   '))).status).toBe(400);
    expect(getAgentTask).not.toHaveBeenCalled();
  });

  it('answers 404 for a task that does not exist', async () => {
    getAgentTask.mockResolvedValue(null);
    const { GET } = await load();
    expect((await GET(new Request('https://app.local') as never, ctx('missing'))).status).toBe(404);
  });

  it("refuses another tenant's task and does not return it", async () => {
    getAgentTask.mockResolvedValue(queued(TENANT_B));
    const { GET } = await load();
    const res = await GET(new Request('https://app.local') as never, ctx('t_of_b'));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'Forbidden' });
  });

  it('returns an in-tenant task, looked up under the awaited id', async () => {
    getAgentTask.mockResolvedValue(queued());
    const { GET } = await load();
    const res = await GET(new Request('https://app.local') as never, ctx('t1'));

    expect(res.status).toBe(200);
    expect(getAgentTask).toHaveBeenCalledWith('t1');
  });
});

describe('ai/agent-tasks/[taskId]/run-finance and run-sales — the role sets are distinct', () => {
  const loadFinance = () => import('@/app/api/ai/agent-tasks/[taskId]/run-finance/route');
  const loadSales = () => import('@/app/api/ai/agent-tasks/[taskId]/run-sales/route');

  it('run-finance admits finance', async () => {
    getCurrentUser.mockResolvedValue(asRole('finance'));
    getAgentTask.mockResolvedValue(queued());
    const { POST } = await loadFinance();
    const res = await POST(new Request('https://app.local') as never, ctx('t1'));

    expect(res.status).toBe(200);
    expect(runFinanceAgent).toHaveBeenCalledWith('t1', TENANT_A);
  });

  it('run-finance refuses sales', async () => {
    getCurrentUser.mockResolvedValue(asRole('sales'));
    const { POST } = await loadFinance();
    expect((await POST(new Request('https://app.local') as never, ctx('t1'))).status).toBe(401);
    expect(runFinanceAgent).not.toHaveBeenCalled();
  });

  it('run-sales admits sales_manager', async () => {
    getCurrentUser.mockResolvedValue(asRole('sales_manager'));
    getAgentTask.mockResolvedValue(queued());
    const { POST } = await loadSales();
    const res = await POST(new Request('https://app.local') as never, ctx('t1'));

    expect(res.status).toBe(200);
    expect(runSalesAgent).toHaveBeenCalledWith('t1', TENANT_A);
  });

  it('run-sales refuses finance', async () => {
    getCurrentUser.mockResolvedValue(asRole('finance'));
    const { POST } = await loadSales();
    expect((await POST(new Request('https://app.local') as never, ctx('t1'))).status).toBe(401);
    expect(runSalesAgent).not.toHaveBeenCalled();
  });

  it("run-finance will not run an agent against another tenant's task", async () => {
    getAgentTask.mockResolvedValue(queued(TENANT_B));
    const { POST } = await loadFinance();
    const res = await POST(new Request('https://app.local') as never, ctx('t_of_b'));

    expect(res.status).toBe(403);
    expect(runFinanceAgent).not.toHaveBeenCalled();
  });

  it('run-finance refuses to re-run a task that is no longer queued', async () => {
    getAgentTask.mockResolvedValue({ ...queued(), status: 'completed' });
    const { POST } = await loadFinance();
    const res = await POST(new Request('https://app.local') as never, ctx('t1'));

    expect(res.status).toBe(409);
    expect(runFinanceAgent).not.toHaveBeenCalled();
  });

  it('run-sales refuses when the tenant has no AI entitlement', async () => {
    getCurrentUser.mockResolvedValue(asRole('sales'));
    checkAiPlan.mockResolvedValue({ ok: false, reason: 'plan' });
    const { POST } = await loadSales();
    expect((await POST(new Request('https://app.local') as never, ctx('t1'))).status).toBe(403);
    expect(getAgentTask).not.toHaveBeenCalled();
  });
});

describe('ai/agent-tasks — collection GET and POST', () => {
  const load = () => import('@/app/api/ai/agent-tasks/route');

  it('lists only the caller tenant’s tasks', async () => {
    listAgentTasks.mockResolvedValue([{ id: 't1' }]);
    const { GET } = await load();
    const res = await GET();

    expect(res.status).toBe(200);
    expect(listAgentTasks).toHaveBeenCalledWith(TENANT_A, 50);
  });

  it('refuses a role outside the allow-list on list', async () => {
    getCurrentUser.mockResolvedValue(asRole('client'));
    const { GET } = await load();
    expect((await GET()).status).toBe(401);
    expect(listAgentTasks).not.toHaveBeenCalled();
  });

  it('rejects an unknown agent type instead of creating a task', async () => {
    const { POST } = await load();
    const req = new Request('https://app.local', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentType: 'rogue', prompt: 'do a thing' }),
    });

    expect((await POST(req)).status).toBe(400);
    expect(createAgentTask).not.toHaveBeenCalled();
  });

  it('rejects a prompt that is too short to be meaningful', async () => {
    const { POST } = await load();
    const req = new Request('https://app.local', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentType: 'finance', prompt: 'x' }),
    });

    expect((await POST(req)).status).toBe(400);
    expect(createAgentTask).not.toHaveBeenCalled();
  });

  it('creates the task against the caller tenant and uid', async () => {
    createAgentTask.mockResolvedValue({ id: 't9' });
    const { POST } = await load();
    const req = new Request('https://app.local', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentType: 'finance', prompt: '  reconcile the ledger  ' }),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(createAgentTask).toHaveBeenCalledWith({
      tenantId: TENANT_A,
      agentType: 'finance',
      prompt: 'reconcile the ledger',
      createdBy: 'u1',
    });
  });
});
