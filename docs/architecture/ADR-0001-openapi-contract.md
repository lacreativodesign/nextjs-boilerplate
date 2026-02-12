# ADR-0001: Enforce generated OpenAPI as API contract

## Status
Accepted

## Context
The API surface is large and evolves frequently across module teams. Manual API docs drift and break integration reliability.

## Decision
Generate `docs/api/openapi.yaml` directly from App Router route handlers (`app/api/**/route.ts`) with `scripts/generate-openapi.mjs` and expose it at `GET /api/openapi`.

## Consequences
- API visibility improves without adding a new framework.
- CI can fail if route additions are undocumented.
- Teams can consume `/api-docs` for synchronized contract testing.
