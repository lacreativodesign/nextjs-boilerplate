/**
 * Separation-of-duties coverage for the migrated CRM discount routes.
 *
 * These two form an approval pair, and the property worth pinning is that their role gates
 * are genuinely DIFFERENT and neither is a superset of the other by accident:
 *
 *   - `deals/[id]/discount-request` — only a role that manages its own deals may raise a
 *     discount request;
 *   - `discount-requests/[id]/review` — only a role that may approve discounts may decide
 *     one.
 *
 * If those two predicates ever converged, the same person could raise and approve their own
 * discount, which is the whole point of splitting the routes. So the real `canManageOwnDeals`
 * and `canApproveDiscount` predicates are used here via requireActual — only the auth guard
 * is replaced — and each route is exercised with the role the OTHER one admits.
 *
 * Both handlers were rewritten by the async-params migration and both throw `AppError`
 * rather than returning directly, so `resolveErrorResponse` is left unmocked and the tests
 * assert the status a caller actually receives.
 */

export {}; // module scope: dynamic imports only, so without this TypeScript treats the
// file as a global script and its top-level names collide with sibling suites.

const requireCrmUser = jest.fn();

const docGet = jest.fn();
const docRef = jest.fn(() => ({ get: docGet, set: jest.fn(), update: jest.fn() }));
const collectionAdd = jest.fn();
const collection = jest.fn(() => ({ doc: docRef, add: collectionAdd }));

jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return { collection };
  },
}));
// Only the auth guard is replaced: the role predicates under test stay real.
jest.mock('@/lib/crm', () => ({
  ...jest.requireActual('@/lib/crm'),
  requireCrmUser: () => requireCrmUser(),
}));
jest.mock('@/lib/logging', () => ({ logError: jest.fn() }));
jest.mock('firebase-admin', () => ({
  __esModule: true,
  default: {
    firestore: {
      FieldValue: { serverTimestamp: () => ({ __ts: 'now' }) },
      Timestamp: { now: () => ({ __ts: 'now' }) },
    },
  },
}));

const TENANT_A = 'tenant_a';
const asRole = (role: string) => ({
  ok: true as const,
  user: { uid: 'u1', tenantId: TENANT_A, role, email: 'u@example.com' },
  tenantId: TENANT_A,
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const body = (payload: unknown) =>
  new Request('https://app.local', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

beforeEach(() => {
  jest.clearAllMocks();
  collectionAdd.mockResolvedValue({ id: 'dr_1' });
  docGet.mockResolvedValue({
    exists: true,
    id: 'deal_1',
    data: () => ({ tenantId: TENANT_A, status: 'pending' }),
  });
});

describe('crm/deals/[id]/discount-request — POST', () => {
  const load = () => import('@/app/api/crm/deals/[id]/discount-request/route');

  it('propagates the CRM guard’s refusal', async () => {
    requireCrmUser.mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });
    const { POST } = await load();
    const res = await POST(body({ discountPercent: 10, reason: 'volume' }), ctx('deal_1'));

    expect(res.status).toBe(401);
    expect(collectionAdd).not.toHaveBeenCalled();
  });

  it('refuses the role that REVIEWS discounts from raising one', async () => {
    // sales_manager can approve; that must not also mean it can request.
    requireCrmUser.mockResolvedValue(asRole('sales_manager'));
    const { POST } = await load();
    const res = await POST(body({ discountPercent: 10, reason: 'volume' }), ctx('deal_1'));

    expect(res.status).toBe(403);
    expect(collectionAdd).not.toHaveBeenCalled();
  });

  it('rejects a non-positive discount rather than recording a no-op request', async () => {
    requireCrmUser.mockResolvedValue(asRole('sales'));
    const { POST } = await load();
    const res = await POST(body({ discountPercent: 0, reason: 'volume' }), ctx('deal_1'));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(collectionAdd).not.toHaveBeenCalled();
  });
});

describe('crm/discount-requests/[id]/review — POST', () => {
  const load = () => import('@/app/api/crm/discount-requests/[id]/review/route');

  it('propagates the CRM guard’s refusal', async () => {
    requireCrmUser.mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });
    const { POST } = await load();
    const res = await POST(body({ decision: 'approved' }), ctx('dr_1'));

    expect(res.status).toBe(401);
  });

  it('refuses the role that RAISES discounts from reviewing one', async () => {
    // The other half of the separation: sales can request, but must not decide.
    requireCrmUser.mockResolvedValue(asRole('sales'));
    const { POST } = await load();
    const res = await POST(body({ decision: 'approved' }), ctx('dr_1'));

    expect(res.status).toBe(403);
  });

  it('rejects a decision that is neither approved nor rejected', async () => {
    requireCrmUser.mockResolvedValue(asRole('sales_manager'));
    const { POST } = await load();
    const res = await POST(body({ decision: 'maybe' }), ctx('dr_1'));

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
