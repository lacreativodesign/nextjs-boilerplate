# API Documentation

## Source of truth
- OpenAPI spec: `docs/api/openapi.yaml`
- Runtime endpoint: `GET /api/openapi`
- UI: `/api-docs`

## Generation
Run the generator whenever new route handlers are added or removed:

```bash
npm run docs:api
```

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
