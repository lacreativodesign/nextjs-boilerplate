# API Changelog

## Versioning Strategy
- URL-based versioning is now canonical: `/api/v1/*`, `/api/v2/*`.
- Existing unversioned routes under `/api/*` remain available as an alias to v1 for backward compatibility.
- Unversioned alias requests return deprecation headers:
  - `X-API-Deprecated: true`
  - `Deprecation: true`
  - `Sunset: <http-date>` (rolling six-month notice)
  - `X-API-Version: v1`

## Deprecation Policy
- Notice period: 6 months from first published deprecation notice.
- Alias usage is logged in `api_usage_logs` with version metadata.
- Deprecated alias usage triggers:
  - Warning logs in monitoring.
  - Email notifications (throttled) to integration contacts from `API_DEPRECATION_NOTIFY_EMAILS` and optional `x-user-email` request header.
- Sunset execution: alias can be disabled after the notice period by rejecting unversioned `/api/*` requests.

## Breaking Changes

### v1
- No breaking changes in this release.
- Existing integrations continue to work unchanged.

### v2 (planned)
- Reserved for future breaking/non-breaking enhancements.
- Current `/api/v2/*` endpoints return `501 Not Implemented` until features are published.

## v1 to v2 Migration Guide
1. Inventory all consumers of `/api/*` and `/api/v1/*`.
2. Move integrations to explicit `/api/v1/*` paths immediately.
3. Track `X-API-Deprecated` response header as a migration-completion KPI.
4. Before adopting v2, validate contract differences using:
   - `/api/openapi?version=v1`
   - `/api/openapi?version=v2`
5. Execute tenant-by-tenant rollout with canary monitoring on version-specific error rates.

## Change Log Entries

### 2026-02-14
- Added request-level API version headers.
- Added deprecation headers for unversioned API alias.
- Added `/api/v1/*` proxy routing to preserve backward compatibility.
- Added `/api/v2/*` reserved route contract.
- Added versioned OpenAPI contracts and API docs version selector.
- Added deprecated alias logging and email notification workflow.
