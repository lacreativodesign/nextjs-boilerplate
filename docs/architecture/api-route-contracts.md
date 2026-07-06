# API Route Contracts

Status: enforced in CI by `__tests__/api/route-guard-coverage.test.ts`
Source of truth: `lib/api/route-contract.ts`
Last verified: July 2026 — 648 route files, 0 unclassified.

## Model

Every `app/api/**/route.ts` that exports any handler (GET, POST, PUT, PATCH,
DELETE, HEAD, OPTIONS) must classify into exactly one contract. Classification
is **evidence-based**: derived from the route's own source (the guard it calls,
the secret or signature it verifies) plus its path. A route with no evidence
and no reviewed public entry is unclassified and **fails the build**.

| Contract        | Count | Required evidence                                                                                                |
| --------------- | ----- | ---------------------------------------------------------------------------------------------------------------- |
| `tenant_scoped` | 320   | User-auth guard + tenant context (`getTenantIdForRequest`, `docTenantId`, `normalizeTenantId`, `.user.tenantId`) |
| `authenticated` | 226   | User-auth guard (`require*`, `getCurrentUser`, `assertPermission`, …); tenant scoping may live inside the guard  |
| `public`        | 42    | Reviewed entry in `PUBLIC_ROUTES` with a written justification                                                   |
| `super_admin`   | 30    | `requireSuperAdmin`; additionally every `super_admin/*` path MUST carry it                                       |
| `internal`      | 11    | Internal signing secret / ingest key (`INTERNAL_REQUEST_SIGNING_SECRET`, `ERP_INGEST_KEY`, …)                    |
| `cron`          | 10    | `CRON_SECRET` / `x-vercel-cron`; every `cron/*` path MUST carry it                                               |
| `webhook`       | 9     | Provider signature verification (`stripe-signature`, `constructEvent`, `verify*Signature`)                       |

Counts change as routes are added; the gate keeps the invariants, not the
numbers (except the public ceiling below).

## Invariants enforced by the test

1. **No unclassified routes** — including GET/read routes.
2. **Every `cron/*` route verifies the cron secret.** A cron route without it
   is a misconfiguration, never public.
3. **Every `super_admin/*` route calls `requireSuperAdmin`.**
4. **Webhook-named routes verify signatures** or are deprecated 410 stubs.
   Webhook-named routes behind user auth are outbound-webhook management
   (subscription CRUD, delivery logs), not inbound receivers, and classify as
   `tenant_scoped`/`authenticated`.
5. **Every public route carries a justification** in `PUBLIC_ROUTES`, and stale
   entries (route deleted) fail the test.
6. **The public surface cannot silently grow** — new public routes require a
   reviewed `PUBLIC_ROUTES` entry in the same PR.

## Public surface (42 routes, all reviewed)

Grouped by why they are safe without a session:

- **Pre-auth account flows** — signup, OTP send/verify, password reset,
  invite acceptance/validation, session-login, logout. Protected by their own
  single-use credentials (hashed OTPs, HMAC invite/reset tokens) and rate
  limiting; tenant provisioning only occurs after verified OTP.
- **Public payment surface** — public invoice view/pay/confirm and the Stripe
  checkout entrypoint. The unguessable payment token is the credential.
- **OAuth/SSO callbacks** — Stripe Connect/Terminal, Google, Microsoft,
  Calendly, QuickBooks, Xero, SSO. State parameter validated in-route; the
  deferred integrations are dormant (env vars empty).
- **Tracking pixels** — Gmail/Outlook open tracking; the tracking ID is the token.
- **Operational metadata** — health/readiness probes, OpenAPI spec, public
  Firebase config (already-public values), i18n bundles, cached currency rates.
- **Telemetry** — monitoring ingest (8KB cap, field whitelist, ingest-keyed in
  production).
- **Versioned proxies** — `v1`/`v2` catch-alls delegate to guarded routes.
- **Deprecated 410 stubs** — legacy webhook/billing endpoints that return
  410 Gone unconditionally with no data access.

## Non-evidence

Rate limiting and the spoofable `x-tenant-id` header are **not** authorization
and are deliberately excluded from the evidence lists.

## Adding a route

- Guarded route: use an approved guard; the classifier picks it up automatically.
- Public route: add to `PUBLIC_ROUTES` with a justification in the same PR.
- New guard helper: add its pattern to the evidence lists in
  `lib/api/route-contract.ts` and note it here.
