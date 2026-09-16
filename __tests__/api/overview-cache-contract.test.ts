/**
 * Cache round-trip contract for the two API overview routes.
 *
 * THE DEFECT
 *
 * Both routes read their cache like this:
 *
 *   const cached = redis ? await redis.get(cacheKey) : null;
 *   if (cached) return NextResponse.json(JSON.parse(String(cached)));
 *
 * `RedisLike.get` is typed `<T>(key: string) => Promise<T | null>` and BOTH client
 * implementations in lib/cache/redis-client.ts return a DESERIALIZED value: the
 * @upstash/redis client parses JSON itself, and the fetch fallback calls JSON.parse
 * before returning. So `cached` is an object, `String(cached)` is the literal
 * "[object Object]", and JSON.parse throws
 *
 *   SyntaxError: "[object Object]" is not valid JSON
 *
 * which the routes' own catch block converts into HTTP 500 "Unable to load ...".
 * app/finance/page.tsx renders that message, which is why the per-role smoke suite
 * saw an error banner on the finance pages.
 *
 * It only fires on a WARM cache, so the first request after each 60s expiry succeeds
 * and repopulates it — an intermittent 500 rather than a constant one.
 *
 * The writes were wrong in the same way and in one more: `(redis as any).setex(...)`
 * is not part of RedisLike and the fetch fallback client does not implement it, so on
 * that client the call throws TypeError synchronously and the attached `.catch()`
 * never runs — turning a fully computed overview into a 500.
 *
 * WHAT THIS PROVES
 *
 * Only the network transport is faked. The real getCached/setCached, the real client
 * selection in createRedisClient, and the real route handlers all run.
 */
import { FirestoreEmulator } from './test-utils/firestore-emulator';
import { adminUser, financeUser } from './test-utils/auth';

type StoredEntry = { value: unknown; ex?: number };

const mockStore = new Map<string, StoredEntry>();
const mockFailure = { get: false, set: false };

/**
 * Faithful @upstash/redis double: `get` hands back the value already deserialized,
 * which is the exact behaviour the routes mis-handled.
 */
const mockRedis = {
  get: jest.fn(async (key: string) => {
    if (mockFailure.get) throw new Error('redis GET unavailable');
    const hit = mockStore.get(key);
    return hit ? structuredClone(hit.value) : null;
  }),
  set: jest.fn(async (key: string, value: unknown, options?: { ex?: number }) => {
    if (mockFailure.set) throw new Error('redis SET unavailable');
    mockStore.set(key, { value: structuredClone(value), ex: options?.ex });
    return 'OK';
  }),
  del: jest.fn(async () => 0),
  sadd: jest.fn(async () => 0),
  smembers: jest.fn(async () => [] as string[]),
  expire: jest.fn(async () => 0),
  scan: jest.fn(async () => [0, []] as [number, string[]]),
};

jest.mock('@upstash/redis', () => ({
  Redis: jest.fn().mockImplementation(() => mockRedis),
}));

