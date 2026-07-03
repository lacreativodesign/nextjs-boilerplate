# API Documentation

## Source of truth

- OpenAPI specs:
  - `docs/api/openapi.v1.yaml`
  - `docs/api/openapi.v2.yaml`
- Runtime endpoint: `GET /api/openapi?version=v1|v2`
- UI: `/api-docs` (includes version selector)

## Versioning

- Canonical: `/api/v1/*`
- Future: `/api/v2/*`
- Backward-compatible alias: `/api/*` -> v1 (deprecated)

## Generation

Run the generator whenever route handlers are added or removed for v1:

```bash
npm run docs:api
cp docs/api/openapi.yaml docs/api/openapi.v1.yaml
```

## Deprecation policy

- Unversioned `/api/*` alias responses include deprecation headers.
- Notice period is six months before alias sunset.
- Deprecated alias usage is logged and can trigger notification emails.

## Authentication flow

1. Users authenticate through Firebase Auth and receive an ID token.
2. Client submits token to backend APIs in bearer context (cookies/session headers).
3. Server-side route handlers validate identity and hydrate tenant context.
4. API handlers deny requests that fail authentication or role checks.

## Multi-tenancy model

- Every business object is scoped by `tenantId`.
- Route handlers enforce tenant context before processing writes.
- Cross-tenant access is rejected (`403`) unless caller has super-admin capability.
- Search/list endpoints always include tenant filters.
