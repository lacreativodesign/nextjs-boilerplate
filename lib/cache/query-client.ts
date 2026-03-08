export const QUERY_CACHE_TTL_MS = {
  exchangeRates: 60 * 60 * 1000,
  taxRates: 24 * 60 * 60 * 1000,
  userPermissions: 5 * 60 * 1000,
  dashboardData: 5 * 60 * 1000,
  searchResults: 10 * 60 * 1000,
  sessions: 60 * 60 * 1000,
} as const;

export function getQueryCacheControl(key: keyof typeof QUERY_CACHE_TTL_MS): string {
  const maxAgeSeconds = Math.floor(QUERY_CACHE_TTL_MS[key] / 1000);
  return `private, max-age=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds}`;
}

export function isCacheFresh(updatedAt: number, key: keyof typeof QUERY_CACHE_TTL_MS): boolean {
  return Date.now() - updatedAt < QUERY_CACHE_TTL_MS[key];
}
