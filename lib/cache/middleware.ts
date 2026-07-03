import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { CACHE_TTL_SECONDS, getCached, setCached } from '@/lib/cache/redis-client';
import { ingestMetric } from '@/lib/monitoring/dashboard-service';

type ApiCacheOptions<T> = {
  ttlSeconds: number;
  key: (req: Request) => string | Promise<string>;
  tags?: string[] | ((req: Request, payload: T) => string[]);
  shouldCache?: (response: NextResponse, payload: T) => boolean;
};

function buildETag(payload: unknown) {
  return `W/\"${crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex')}\"`;
}

function withCacheHeaders(response: NextResponse, etag: string, ttlSeconds: number) {
  response.headers.set('ETag', etag);
  response.headers.set(
    'Cache-Control',
    `private, max-age=${ttlSeconds}, stale-while-revalidate=${ttlSeconds}`,
  );
}

export async function withApiCache<T>(
  req: Request,
  handler: () => Promise<NextResponse<T>>,
  options: ApiCacheOptions<T>,
) {
  if (req.method !== 'GET') return handler();

  const key = await options.key(req);
  const cached = await getCached<{ payload: T; etag: string }>(key);

  const ifNoneMatch = req.headers.get('if-none-match');
  if (cached && ifNoneMatch && ifNoneMatch === cached.etag) {
    await ingestMetric({ type: 'cache_event', module: 'cache', endpoint: key, cacheResult: 'hit' });
    const res = new NextResponse(null, { status: 304 });
    withCacheHeaders(res, cached.etag, options.ttlSeconds);
    return res;
  }

  if (cached) {
    await ingestMetric({ type: 'cache_event', module: 'cache', endpoint: key, cacheResult: 'hit' });
    const res = NextResponse.json(cached.payload);
    withCacheHeaders(res, cached.etag, options.ttlSeconds);
    return res;
  }

  await ingestMetric({ type: 'cache_event', module: 'cache', endpoint: key, cacheResult: 'miss' });

  const response = await handler();
  if (!response.ok) return response;

  const payload = (await response.clone().json()) as T;
  if (options.shouldCache && !options.shouldCache(response, payload)) {
    return response;
  }

  const etag = buildETag(payload);
  await setCached(
    key,
    { payload, etag },
    options.ttlSeconds,
    typeof options.tags === 'function' ? options.tags(req, payload) : options.tags || [],
  );

  withCacheHeaders(response, etag, options.ttlSeconds);
  return response;
}

export async function applyMutationInvalidation(invalidation: Array<() => Promise<void>>) {
  await Promise.all(invalidation.map((fn) => fn()));
}

export const CacheProfiles = {
  exchangeRates: CACHE_TTL_SECONDS.exchangeRates,
  taxRates: CACHE_TTL_SECONDS.taxRates,
  userPermissions: CACHE_TTL_SECONDS.userPermissions,
  dashboardData: CACHE_TTL_SECONDS.dashboardData,
  searchResults: CACHE_TTL_SECONDS.searchResults,
  sessions: CACHE_TTL_SECONDS.sessions,
} as const;
