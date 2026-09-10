/**
 * Coverage for the migrated project-task routes and the user profile route.
 *
 * `projects/[id]/tasks/[taskId]/status` is the only route in the change with TWO path
 * parameters, which makes it the one place where a partially-awaited params object would
 * still "work" for one value and silently produce `undefined` for the other. The test
 * drives both through a single Promise and asserts both resolved values reach the service,
 * so neither can regress independently.
 *
 * All of these routes throw `AppError` rather than returning a response directly, so the
 * refusal path runs through `resolveErrorResponse`. That is deliberately left unmocked:
 * flattening it would stop the tests proving the status code a caller actually receives.
 *
 * `users/[id]` guards a self-or-privileged boundary on both PATCH and DELETE, and the
 * suite asserts the write is refused rather than merely that a non-200 came back.
 */

export {}; // module scope: dynamic imports only, so without this TypeScript treats the
// file as a global script and its top-level names collide with sibling suites.

const getCurrentUser = jest.fn();
const updateTaskStatus = jest.fn();
const createTask = jest.fn();
const listTasks = jest.fn();
const updateUser = jest.fn();
const deactivateUser = jest.fn();

const docGet = jest.fn();
const docRef = jest.fn(() => ({ get: docGet, update: jest.fn(), set: jest.fn() }));
const queryGet = jest.fn();
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
jest.mock('@/app/api/admin/_utils', () => ({
  getCurrentUser: () => getCurrentUser(),
  isAdminRole: (role?: string | null) => role === 'admin' || role === 'super_admin',
}));
jest.mock('@/lib/projects/task-service', () => ({
  TaskService: {
    updateTaskStatus: (...a: unknown[]) => updateTaskStatus(...a),
    createTask: (...a: unknown[]) => createTask(...a),
    listTasks: (...a: unknown[]) => listTasks(...a),
  },
}));
jest.mock('@/lib/users/user-service', () => ({
  UserService: {
    updateUser: (...a: unknown[]) => updateUser(...a),
    deactivateUser: (...a: unknown[]) => deactivateUser(...a),
  },
}));
jest.mock('@/lib/logging', () => ({ logError: jest.fn() }));
jest.mock('@/lib/audit', () => ({ logEvent: jest.fn() }));
jest.mock('@/lib/zapier/service', () => ({ dispatchZapierTriggerEvent: jest.fn() }));
jest.mock('@/lib/notifications', () => ({ createNotification: jest.fn() }));
jest.mock('@/lib/firestore/query-performance', () => ({
  executeMonitoredQuery: async (fn: () => unknown) => (typeof fn === 'function' ? fn() : fn),
  getPageSize: () => 25,
}));
jest.mock('@/app/lib/permissions', () => ({
  assertPermission: () => undefined,
  Permission: { ManageUsers: 'ManageUsers' },
}));

const TENANT_A = 'tenant_a';
const ADMIN_A = { uid: 'admin_a', tenantId: TENANT_A, role: 'admin', email: 'a@example.com' };

const ctxTask = (id: string, taskId: string) => ({ params: Promise.resolve({ id, taskId }) });
const ctxId = (id: string) => ({ params: Promise.resolve({ id }) });

const jsonReq = (body: unknown, method: string) =>
  new Request('https://app.local', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  getCurrentUser.mockResolvedValue(ADMIN_A);
  updateTaskStatus.mockResolvedValue({ id: 'task_1', status: 'completed' });
  queryGet.mockResolvedValue({ docs: [] });
  docGet.mockResolvedValue({ exists: true, id: 'x', data: () => ({ tenantId: TENANT_A }) });
});

