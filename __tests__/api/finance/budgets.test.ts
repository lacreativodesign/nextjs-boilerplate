import { FirestoreEmulator, buildTenantSeed } from '../test-utils/firestore-emulator';
import { financeUser } from '../test-utils/auth';
import { jsonRequest } from '../test-utils/request';

const db = new FirestoreEmulator(buildTenantSeed());
const authUser = financeUser({ uid: 'user_a', tenantId: 'tenant_a' });

jest.mock('@/lib/firebaseAdmin', () => ({ adminDb: db }));
jest.mock('@/app/api/finance/_utils', () => ({
  requireFinance: jest.fn(async () => ({ ok: true, user: authUser })),
  serverTimestamp: jest.fn(() => new Date('2025-01-01T00:00:00.000Z')),
}));
jest.mock('@/lib/security', () => ({ checkRateLimit: jest.fn(async () => undefined) }));
jest.mock('@/lib/logging', () => ({ logError: jest.fn() }));

describe('finance budgets API', () => {
  it('creates budget with computed total and percentages', async () => {
    const { POST } = await import('@/app/api/finance/budgets/create/route');
    const res = await POST(
      jsonRequest('https://app.local/api/finance/budgets/create', {
        name: 'FY Budget',
        type: 'department',
        period: 'yearly',
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        currency: 'usd',
        ownerId: 'owner_a',
        categories: [
          { id: 'eng', name: 'Engineering', allocatedAmount: 300 },
          { id: 'sales', name: 'Sales', allocatedAmount: 700 },
        ],
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    const created = await db.collection('budgets').doc(body.budgetId).get();
    expect(created.data()?.totalAmount).toBe(1000);
    expect(created.data()?.categories[0].percentage).toBe(30);
  });

  it('lists only tenant budgets', async () => {
    const { GET } = await import('@/app/api/finance/budgets/list/route');
    const res = await GET(jsonRequest('https://app.local/api/finance/budgets/list'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.budgets.some((b: any) => b.id === 'budget_b')).toBe(false);
  });

  it('returns budget variance for tenant and blocks cross-tenant variance', async () => {
    const { GET } = await import('@/app/api/finance/budgets/variance/route');

    const allowed = await GET(
      jsonRequest('https://app.local/api/finance/budgets/variance?budgetId=budget_a'),
    );
    const allowedBody = await allowed.json();
    expect(allowed.status).toBe(200);
    expect(allowedBody.variance.variance).toBe(400);

    const forbidden = await GET(
      jsonRequest('https://app.local/api/finance/budgets/variance?budgetId=budget_b'),
    );
    expect(forbidden.status).toBe(403);
  });

  it('denies deleting budget from another tenant', async () => {
    const { POST } = await import('@/app/api/finance/budgets/delete/route');
    const res = await POST(
      jsonRequest('https://app.local/api/finance/budgets/delete', { budgetId: 'budget_b' }),
    );
    expect(res.status).toBe(403);
  });
});
