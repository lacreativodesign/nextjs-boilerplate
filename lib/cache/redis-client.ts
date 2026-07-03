import crypto from 'crypto';

export const CACHE_TTL_SECONDS = {
  exchangeRates: 60 * 60,
  taxRates: 24 * 60 * 60,
  userPermissions: 5 * 60,
  dashboardData: 5 * 60,
  searchResults: 10 * 60,
  sessions: 60 * 60,
} as const;

export const CACHE_PREFIX = {
  exchangeRates: 'exchange-rates',
  taxRates: 'tax-rates',
  userPermissions: 'permissions',
  dashboardData: 'dashboard',
  searchResults: 'search',
  sessions: 'session',
} as const;

type RedisLike = {
  get: <T>(key: string) => Promise<T | null>;
  set: (key: string, value: unknown, options?: { ex?: number }) => Promise<unknown>;
  del: (...keys: string[]) => Promise<number>;
  sadd: (key: string, ...members: string[]) => Promise<number>;
  smembers: (key: string) => Promise<string[]>;
  expire: (key: string, seconds: number) => Promise<number>;
  scan: (cursor: number, opts: { match?: string; count?: number }) => Promise<[number, string[]]>;
};

let redisClientPromise: Promise<RedisLike | null> | null = null;

function getRedisEnv() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

async function buildFetchFallbackClient(): Promise<RedisLike | null> {
  const env = getRedisEnv();
  if (!env) return null;

  const baseUrl = env.url.replace(/\/$/, '');
  const request = async <T>(path: string, init?: RequestInit): Promise<T | null> => {
    const response = await fetch(`${baseUrl}/${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.token}`,
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
      cache: 'no-store',
    });

    if (!response.ok) return null;
    const payload = (await response.json()) as { result?: T };
    return payload.result ?? null;
  };

  return {
    get: async <T>(key: string) => {
      const result = await request<T | string | null>(`get/${encodeURIComponent(key)}`);
      if (typeof result === 'string') {
        try {
          return JSON.parse(result) as T;
        } catch {
          return result as T;
        }
      }
      return (result as T | null) ?? null;
    },
    set: async (key, value, options) => {
      const body = JSON.stringify({ value, ex: options?.ex ?? null });
      await request(`set/${encodeURIComponent(key)}`, { method: 'POST', body });
      return 'OK';
    },
    del: async (...keys) => {
      if (!keys.length) return 0;
      const body = JSON.stringify(keys);
      const result = await request<number>('del', { method: 'POST', body });
      return result || 0;
    },
    sadd: async (key, ...members) => {
      if (!members.length) return 0;
      const body = JSON.stringify([key, ...members]);
      const result = await request<number>('sadd', { method: 'POST', body });
      return result || 0;
    },
    smembers: async (key) => {
      const body = JSON.stringify([key]);
      const result = await request<string[]>('smembers', { method: 'POST', body });
      return result || [];
    },
    expire: async (key, seconds) => {
      const body = JSON.stringify([key, seconds]);
      const result = await request<number>('expire', { method: 'POST', body });
      return result || 0;
    },
    scan: async (cursor, opts) => {
      const body = JSON.stringify([cursor, 'MATCH', opts.match || '*', 'COUNT', opts.count || 100]);
      const result = await request<[number, string[]]>('scan', { method: 'POST', body });
      return result || [0, []];
    },
  };
}

async function createRedisClient(): Promise<RedisLike | null> {
  const env = getRedisEnv();
  if (!env) return null;

  try {
    const mod = (await import('@upstash/redis')) as {
      Redis: new (args: { url: string; token: string }) => RedisLike;
    };

    return new mod.Redis({
      url: env.url,
      token: env.token,
    });
  } catch {
    return buildFetchFallbackClient();
  }
}

export async function getRedisClient() {
  if (!redisClientPromise) {
    redisClientPromise = createRedisClient();
  }
  return redisClientPromise;
}

export async function getCached<T>(key: string): Promise<T | null> {
  const redis = await getRedisClient();
  if (!redis) return null;
  return redis.get<T>(key);
}

function cacheTagKey(tag: string) {
  return `cache:tag:${tag}`;
}

export async function setCached<T>(
  key: string,
  value: T,
  ttlSeconds: number,
  tags: string[] = [],
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;

  await redis.set(key, value, { ex: ttlSeconds });

  if (!tags.length) return;

  await Promise.all(
    tags.map(async (tag) => {
      const tagKey = cacheTagKey(tag);
      await redis.sadd(tagKey, key);
      await redis.expire(tagKey, ttlSeconds);
    }),
  );
}

export async function deleteCached(key: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  await redis.del(key);
}

export async function rememberCached<T>(
  key: string,
  ttlSeconds: number,
  producer: () => Promise<T>,
  tags: string[] = [],
): Promise<T> {
  const existing = await getCached<T>(key);
  if (existing !== null) return existing;

  const next = await producer();
  await setCached(key, next, ttlSeconds, tags);
  return next;
}

export async function invalidateTag(tag: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;

  const tagKey = cacheTagKey(tag);
  const keys = await redis.smembers(tagKey);
  if (keys.length) {
    await redis.del(...keys);
  }
  await redis.del(tagKey);
}

export async function invalidateByPrefix(prefix: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;

  let cursor = 0;
  do {
    const [nextCursor, keys] = await redis.scan(cursor, { match: `${prefix}*`, count: 100 });
    if (keys.length) {
      await redis.del(...keys);
    }
    cursor = nextCursor;
  } while (cursor !== 0);
}

export async function warmCache<T>(
  entries: Array<{ key: string; value: T; ttlSeconds: number; tags?: string[] }>,
) {
  await Promise.all(
    entries.map((entry) => setCached(entry.key, entry.value, entry.ttlSeconds, entry.tags || [])),
  );
}

export const cacheKeys = {
  exchangeRates: (baseCurrency: string) => `${CACHE_PREFIX.exchangeRates}:base:${baseCurrency}`,
  taxRates: (
    tenantId: string,
    filters: Record<string, string | number | boolean | null | undefined>,
  ) => {
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(filters))
      .digest('hex')
      .slice(0, 16);
    return `${CACHE_PREFIX.taxRates}:tenant:${tenantId}:filters:${hash}`;
  },
  userPermissions: (tenantId: string, userId: string) =>
    `${CACHE_PREFIX.userPermissions}:tenant:${tenantId}:user:${userId}`,
  dashboardData: (tenantId: string, module: string, view: string) =>
    `${CACHE_PREFIX.dashboardData}:tenant:${tenantId}:module:${module}:view:${view}`,
  searchResults: (tenantId: string, module: string, queryHash: string) =>
    `${CACHE_PREFIX.searchResults}:tenant:${tenantId}:module:${module}:query:${queryHash}`,
  session: (sessionId: string) => `${CACHE_PREFIX.sessions}:id:${sessionId}`,
};