const db = new FirestoreEmulator({
  invoices: [
    {
      id: 'inv_overdue',
      data: {
        tenantId: 'tenant_a',
        isDeleted: false,
        status: 'overdue',
        amountTotalUsd: 1200,
        dueDate: '2025-01-01T00:00:00.000Z',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    },
  ],
  payments: [],
  payroll: [],
  expenses: [],
  events: [
    {
      id: 'evt_1',
      data: {
        tenantId: 'tenant_a',
        isDeleted: false,
        type: 'finance.invoice.created',
        title: 'Invoice created',
        description: '',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    },
  ],
  projects: [],
  changeRequests: [],
  users: [],
  onboardingTasks: [],
  clients: [],
});

const financeAuth = financeUser({ uid: 'user_a', tenantId: 'tenant_a' });
const adminAuth = adminUser({ uid: 'admin_a', tenantId: 'tenant_a' });

jest.mock('@/lib/firebaseAdmin', () => ({ adminDb: db }));

jest.mock('@/app/api/finance/_utils', () => ({
  requireFinance: jest.fn(async () => ({ ok: true, user: financeAuth })),
  toISO: (v: any) => (v instanceof Date ? v.toISOString() : (v ?? null)),
}));

jest.mock('@/app/api/admin/reports/_utils', () => ({
  requireAdmin: jest.fn(async () => ({ ok: true, user: adminAuth })),
  toISO: (v: any) => (v instanceof Date ? v.toISOString() : (v ?? null)),
  toMillis: (v: any) => {
    const iso = v instanceof Date ? v.toISOString() : v;
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  },
  getMonthKey: (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
  getStartOfMonth: (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1),
  computeHealth: () => 'on_track',
  getReportSettings: jest.fn(async () => ({
    arAgingBucketsDays: [30, 60, 90],
    keyAccountUsdThreshold: 1000,
    atRiskAfterDays: 3,
    overdueAfterDays: 7,
    projectStages: ['discovery', 'delivery'],
  })),
}));

jest.mock('@/app/api/admin/settings/_utils', () => ({
  DEFAULT_FINANCE_SETTINGS: { fxPkrPerUsd: 280 },
  getFinanceSettings: jest.fn(async () => ({ fxPkrPerUsd: 280 })),
}));

jest.mock('@/lib/logging', () => ({ logError: jest.fn(), logInfo: jest.fn() }));
jest.mock('@/lib/monitoring/dashboard-service', () => ({ ingestMetric: jest.fn(async () => {}) }));

const FINANCE_KEY = 'overview:finance:tenant_a';
const ADMIN_KEY = 'overview:admin:tenant_a';

async function callFinance() {
  const { GET } = await import('@/app/api/finance/overview/route');
  const res = await GET();
  return { res, body: await res.json() };
}

async function callAdmin() {
  const { GET } = await import('@/app/api/admin/overview/route');
  const res = await GET();
  return { res, body: await res.json() };
}

beforeEach(() => {
  jest.resetModules();
  mockStore.clear();
  mockFailure.get = false;
  mockFailure.set = false;
  mockRedis.get.mockClear();
  mockRedis.set.mockClear();
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test.local';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
});

afterAll(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe('GET /api/finance/overview cache round trip', () => {
  it('serves a cold cache and writes the payload under a tenant-scoped key', async () => {
    const { res, body } = await callFinance();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.overview.kpisUsd.outstandingInvoices).toBe(1200);

    // Written, tenant-scoped, and still a 60 second TTL.
    expect(mockStore.has(FINANCE_KEY)).toBe(true);
    expect(mockStore.get(FINANCE_KEY)?.ex).toBe(60);
  });

  it('serves a WARM cache holding an already-deserialized object', async () => {
    // The regression. Before the fix this returned 500 because the route ran
    // JSON.parse(String(<object>)) === JSON.parse('[object Object]').
    const { body: cold } = await callFinance();
    jest.resetModules();

    const { res, body: warm } = await callFinance();

    expect(res.status).toBe(200);
    expect(warm).toEqual(cold);
    expect(warm.ok).toBe(true);
  });

  it('never reads a cached value through JSON.parse(String(...))', async () => {
    mockStore.set(FINANCE_KEY, { value: { ok: true, overview: { sentinel: 'cached' } }, ex: 60 });

    const { res, body } = await callFinance();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, overview: { sentinel: 'cached' } });
  });

  it('ignores a cache entry that is not a usable object rather than erroring', async () => {
    mockStore.set(FINANCE_KEY, { value: 'not-json-at-all', ex: 60 });

    const { res, body } = await callFinance();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.overview.kpisUsd.outstandingInvoices).toBe(1200);
  });

  it('still answers 200 when the cache READ fails', async () => {
    mockFailure.get = true;

    const { res, body } = await callFinance();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('still answers 200 when the cache WRITE fails', async () => {
    mockFailure.set = true;

    const { res, body } = await callFinance();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('does not serve one tenant the other tenant cached overview', async () => {
    mockStore.set('overview:finance:tenant_b', {
      value: { ok: true, overview: { sentinel: 'tenant_b' } },
      ex: 60,
    });

    const { body } = await callFinance();

    expect(body.overview.sentinel).toBeUndefined();
    expect(body.overview.kpisUsd.outstandingInvoices).toBe(1200);
  });
});

describe('GET /api/admin/overview cache round trip', () => {
  it('serves a cold cache and writes the payload under a tenant-scoped key', async () => {
    const { res, body } = await callAdmin();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockStore.has(ADMIN_KEY)).toBe(true);
    expect(mockStore.get(ADMIN_KEY)?.ex).toBe(60);
  });

  it('serves a WARM cache holding an already-deserialized object', async () => {
    const { body: cold } = await callAdmin();
    jest.resetModules();

    const { res, body: warm } = await callAdmin();

    expect(res.status).toBe(200);
    expect(warm).toEqual(cold);
  });

  it('never reads a cached value through JSON.parse(String(...))', async () => {
    mockStore.set(ADMIN_KEY, { value: { ok: true, cards: { sentinel: 'cached' } }, ex: 60 });

    const { res, body } = await callAdmin();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, cards: { sentinel: 'cached' } });
  });

  it('still answers 200 when the cache READ fails', async () => {
    mockFailure.get = true;

    const { res, body } = await callAdmin();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('does not serve one tenant the other tenant cached overview', async () => {
    mockStore.set('overview:admin:tenant_b', {
      value: { ok: true, cards: { sentinel: 'tenant_b' } },
      ex: 60,
    });

    const { body } = await callAdmin();

    expect(body.cards?.sentinel).toBeUndefined();
    expect(body.ok).toBe(true);
  });
});
