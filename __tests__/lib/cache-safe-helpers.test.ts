/**
 * Contract for the best-effort cache accessors in lib/cache/redis-client.ts.
 *
 * These exist because `getCached`/`setCached` reach a network service and are called
 * from route handlers whose catch block answers HTTP 500. A cache that is unreachable,
 * or holding a value written by an older code path, must degrade to "no cache" — never
 * to an error page, and never through `JSON.parse(String(value))`, which turns any
 * object into the literal "[object Object]" and throws.
 *
 * Only the network transport is faked; the real module under test runs.
 */
const mockStore = new Map<string, { value: unknown; ex?: number }>();
const mockFailure = { get: false, set: false };

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

async function loadCache() {
  return import('@/lib/cache/redis-client');
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

describe('getCachedSafe', () => {
  it('returns an already-deserialized object unchanged', async () => {
    const { getCachedSafe } = await loadCache();
    mockStore.set('k', { value: { ok: true, nested: { n: 1 } } });

    await expect(getCachedSafe('k')).resolves.toEqual({ ok: true, nested: { n: 1 } });
  });

  it('returns null on a miss', async () => {
    const { getCachedSafe } = await loadCache();

    await expect(getCachedSafe('absent')).resolves.toBeNull();
  });

  it('parses a legacy JSON string entry', async () => {
    const { getCachedSafe } = await loadCache();
    mockStore.set('k', { value: JSON.stringify({ ok: true, legacy: true }) });

    await expect(getCachedSafe('k')).resolves.toEqual({ ok: true, legacy: true });
  });

  it('treats a non-JSON string as a miss instead of throwing', async () => {
    const { getCachedSafe } = await loadCache();
    mockStore.set('k', { value: 'not-json-at-all' });

    await expect(getCachedSafe('k')).resolves.toBeNull();
  });

  it('treats a JSON scalar as a miss, because a response payload is an object', async () => {
    const { getCachedSafe } = await loadCache();
    mockStore.set('k', { value: '42' });

    await expect(getCachedSafe('k')).resolves.toBeNull();
  });

  it('treats a non-object, non-string value as a miss', async () => {
    const { getCachedSafe } = await loadCache();
    mockStore.set('k', { value: 7 });

    await expect(getCachedSafe('k')).resolves.toBeNull();
  });

  it('returns null rather than rejecting when the cache is unreachable', async () => {
    const { getCachedSafe } = await loadCache();
    mockFailure.get = true;

    await expect(getCachedSafe('k')).resolves.toBeNull();
  });
});

describe('setCachedSafe', () => {
  it('writes the value with the requested TTL', async () => {
    const { setCachedSafe } = await loadCache();

    await setCachedSafe('k', { ok: true }, 60);

    expect(mockStore.get('k')).toEqual({ value: { ok: true }, ex: 60 });
  });

  it('stores the object itself, never a JSON string', async () => {
    const { setCachedSafe } = await loadCache();

    await setCachedSafe('k', { ok: true }, 60);

    expect(typeof mockStore.get('k')?.value).toBe('object');
  });

  it('round-trips through getCachedSafe', async () => {
    const { getCachedSafe, setCachedSafe } = await loadCache();
    const payload = { ok: true, overview: { totals: [1, 2, 3] } };

    await setCachedSafe('k', payload, 60);

    await expect(getCachedSafe('k')).resolves.toEqual(payload);
  });

  it('resolves rather than rejecting when the cache write fails', async () => {
    const { setCachedSafe } = await loadCache();
    mockFailure.set = true;

    await expect(setCachedSafe('k', { ok: true }, 60)).resolves.toBeUndefined();
  });
});

describe('no Redis configured', () => {
  it('reads as a miss and writes as a no-op', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    jest.resetModules();
    const { getCachedSafe, setCachedSafe } = await loadCache();

    await expect(getCachedSafe('k')).resolves.toBeNull();
    await expect(setCachedSafe('k', { ok: true }, 60)).resolves.toBeUndefined();
    expect(mockStore.size).toBe(0);
  });
});
