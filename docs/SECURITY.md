Bizosto — Security Overview
This document describes the security model of the Bizosto platform as it exists in the codebase. It is written for prospective customers, enterprise security reviewers, and investors performing technical diligence. Every control described here is implemented in the repository and, where noted, enforced by an automated test that fails the build if the control regresses.
Last reviewed against the codebase: the S1–S32 hardening series.
1. What Bizosto is
Bizosto is a multi-tenant SaaS ERP for service businesses, built on Next.js 14 (App Router), Firebase (Auth, Firestore, Storage) accessed exclusively through the Admin SDK on the server, Stripe for billing, and Vercel for hosting. A single deployment serves every customer ("tenant"); isolation between tenants is therefore the central security property of the system.
2. Tenant isolation model
Isolation is enforced at the API layer, not delegated to the database rules alone. This is a deliberate choice: the Firebase Admin SDK bypasses Firestore security rules, so the rules are treated as a second line of defence rather than the primary one.
The primary controls are:
Every request resolves its tenant from the authenticated session, never from the request body. A shared server helper derives the caller's tenantId from their verified session claims (lib/tenant/server.ts). Routes that accept a tenantId in the request body do not trust it. This closes the most common multi-tenant vulnerability class — a caller asking for another tenant's data by changing an ID in the payload.
Custom claims always carry both role and tenantId together. User provisioning stamps both, so a user can never exist in an authenticated-but-tenantless state that would bypass scoping.
Fail-closed by default. When tenant context cannot be resolved, or a subscription/plan state is unknown or malformed, the system denies access rather than falling back to a permissive default. An earlier audit finding — an unknown plan silently resolving to "pro" and granting paid modules — was fixed and is now covered by a regression test (lib/tenant/plan-access.ts, S6).
Storage is tenant-scoped by path and locked by rules. Uploaded files are written under tenant-scoped storage paths (lib/storage/paths.ts), and the storage bucket enforces deny-by-default rules with server-side path validation (storage.rules, S4/S5).
Behavioural proof, not just assertion
Tenant isolation is verified by tests that execute the real route handlers against a seeded two-tenant database and assert that a fully-authenticated user of tenant A is refused when presenting a valid identifier belonging to tenant B — and, for writes, that tenant B's data is provably unchanged (__tests__/api/isolation-hardening.test.ts, __tests__/api/tenant-isolation.test.ts, plus per-domain suites for sales and HR). These are mutation-tested: removing an ownership check causes the suite to fail.
3. Role-based access control
Bizosto defines 11 roles: super_admin, admin, sales_manager, sales, am_manager, am, production_manager, production, finance, hr, and client (lib/erpAccess.ts). Each role has a fixed dashboard route, and page/route access is checked in middleware against the caller's session role. Managers see their team's scope; individual contributors are scoped to what they own (for example, a sales user sees only the leads and clients they own, even within their own tenant).
super_admin is the only cross-tenant role and is reserved for platform operators. A single super_admin account exists; all super_admin routes carry their own authorization check.
4. Feature entitlement by plan
Modules are granted per plan tier, not selected manually, and enforced server-side (app/config/plans.ts, lib/tenant/plan-access.ts):
Module
Starter
Pro
Enterprise
CRM, Sales, Projects, Reports, Notifications
✅
✅
✅
Production, Approvals, Finance
—
✅
✅
HR, Client Stripe Connect
—
—
✅
A trial tenant receives the Starter module set. When a subscription is cancelled or deleted, modules and limits are cleared back to the trial baseline (fail-closed billing, S6/E2).
5. Billing integrity
All subscription state flows through one canonical writer (lib/billing/apply-subscription-state.ts). Ad-hoc routes never write billing state directly, which prevents divergent or inconsistent entitlement records.
The finance ledger is append-only; paid invoices are immutable (no delete path).
Webhooks are idempotent (processed-event de-duplication) and unresolvable webhook events are dead-lettered — written to a dead-letter collection, an operator is alerted, and the endpoint returns 500 so the provider retries, rather than silently dropping the event.
6. Application security controls
Content Security Policy — enforced. A strict, nonce-based CSP is the enforced Content-Security-Policy. It was first run in report-only across every role with zero violations recorded before being promoted to enforcement, and it is reversible at runtime via an environment flag without a code change (lib/security/headers.ts, S27). An injected inline script with no valid per-request nonce cannot execute.
Standard hardening headers are always set: Strict-Transport-Security (preload), X-Frame-Options: DENY, X-Content-Type-Options: nosniff, a restrictive Permissions-Policy, and cross-origin isolation headers.
Session cookies are httpOnly and secure.
CSRF protection and rate limiting are enforced in middleware (rate limiting backed by Upstash Redis).
No PII or secrets in logs. Log lines never interpolate email addresses, tokens, passwords, API keys, or user IDs. A single historical leak (a customer email in an invoice cron log) was removed, and a build-failing guard now scans every server file to prevent recurrence (__tests__/api/no-pii-in-logs.test.ts, S23).
BYOK for AI. AI features require the tenant to supply their own model API key; keys are encrypted at rest. There is no shared platform key that could leak across tenants.
7. Data protection
Firestore is accessed only through the Admin SDK on the server; the browser has no direct write path to tenant data. Client-side Firestore access is locked by rules.
Uploaded files are tenant-scoped and access-controlled as described in §2.
Secrets are held in environment variables, never in the repository.
8. Security regression prevention (defence that cannot silently rot)
A distinguishing property of the platform is that its most important guarantees are pinned by automated tests that fail the build when violated. Current standing guards include:
Two-tenant behavioural isolation (isolation-hardening, tenant-isolation, sales-isolation, hr-isolation).
No PII/secrets in logs (no-pii-in-logs).
No fabricated/demo data in product surfaces (no-fake-data).
Writes actually persist, including previously dead buttons (writes-persist).
CSP stays enforced and reversible (csp-enforcement, csp-readiness).
Every navigation link and role dashboard resolves (all-nav-resolves, super-admin-tabs).
No developer-only pages ship to production (no-dev-pages).
Accessibility rules enforced at error level (a11y-enforced).
Core dashboards retain error boundaries (error-boundaries).
The suite runs in CI as a required gate; TypeScript type-checking, ESLint, and the full Jest suite must all pass before a change can merge.
9. Known operational prerequisites
The following are configuration steps required for a hardened production deployment (they are environment actions, not code):
Publish storage.rules in the Firebase console (the repository contains the rules; they must be applied to the live bucket).
Provide the AI BYOK encryption key and the standard application environment variables.
Complete the payment-provider setup before enabling live billing.
10. Reporting a vulnerability
Security issues can be reported to the platform operator at the security contact address for the Bizosto deployment. Please include reproduction steps and the affected surface.