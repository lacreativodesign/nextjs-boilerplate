Bizosto — Architecture Overview
This document describes how the Bizosto platform is built, for engineers, enterprise reviewers, and technical diligence. It reflects the codebase as of the S1–S32 hardening series.
1. System at a glance
Bizosto is a single Next.js 14 (App Router) application deployed to Vercel, serving all tenants from one codebase and one deployment. It comprises roughly 651 API route handlers and 256 pages across the eleven roles and ten modules described below.
Browser (React, App Router pages)
        │  session cookie (httpOnly, secure)
        ▼
Next.js middleware  ──►  auth, tenant/role resolution, CSRF, rate limiting, CSP nonce
        │
        ▼
API route handlers (server)  ──►  tenant-scoped Firestore/Storage via Firebase Admin SDK
        │                         Stripe (billing), Resend (email), Upstash (rate limit/cache)
        ▼
Firestore (per-tenant data)   Firebase Storage (per-tenant files)
2. Technology choices
Concern
Technology
Notes
Framework
Next.js 14 App Router, TypeScript
Server-first; API routes co-located
Auth
Firebase Auth + custom claims
Claims carry role + tenantId
Database
Firestore via Admin SDK only
Client SDK write access locked by rules
File storage
Firebase Storage
Tenant-scoped paths, deny-by-default rules
Billing
Stripe (+ Connect for Enterprise)
Single canonical state writer
Email
Resend
Transactional + onboarding
Cache / rate limit
Upstash Redis
Middleware-level rate limiting
AI
Anthropic Claude, BYOK
Tenant supplies own key; encrypted at rest
Hosting
Vercel
app.bizosto.com
3. Multi-tenancy
A tenant is a customer workspace. Every business record carries a tenantId, and every server handler resolves the caller's tenant from their authenticated session claims — never from request input. This is the load-bearing decision of the architecture; see SECURITY.md §2 for the isolation guarantees and the behavioural tests that prove them.
The Admin SDK bypasses Firestore rules, so tenant scoping is enforced in application code at the route layer, with Firestore rules as a second layer for any client-side reads.
4. Roles and modules
Eleven roles (lib/erpAccess.ts): super_admin, admin, sales_manager, sales, am_manager, am, production_manager, production, finance, hr, client. Each maps to a fixed dashboard route; middleware enforces that a session role may only enter its own role's surfaces (with admin/super_admin able to traverse module paths).
Ten modules: CRM, Sales, Production, Projects, Approvals, Notifications, Finance, HR, Reports, and Client Stripe Connect. Modules are granted per plan tier (see SECURITY.md §4) and auto-assigned — there is no manual module selection at signup.
The Finance module is the master UI reference; other modules align to its layout and interaction patterns (AppShell + Sidebar + Header + Breadcrumbs, dark/light theming, consistent empty and error states).
5. Request lifecycle
Middleware (middleware.ts) runs first: it authenticates the session cookie, resolves role and subscription state, applies CSRF protection and rate limiting, generates the per-request CSP nonce, and redirects unauthorized page access.
API route handlers re-derive the tenant from the session and perform all data access through the Admin SDK, scoped to that tenant. Route files export only handlers and route config (a build-enforced Next.js constraint).
Responses carry the enforced security headers, including the strict nonce-based CSP.
6. Billing and entitlements
Stripe drives subscriptions; a single canonical service (lib/billing/apply-subscription-state.ts) is the only writer of subscription state, keeping plan, modules, and limits consistent.
The plan → module matrix lives in app/config/plans.ts and is enforced server-side by lib/tenant/plan-access.ts, which fails closed on unknown/malformed plans.
The failed-payment lifecycle (grace → read-only → hard-lock → retention) and trial conversion are handled through the same canonical state machine.
Webhooks are idempotent and dead-lettered on unresolvable events.
7. AI Workforce
AI capabilities (a COO summary agent, and approval-gated Finance and Sales agents, plus natural language reports) are bring-your-own-key: a tenant supplies their own Anthropic API key, stored encrypted. Agent write actions require an approved, tenant-scoped proposal before execution — an agent cannot mutate data on its own authority, and cannot act across tenants.
8. Frontend and UX architecture
A shared AppShell provides the sidebar, header, breadcrumbs, and theme.
Navigation is centrally configured (lib/navigation/sidebarConfig.ts) and guarded so every link resolves to a real page and every role has a landing dashboard.
First-run empty states guide new tenants toward their first action on each dashboard.
Error boundaries at the root and per core dashboard keep the shell intact when a section fails, showing a scoped retry rather than a blank page.
Accessibility lint rules are enforced at error level.
9. Testing and quality gates
Quality is enforced by a CI gate that requires, on every change:
TypeScript type-check clean.
ESLint clean (including accessibility rules at error level).
Full Jest suite green — 79 test suites, ~529 tests at the time of writing.
The suite is weighted toward behavioural security tests (executing real handlers against a seeded two-tenant database) and standing regression guards that fail the build if a previously-fixed problem returns (isolation, PII-in-logs, fabricated data, dead navigation, dev-page leakage, CSP enforcement, accessibility, error boundaries). See SECURITY.md §8.
10. Deployment and environments
Hosted on Vercel; the repository is the single source of truth for application code.
Firestore composite indexes and Storage rules are maintained in the Firebase console; the repository documents the required indexes and contains the storage rules to apply.
Configuration is entirely environment-variable driven; no secrets are committed.
11. Directory orientation
Path
Contains
app/
Pages and API route handlers (App Router)
app/api/
~651 server route handlers
app/config/plans.ts
Plan → module entitlement matrix
lib/tenant/
Tenant resolution and plan access (isolation core)
lib/billing/
Canonical subscription-state service
lib/security/
CSP and security headers
lib/storage/
Tenant-scoped storage paths
lib/ai/
AI Workforce agents, BYOK crypto, tool registry
components/
Shared UI (AppShell, dashboards, onboarding, errors)
__tests__/
Behavioural and regression test suites
docs/
This document, SECURITY.md, and operational references