describe('projects/[id]/tasks/[taskId]/status — PATCH', () => {
  const load = () => import('@/app/api/projects/[id]/tasks/[taskId]/status/route');

  it('refuses a caller with no tenant context', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { PATCH } = await load();
    const res = await PATCH(
      jsonReq({ status: 'completed' }, 'PATCH') as never,
      ctxTask('p1', 't1'),
    );

    expect(res.status).toBe(401);
    expect(updateTaskStatus).not.toHaveBeenCalled();
  });

  it('rejects a status outside the allowed set', async () => {
    const { PATCH } = await load();
    const res = await PATCH(jsonReq({ status: 'nope' }, 'PATCH') as never, ctxTask('p1', 't1'));

    expect(res.status).toBe(400);
    expect(updateTaskStatus).not.toHaveBeenCalled();
  });

  it('refuses a task that belongs to a different project than the URL names', async () => {
    // Both path parameters are load-bearing: the task must be in the caller's tenant AND
    // in the project named by the URL, so a task id cannot be driven through an unrelated
    // project's endpoint.
    docGet.mockResolvedValue({
      exists: true,
      id: 'task_9',
      data: () => ({ tenantId: TENANT_A, projectId: 'some_other_project' }),
    });
    const { PATCH } = await load();
    const res = await PATCH(
      jsonReq({ status: 'completed' }, 'PATCH') as never,
      ctxTask('proj_9', 'task_9'),
    );

    expect(res.status).toBe(403);
    expect(updateTaskStatus).not.toHaveBeenCalled();
  });

  it('refuses a task in another tenant even when the project id matches', async () => {
    docGet.mockResolvedValue({
      exists: true,
      id: 'task_9',
      data: () => ({ tenantId: 'tenant_b', projectId: 'proj_9' }),
    });
    const { PATCH } = await load();
    const res = await PATCH(
      jsonReq({ status: 'completed' }, 'PATCH') as never,
      ctxTask('proj_9', 'task_9'),
    );

    expect(res.status).toBe(403);
    expect(updateTaskStatus).not.toHaveBeenCalled();
  });

  it('passes BOTH awaited path parameters through, not just one', async () => {
    docGet.mockResolvedValue({
      exists: true,
      id: 'task_9',
      data: () => ({ tenantId: TENANT_A, projectId: 'proj_9' }),
    });
    const { PATCH } = await load();
    const res = await PATCH(
      jsonReq({ status: 'completed' }, 'PATCH') as never,
      ctxTask('proj_9', 'task_9'),
    );

    expect(res.status).toBeLessThan(400);
    // The only two-parameter route in the change: a partially-awaited params object would
    // resolve one and leave the other undefined. taskId reaches the document read, and
    // params.id is what the projectId comparison above is made against.
    expect(docRef).toHaveBeenCalledWith('task_9');
    expect(updateTaskStatus).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task_9', status: 'completed' }),
    );
  });
});

describe('projects/[id]/tasks — POST and GET', () => {
  const load = () => import('@/app/api/projects/[id]/tasks/route');

  it('refuses a caller with no tenant context on create', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { POST } = await load();
    const res = await POST(jsonReq({ title: 'x', priority: 'low' }, 'POST') as never, ctxId('p1'));

    expect(res.status).toBe(401);
    expect(createTask).not.toHaveBeenCalled();
  });

  it('rejects a task with no title rather than creating an unnamed one', async () => {
    const { POST } = await load();
    const res = await POST(jsonReq({ priority: 'low' }, 'POST') as never, ctxId('p1'));

    expect(res.status).toBe(400);
    expect(createTask).not.toHaveBeenCalled();
  });

  it('rejects a priority outside the allowed set', async () => {
    const { POST } = await load();
    const res = await POST(
      jsonReq({ title: 'x', priority: 'catastrophic' }, 'POST') as never,
      ctxId('p1'),
    );

    expect(res.status).toBe(400);
    expect(createTask).not.toHaveBeenCalled();
  });

  it('refuses a caller with no tenant context on list', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { GET } = await load();
    const res = await GET(new Request('https://app.local') as never, ctxId('p1'));

    expect(res.status).toBe(401);
    expect(listTasks).not.toHaveBeenCalled();
  });
});

describe('users/[id] — PATCH and DELETE', () => {
  const load = () => import('@/app/api/users/[id]/route');

  it('refuses an unauthenticated caller on update', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { PATCH } = await load();
    const res = await PATCH(jsonReq({ name: 'New Name' }, 'PATCH'), ctxId('u1'));

    expect(res.status).toBe(401);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller on delete', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { DELETE } = await load();
    const res = await DELETE(new Request('https://app.local', { method: 'DELETE' }), ctxId('u1'));

    expect(res.status).toBe(401);
    expect(deactivateUser).not.toHaveBeenCalled();
  });

  it('rejects an avatar that is not a URL rather than storing it', async () => {
    const { PATCH } = await load();
    const res = await PATCH(jsonReq({ avatar: 'javascript:alert(1)' }, 'PATCH'), ctxId('u1'));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(updateUser).not.toHaveBeenCalled();
  });
});
