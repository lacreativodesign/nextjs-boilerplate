# Upstash Redis Cache Layer

## Environment

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

## TTL profiles

- Exchange rates: 1 hour
- Tax rates: 24 hours
- User permissions: 5 minutes
- Dashboard data: 5 minutes
- Search results: 10 minutes
- Session validation: 1 hour

## Key patterns

- Exchange rates: `exchange-rates:base:{currency}`
- Tax rates: `tax-rates:tenant:{tenantId}:filters:{hash}`
- Permissions: `permissions:tenant:{tenantId}:user:{userId}`
- Dashboard: `dashboard:tenant:{tenantId}:module:{module}:view:{view}`
- Search: `search:tenant:{tenantId}:module:{module}:query:{hash}`
- Session: `session:id:{sessionHash}`

## Invalidation

- Tax rates are invalidated on create/update/delete via tag `tenant:{tenantId}:tax-rates`.
- Permission snapshots are invalidated per user when role assignments change.
- Session cache is invalidated when sessions are revoked/expired.
- Manual cache clear endpoint:
  - `POST /api/admin/cache/clear`
  - body supports one of `tag`, `prefix`, `tenantId`.

## Cache warming

Use `warmCache` from `lib/cache/redis-client.ts` to pre-populate hot keys during scheduled tasks.
