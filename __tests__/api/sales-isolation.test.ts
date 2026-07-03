import { FirestoreEmulator } from './test-utils/firestore-emulator';
import { jsonRequest } from './test-utils/request';

const db = new FirestoreEmulator({
  deals: [
    {
      id: 'deal_a',
      data: { tenantId: 'tenant_a', ownerId: 'sales_a', stage: 'qualified', value: 100 },
    },
    {
      id: 'deal_b',
      data: { tenantId: 'tenant_b', ownerId: 'sales_b', stage: 'qualified', value: 200 },
    },
  ],
});

const requireSalesWrite = jest.fn(async () => ({
  ok: true as const,
  user: {
    uid: 'sales_a',
    tenantId: 'tenant_a',
    role: 'sales_manager',
    name: 'Sales A',
    email: 'a@example.com',
  },
}));

jest.mock('firebase-admin', () => ({
  firestore: {
    FieldValue: {
      serverTimestamp: () => new Date('2025-01-01T00:00:00.000Z'),
      arrayUnion: (...args: unknown[]) => args,
    },
  },
}));
jest.mock('@/lib/firebaseAdmin', () => ({ adminDb: db }));
jest.mock('@/lib/audit', () => ({ logEvent: jest.fn() }));
jest.mock('@/lib/notifications', () => ({ createNotification: jest.fn() }));
jest.mock('@/app/api/sales/_utils', () => ({
  requireSalesWrite,
  requireSalesRead: jest.fn(),
  getSalesSettings: jest.fn(async () => ({})),
  getWatcherUserIds: jest.fn(async () => []),
  notifyUsers: jest.fn(async () => undefined),
  isSales: (role: string) => role === 'sales',
  parseNumber: (value: unknown, fallback: number) => (typeof value === 'number' ? value : fallback),
  parseString: (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback),
  serverTimestamp: () => new Date('2025-01-01T00:00:00.000Z'),
  userLabel: () => 'Sales A',
}));

describe('sales tenant isolation', () => {
  it('prevents tenant A from updating tenant B deal', async () => {
    const route = await import('@/app/api/sales/deals/update/route');
    const res = await route.POST(
      jsonRequest('https://app.local/api/sales/deals/update', { id: 'deal_b', discountPct: 0 }),
    );
    expect(res.status).toBe(403);
  });

  it('returns unauthorized on missing sales auth', async () => {
    requireSalesWrite.mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: 'Unauthorized',
    } as any);
    const route = await import('@/app/api/sales/deals/update/route');
    const res = await route.POST(
      jsonRequest('https://app.local/api/sales/deals/update', { id: 'deal_a', discountPct: 0 }),
    );
    expect(res.status).toBe(401);
  });
});
