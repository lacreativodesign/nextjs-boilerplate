# Bizosto — SOC 2 / SOC 3 Trust Services Criteria Audit

**Read-only controls audit against the AICPA Trust Services Criteria (TSC).**
No application code, configuration, or dependency was modified in the course of this audit.

---

## 1. Executive Summary

**Overall readiness score: 64 / 100**

**Verdict: No — this codebase would not survive a SOC 2 Type I readiness assessment today.**

Two independent defects break the tenant isolation boundary in the privacy subsystem: any tenant
administrator can export, and separately delete, the user records of a *different* tenant by
supplying that tenant's user id in a request body. Both are exploitable now with no special
privilege beyond an ordinary tenant-admin account. Either alone blocks attestation. Separately,
the organizational control set that a Type I engagement examines first — security policy set, risk
register, access reviews, subprocessor DPAs, penetration test — is absent from the repository
entirely (Section 6).

That verdict should be read alongside what is genuinely strong here, because the gap is narrow
rather than broad. The technical access-control substrate is materially better than typical for a
codebase of this size: **all 658 API routes are machine-classified into an enforced route
contract with zero unclassified routes** (verified by execution, not inspection), Firestore rules
are default-deny, API keys are hashed with constant-time comparison and true rotation, all three
Stripe webhooks verify signatures *and* claim events atomically before side effects, the finance
ledger is append-only, and backups carry per-file SHA-256 manifests with a checksum-verifying
restore path and a witnessed DR drill. This is not a codebase that neglected security. It is one
where a small number of specific boundaries were missed, and where the compliance *documentation*
layer has not been built at all.

The remediation for the two P0s is small and local — a tenant-ownership check on `subjectUserId`
in one module (`lib/compliance/data-retention.ts`) plus its two calling routes. Work package WP-1
in Section 7 touches 3 files.

---

## 2. Scope & Method

| Field | Value |
|---|---|
| Repository | `lacreativodesign/nextjs-boilerplate` (product name: Bizosto) |
| Commit SHA | `38dfa163b9c5d7d437a54d64d76f34d6f3906be2` |
| Branch audited | `claude/soc2-tsc-audit-46lec0` |
| Audit date | 2026-09-01 |
| Node / npm | v22.22.2 / 10.9.7 |
| Tracked files | 1,774 |
| API routes (`app/api/**/route.ts`) | 658 |
| Pages (`app/**/page.tsx`) | 258 |
| Test files (`__tests__/**/*.test.ts*`) | 190 |

### Method

Static analysis of the working tree, plus three forms of **dynamic** verification:

1. **Executed the repository's own route-contract classifier** against all 658 routes by
   replicating `lib/api/route-contract.ts` logic in a standalone harness, to obtain real
   classification counts rather than trusting the test's assertions.
2. **Ran the repository's guard test suites** — `__tests__/api/route-guard-coverage.test.ts` and
   all of `__tests__/config/` — after `npm ci`. Result: **7 suites, 70 tests, all passing.**
3. **Ran `npm audit --omit=dev --json`** against the committed lockfile.

### Examined

Route auth contracts and guard coverage; tenant-scope trust boundary; custom claims integrity;
session lifecycle and revocation; Firestore and Storage rules; API-key storage and comparison;
secret material in source and git history index; role/permission model; rate limiting; dependency
vulnerabilities; Sentry configuration and PII scrubbing; log hygiene; backup/restore/DR; cron
inventory and authentication; CI/CD gates; audit-log coverage; input validation coverage; webhook
signature verification and idempotency; billing-state write paths and ledger immutability;
encryption at rest (AES-256-GCM); DSAR export, erasure, and retention paths; consent capture;
security headers and CSP; CSRF; XSS and dynamic-code sinks.

### NOT examined (out of scope for a repository audit)

Runtime/production configuration and actual environment-variable values; deployed Firestore
ruleset (only the version-controlled source); Vercel project settings, deployment protection, and
**whether the Vercel edge strips inbound `x-vercel-cron` headers** (material to F-04); GitHub
branch-protection settings (Section 3.4 / F-14); Stripe and Firebase console configuration; actual
Sentry data retention; live penetration testing or dynamic exploitation; the organizational
controls in Section 6.

**Evidence standard applied:** every PASS cites `path:line`. Any check that could not be completed
from the repository is recorded as UNKNOWN with the reason, never as PASS.

---

## 3. Scorecard

| Criterion | Controls Tested | Pass | Partial | Fail | Unknown | Score |
|---|---:|---:|---:|---:|---:|---:|
| **CC1** — Control Environment | 4 | 0 | 1 | 0 | 3 | 15 |
| **CC2** — Communication & Information | 5 | 3 | 1 | 0 | 1 | 68 |
| **CC3** — Risk Assessment | 4 | 1 | 1 | 1 | 1 | 38 |
| **CC4** — Monitoring Activities | 6 | 3 | 2 | 1 | 0 | 62 |
| **CC5** — Control Activities | 5 | 4 | 1 | 0 | 0 | 82 |
| **CC6** — Logical & Physical Access | 14 | 9 | 2 | 2 | 1 | **58** ⛔ |
| **CC7** — System Operations | 9 | 5 | 3 | 1 | 0 | 66 |
| **CC8** — Change Management | 7 | 4 | 2 | 0 | 1 | 71 |
| **CC9** — Risk Mitigation / Vendors | 3 | 0 | 0 | 2 | 1 | 12 |
| **A1** — Availability | 6 | 5 | 1 | 0 | 0 | 85 |
| **C1** — Confidentiality | 7 | 4 | 1 | 1 | 1 | **55** ⛔ |
| **PI1** — Processing Integrity | 8 | 4 | 3 | 1 | 0 | 68 |
| **P1–P8** — Privacy | 9 | 2 | 2 | 4 | 1 | **45** ⛔ |

⛔ = criterion contains at least one open P0 and is therefore **capped at 60** per the scoring rule.

**Weighted overall: 64 / 100** (CC6 weighted heaviest, consistent with the audit brief).

---

## 4. Findings Register

Sorted by severity. **P0 = exploitable now, or blocks attestation.**

| ID | Criterion | Sev | Finding | Evidence (path:line) | Impact | Remediation |
|---|---|---|---|---|---|---|
| **F-01** | CC6, C1, P6 | **P0** | **Cross-tenant DSAR export.** `createDataExportRequest` never verifies that `subjectUserId` belongs to `tenantId`. `collectUserData` reads `users/{subjectUserId}` with no tenant filter, and queries six top-level collections filtered by `userId`/`ownerId` **only**. The route accepts `subjectUserId` verbatim from the request body, gated solely by `canManageCompliance(me.role)` — i.e. any tenant admin. | `lib/compliance/data-retention.ts:143`, `:167`, `:168-172`, `:204-228`; `app/api/compliance/export-data/route.ts:24-32` | A tenant-A admin exports a tenant-B user's profile plus their invoices, expenses, projects, tasks, documents and notifications. Cross-tenant PII disclosure; GDPR Art. 5(1)(f) breach; fatal to a confidentiality attestation. Note `auditLogs` (`:146`) and `consentRecords` (`:195`) *are* tenant-filtered — the boundary was intended and missed on the other paths. | Resolve the subject's tenant from `users/{subjectUserId}` and reject when `!== input.tenantId` before any read. Add `.where('tenantId','==',tenantId)` to the six collection queries. |
| **F-02** | CC6, P4, P5 | **P0** | **Cross-tenant erasure.** `deleteOrAnonymizeUserData` deletes or redacts `users/{userId}` with **no tenant check whatsoever**. `createDataDeletionRequest` adds none. The route takes `subjectUserId` from the body under the same tenant-admin-only gate. | `lib/compliance/data-retention.ts:316-335`, `:280-303`; `app/api/compliance/delete-data/route.ts:24-32` | A tenant-A admin **permanently deletes** a tenant-B user's account document (`mode:'delete'`, line 322) or redacts their PII. Destructive, cross-tenant, irreversible. The audit-log redaction at `:337-342` *is* tenant-scoped, so the user doc is destroyed while the other tenant's logs are untouched — inconsistent state on top of the breach. | Same ownership check as F-01, applied before line 317. Consider requiring `super_admin` for `mode:'delete'`. |
| **F-03** | P4, C1 | **P1** | **Retention cleanup is a silent no-op.** `runRetentionCleanup` queries `tenants/{id}/{policy.collectionPath}` — tenant **subcollections**, which do not exist in this data model (data lives in top-level collections keyed by a `tenantId` field). The module's own comment at `:165-166` documents this exact bug being fixed for the export path; the retention path was not fixed. | `lib/compliance/data-retention.ts:98-103` vs. `:162-167`; model confirmed at `app/api/cron/backup/route.ts:16-20` | Every retention policy scans 0 documents and deletes 0. The monthly cron (`vercel.json` `0 3 1 * *`) reports success with `scanned:0, deleted:0`. Data is retained indefinitely while the system reports compliance — worse than no retention control, because it manufactures false evidence. | Query the top-level collection filtered by `tenantId` and the cutoff, mirroring `:167`. Add a test asserting a seeded old doc is actually deleted. |
| **F-04** | CC6, CC7 | **P1** | **Spoofable cron authentication on 4 routes.** `isAuthorized` short-circuits `if (isCronFromVercel) return true;` *before* the `CRON_SECRET` check, where `isCronFromVercel` trusts the client-supplied `x-vercel-cron` header. Middleware's platform-key gate is skipped whenever a `lac_session` cookie is present (`middleware.ts:481-484`), so any authenticated user can reach the handler. | `app/api/cron/backup/route.ts:47-55`; `app/api/cron/trial-emails/route.ts:32-39`; `app/api/cron/billing-locks/route.ts:19-25`; `app/api/cron/abandoned-signups/route.ts:19-25`; bypass path `middleware.ts:481-484` | Any logged-in user could trigger a full cross-tenant backup run, or force tenant downgrades / hard-locks via `trial-emails`. **Severity is conditional:** exploitability depends on whether the Vercel edge strips inbound `x-vercel-cron` on this plan — **UNKNOWN, not verifiable from the repository.** The remaining 8 cron routes correctly require `Bearer CRON_SECRET`. | Delete the short-circuit; require `Bearer ${CRON_SECRET}` unconditionally (compare with `timingSafeEqual`). Vercel Cron can send the Authorization header. |
| **F-05** | CC4, PI1 | **P1** | **Audit-log coverage is 17% of mutating routes.** 65 of 393 routes exporting POST/PUT/PATCH/DELETE reference the audit writer. 107 of the 328 uncovered routes are high-risk by name. | Writer at `lib/audit.ts:147` (`logEvent`), `lib/audit/audit-logger.ts:28`. Uncovered high-risk examples: `app/api/admin/settings/api-key/route.ts`, `app/api/admin/settings/security/route.ts`, `app/api/admin/finance/payroll/run/route.ts`, `app/api/admin/finance/invoices/delete/route.ts`, `app/api/admin/quotas/route.ts`, `app/api/admin/files/delete/route.ts` | CC4.1 / CC7.2 require detection of unauthorized change. API-key issuance, security-settings changes, payroll runs and invoice deletion leave no audit trail — an auditor cannot reconstruct who changed what. | Wrap mutations in a shared helper that writes the audit entry in the same transaction. Prioritize the 20 routes listed in Section 4a. |
| **F-06** | PI1 | **P1** | **318 of 393 mutating routes have no schema validation.** Only 75 import `zod`; 84 route files use `z.object`, 38 use `safeParse`. No shared validation wrapper exists (`validateBody`/`parseBody`/`assertValid` → 0 hits). | Counts from classifier over `app/api/**/route.ts`; examples `app/api/admin/clients/create/route.ts`, `app/api/admin/change-requests/update-status/route.ts`, `app/api/activities/route.ts` | PI1.1/PI1.2 (complete, accurate, valid inputs) unmet at scale. Type coercion and unbounded fields reach Firestore writes. Many routes do ad-hoc manual checks, so this is under-coverage rather than total absence — but it is not systematically enforceable or auditable. | Introduce one `parseBody(schema, request)` helper; add a coverage gate mirroring `route-guard-coverage.test.ts` that fails when a mutating route has no schema. |
| **F-07** | CC6 | **P1** | **Login and signup pages ship with no Content-Security-Policy.** `middleware.ts:530` returns a bare `NextResponse.next()` for `/login*`, `/signup*` and `/api/session-login`, skipping `withSecurityHeaders()` and the per-request nonce. CSP is emitted **only** by middleware — the static `next.config.js` header block carries no CSP. `/signup` is additionally absent from the matcher. | `middleware.ts:524-531`; matcher `middleware.ts:773-821`; static headers `next.config.js:86-104` | The two pages where credentials are typed are the only pages with no CSP. An injected script on the login page is unconstrained. Other headers (HSTS, XFO, XCTO, Referrer-Policy, Permissions-Policy, COOP, CORP) still apply via `next.config.js`. | Return `applyRateHeaders(pathname, NextResponse.next({request:{headers:requestHeaders}}), rateContext, nonce)` instead of the bare `next()`; add `/signup/:path*` to the matcher. |
| **F-08** | CC7 | **P1** | **12 high-severity production dependency vulnerabilities ship.** CI blocks only on `critical`; the `high` gate is `continue-on-error: true`. | `npm audit --omit=dev`: 0 critical / **12 high** / 39 moderate. High: `next` (14.2.35 — Image Optimizer DoS), `sharp`, `postcss`, `undici`, `nanoid`, `brace-expansion`, `fast-uri`, `fast-xml-parser`, `rollup`, `@sentry/nextjs`, `playwright`, `@playwright/test`. Gate at `.github/workflows/test.yml:76-81` | CC7.1 requires vulnerabilities be identified *and remediated*. A known-vulnerable `next` in production is the material one. `docs/security/dependency-triage.md` exists, showing triage is intended, but the gate is non-blocking. | Set an SLA for `high`, flip `continue-on-error` to `false` once the backlog clears. `next` and `sharp` require a semver-major upgrade — plan it. |
| **F-09** | PI1 | **P2** | **Billing state written outside the canonical writer.** `applySubscriptionState` is documented as the single writer, and `app/api/super_admin/payments/route.ts:167` asserts billing status "is written only by applySubscriptionState from a Stripe webhook". The `trial-emails` cron writes `billingStatus`, `subscriptionState`, `plan` and `modules` directly on the tenant doc in two places. | `app/api/cron/trial-emails/route.ts:184-193` and `:206-215`; canonical writer `lib/billing/apply-subscription-state.ts:164`; false invariant at `app/api/super_admin/payments/route.ts:167` | These transitions (`past_due`, `canceled`, hard-lock) bypass the append-only transition audit record at `lib/billing/apply-subscription-state.ts:12`. Billing state changes with no ledger entry; the documented invariant is untrue, so an auditor relying on it is misled. | Route both writes through `applySubscriptionState`. |
| **F-10** | PI1 | **P2** | **Non-Stripe webhooks have no idempotency protection.** Calendly, DocuSign and Twilio webhooks verify signatures correctly but never claim the event — no reference to `processed_webhook_events` or any dedupe. | `app/api/integrations/calendly/webhook/route.ts:47-58`; `app/api/integrations/docusign/webhook/route.ts:38-41`; `app/api/integrations/twilio/webhook/route.ts:23-31`; ledger used only by the 3 Stripe routes (`lib/stripe/webhook-idempotency.ts:22`) | A duplicated or replayed delivery re-applies side effects. Lower blast radius than billing, but the same class of defect the Stripe path explicitly solved. | Reuse `claimWebhookEvent`/`finalizeWebhookEvent`/`releaseWebhookEvent` keyed on each provider's event id. |
| **F-11** | CC8 | **P2** | **`next.config.js` disables type and lint checking during builds.** `eslint.ignoreDuringBuilds: true` and `typescript.ignoreBuildErrors: true`. | `next.config.js:30-31` | Deviates from the CC8 expectation that the build enforces its own gates. **Substantially mitigated:** `.github/workflows/test.yml:33-39` runs `next lint` and `tsc --noEmit` as required steps on the same commit before `npm run build`, and `__tests__/config/build-gates.test.ts` (verified passing) pins that CI still runs both, so the flags cannot silently become a blind spot. Documented with rationale at `next.config.js:20-29` (Vercel 45-min build ceiling). | Accept with the compensating control documented, or move type-checking to a dedicated Vercel build step. Ensure branch protection makes Quality Gates required (F-14). |
| **F-12** | C1 | **P2** | **Sentry client sends user email.** `Sentry.setUser({id, email})` transmits PII to a subprocessor, contradicting the `sendDefaultPii: false` posture set server-side and the `beforeSend` scrubbing. | `sentry.client.config.js:51-54`; server posture at `sentry.server.config.js:11` | PII leaves the system boundary to a third party. Requires disclosure in the subprocessor list and DPA (neither exists — F-15). | Send `id` only, or gate email behind an explicit consent flag. |
| **F-13** | CC6 | **P2** | **Broad CSRF exemption list.** The CSRF check (`x-requested-with: XMLHttpRequest`) is skipped for `/api/auth/*`, `/api/signup`, `/api/create-user`, `/api/logout`, `/api/ingest/*`, `/api/public/*`, `/api/cron/*`, and public Stripe paths. `/api/create-user` is a state-changing account-creation endpoint. | `middleware.ts:312-330`; check at `middleware.ts:466-478` | Defense-in-depth gap. **Materially mitigated** by `sameSite:'lax'` on all session cookies (`app/api/session-login/route.ts:48,72,101`), which blocks cross-site POST cookie transmission. Not independently exploitable. | Narrow the exemption; adopt an Origin/Referer check for form-posted routes that cannot send a custom header. |
| **F-14** | CC8 | **P2** | **Branch protection cannot be verified from the repository.** | Not evidenceable in-repo — settings live in GitHub. | Without required status checks on `main`, every CI gate in `test.yml` is advisory. This is the single highest-leverage unverified control, because all of CC8's technical strength depends on it. | **MANUAL-VERIFICATION-REQUIRED.** Export branch-protection settings and required-reviewer config as auditor evidence. |
| **F-15** | CC9, P6 | **P2** | **No subprocessor list and no DPA records.** The product transmits data to Stripe, Resend, Firebase/Google, Vercel, Upstash, Uploadcare and Sentry. No inventory exists. | Repo-wide search for `subprocessor`/`sub-processor` returns only `docs/audits/v37/01-verified-findings.md` (an audit note, not a register). Integrations confirmed in `package.json` dependencies. | CC9.2 and Privacy P6 require a maintained subprocessor inventory with DPAs. Blocks attestation on the vendor-management criterion. | Create `docs/compliance/subprocessors.md` listing each vendor, data categories, region and DPA link. |
| **F-16** | P4 | **P2** | **No documented data-classification or retention schedule.** The mechanism exists (`complianceRetentionPolicies`, `lib/backup/backup-registry.ts` classifies collections as durable/audit/ephemeral) but no human-readable policy states retention periods per data category. | `lib/backup/backup-registry.ts:6,138`; no policy doc found under `docs/` | Privacy P4 requires a documented retention schedule. Compounded by F-03, which means the enforcement path is broken as well. | Publish `docs/compliance/data-retention-policy.md` derived from the existing registry. |
| **F-17** | CC6 | **P3** | **Logout sets a `Domain` attribute the cookies were never set with.** `session-login` sets `lac_session` host-only (no `domain`); `logout` clears it with `domain: .example.com`. A host-only cookie is not cleared by a domain-scoped `Set-Cookie`. | Set at `app/api/session-login/route.ts:44-50`; cleared at `app/api/logout/route.ts:46-55` with `getCookieDomain` (`:10-15`) | Cosmetic only. **Not exploitable:** `invalidateSession` revokes the session server-side in the `sessions` ledger before responding (`app/api/logout/route.ts:38`; `lib/auth/session.ts:197-209`), so a stale cookie fails `validateSession`. | Drop the `domain` option to match how the cookie is set. |
| **F-18** | CC2 | **P3** | **Stale/inaccurate control documentation.** (a) `PUBLIC_ROUTES['invoices/search']` is justified as "Public invoice lookup by unguessable token"; the route is actually a 308 redirect to a guarded endpoint. (b) `middleware.ts:353` states "enforced CSP stays permissive" — superseded by S27, which enforces the strict nonce CSP by default. (c) `app/layout.tsx:45` says the strict CSP is "Report-Only today". | (a) `lib/api/route-contract.ts:149` vs. `app/api/invoices/search/route.ts:6-16`; (b) `middleware.ts:351-353` vs. `lib/security/headers.ts:116-119`; (c) `app/layout.tsx:45` | The `PUBLIC_ROUTES` justifications are the intended evidence pack for the public attack surface. Stale entries mislead an auditor about what a control does. No security impact. | Correct the three comments. |
| **F-19** | C1 | **P3** | **Legacy plaintext BYOK keys tolerated at rest.** `decryptApiKey` returns non-prefixed values as-is, so keys written before AI-0a remain plaintext in Firestore until re-saved. | `lib/ai/byok-crypto.ts:56-59` | Documented, deliberate back-compat. Unknown number of tenants still hold plaintext provider keys. | Run a one-off migration to re-encrypt, then remove the fallback. |
| **F-20** | C1 | **P3** | **Tenant identifier written to application logs.** `console.log('[CRON] Processing tenant ${tenantId}')`. | `app/api/cron/generate-invoices/route.ts:107` | Low. The full PII-in-logs sweep returned only 4 hits and the other 3 log invoice/order numbers, not personal data — log hygiene is otherwise strong. | Drop the identifier or move to structured logging with a redaction layer. |
| **F-21** | CC6 | **P3** | **`style-src 'unsafe-inline'` in both CSP policies**, and the permissive fallback policy (`script-src 'unsafe-inline'`) applies on any nonce-less response. Enforcement is also disableable at runtime via `CSP_ENFORCE=off`. | `lib/security/headers.ts:77` (strict), `:21` (fallback), fallback selected at `:145-152`, kill switch at `:116-119` | Standard trade-off for Tailwind/CSS-in-JS; low risk. The kill switch means enforcement state is environment-dependent and **not verifiable from the repository**. | Move to hashed or nonced styles long-term. Confirm `CSP_ENFORCE` is unset in production as auditor evidence. |

### 4a. Twenty highest-risk mutating routes with no audit-log entry

Ordered as the brief directs — billing, roles, users, finance, tenant settings, data export/delete first.

| # | Route | Why it matters |
|---|---|---|
| 1 | `app/api/compliance/delete-data/route.ts` | Erasure of user data (also F-02) |
| 2 | `app/api/compliance/export-data/route.ts` | Bulk PII export (also F-01) |
| 3 | `app/api/admin/settings/api-key/route.ts` | Issues/rotates tenant API credentials |
| 4 | `app/api/admin/settings/security/route.ts` | Changes tenant security posture |
| 5 | `app/api/admin/quotas/route.ts` | Cross-tenant quota writes |
| 6 | `app/api/admin/finance/payroll/run/route.ts` | Executes payroll |
| 7 | `app/api/admin/finance/payroll/update/route.ts` | Alters payroll records |
| 8 | `app/api/admin/finance/payroll/delete/route.ts` | Destroys payroll records |
| 9 | `app/api/admin/finance/invoices/delete/route.ts` | Removes invoices from AR |
| 10 | `app/api/admin/finance/budgets/route.ts` | Budget mutation |
| 11 | `app/api/admin/finance/tax-rates/route.ts` | Tax configuration |
| 12 | `app/api/admin/settings/finance/route.ts` | Finance module configuration |
| 13 | `app/api/admin/settings/integrations/route.ts` | Third-party data egress config |
| 14 | `app/api/admin/settings/email-provider/route.ts` | Outbound mail credentials |
| 15 | `app/api/admin/settings/ai-workforce/route.ts` | BYOK provider keys |
| 16 | `app/api/admin/settings/notifications/route.ts` | Notification routing |
| 17 | `app/api/admin/settings/sales/route.ts` | Sales module configuration |
| 18 | `app/api/admin/files/delete/route.ts` | Destroys stored documents |
| 19 | `app/api/admin/hr/documents/delete/route.ts` | Destroys HR documents (PII) |
| 20 | `app/api/admin/hr/settings/route.ts` | HR module configuration |

---

## 5. Passing Controls — Auditor Evidence Pack

| Criterion | Control | Evidence (path:line) |
|---|---|---|
| CC6.1 | **Every one of 658 API routes is classified into exactly one enforced auth contract; zero unclassified.** Verified by execution: `tenant_scoped` 534, `public` 42, `super_admin` 36, `authenticated` 15, `cron` 12, `internal` 10, `webhook` 9. | `lib/api/route-contract.ts:259-288`; gate `__tests__/api/route-guard-coverage.test.ts:64-75` (**passing**) |
| CC6.1 | Unclassifiable route fails the build; a new public route requires a written justification in the same PR. | `__tests__/api/route-guard-coverage.test.ts:66-74`, `:104-109` |
| CC6.1 | Public attack surface cannot grow silently — `public` count is pinned to reviewed `PUBLIC_ROUTES` entries (42 = 42, at the cap). | `__tests__/api/route-guard-coverage.test.ts:117-122`; `lib/api/route-contract.ts:105-159` |
| CC6.1 | Stale `PUBLIC_ROUTES` / `AUTHENTICATED_ROUTES` entries fail the build. | `__tests__/api/route-guard-coverage.test.ts:111-115`, `:161-165` |
| CC6.2 | Every `super_admin/*` route proven to call `requireSuperAdmin`; a missing guard returns `null` and fails the gate. | `lib/api/route-contract.ts:273-276`; `__tests__/api/route-guard-coverage.test.ts:82-87` |
| CC6.3 | **Tenant-scope trust boundary enforced by machine gate.** Zero routes read a request-supplied `tenantId` outside the 7 reviewed exceptions in `REQUEST_TENANT_ROUTES` (verified by execution). | `lib/api/route-contract.ts:206-247`; verified: 0 unreviewed |
| CC6.3 | An authenticated route without tenant scoping must be individually justified or the build fails. | `lib/api/route-contract.ts:169-193`; `__tests__/api/route-guard-coverage.test.ts:134-152` |
| CC6.1 | **Custom claims integrity: all 8 `setCustomUserClaims` call sites set BOTH `role` and `tenantId`.** No partial-claim writes. | `app/api/admin/users/create/route.ts:161`; `app/api/hr/employees/create/route.ts:137`; `app/api/super_admin/users/route.ts:68`; `app/api/super_admin/repair-claims/route.ts:40-44`; `app/api/create-user/route.ts:63`; `app/api/signup/route.ts:186-189`; `app/api/client/invites/complete/route.ts:110`; `lib/demo/seed.ts:111` |
| CC6.1 | Session cookie is `httpOnly`, `secure` in production, `sameSite:'lax'`, bounded `maxAge`, scoped `path:'/'`. | `app/api/session-login/route.ts:44-50` |
| CC6.1 | **Server-side session revocation ledger.** Token stored as SHA-256 hash as the doc id; `active` flag, absolute expiry, idle timeout, concurrent-session cap, cache invalidation on revoke. | `lib/auth/session.ts:39-41`, `:119-169`, `:197-209`, `:227-252`, `:305-341` |
| CC6.1 | Login verifies the Firebase token with `checkRevoked=true`; session ledger write is fail-closed before the cookie is issued. | `app/api/session-login/route.ts:17`, `:28-40` |
| CC6.1 | Logout revokes the session server-side and clears all three cookies. | `app/api/logout/route.ts:37-39`, `:46-75` |
| CC6.6 | **`firestore.rules` is version-controlled and default-deny** — terminal `match /{document=**} { allow read, write: if false; }`. Client-SDK reads limited to own user doc, own notifications, own tenant doc, and the activity feed; all writes server-only. | `firestore.rules:80-83`, `:52-55`, `:73-78`, `:23-26`, `:40-43`, `:47-49` |
| CC8.1 | Rules changes are deployed by CI, not by hand, behind a guard test and a no-race concurrency group. Storage rules are deployed alongside. | `.github/workflows/deploy-rules.yml:9-14`, `:32-40`, `:47-52` |
| CC6.1 | **API keys stored as SHA-256 hashes, never plaintext**; plaintext returned exactly once at creation. | `lib/ingest/api-keys.ts:48-50`, `:70-104` |
| CC6.1 | **Constant-time key comparison** with a length guard before `timingSafeEqual` (avoiding the throw-as-oracle). | `lib/ingest/api-keys.ts:59-62`; mirrored `lib/ingest/auth.ts:30-33`; internal secrets `lib/api/internal-secret.ts:36-38` |
| CC6.1 | **Zero-downtime key rotation** (multi-key subcollection) plus `lastUsedAt` tracking so an idle key can be revoked with evidence. | `lib/ingest/api-keys.ts:15-17`, `:29-46`, `:171-182` |
| CC6.1 | Ingest credentials accepted from the `x-api-key` **header only** — never query string or body — with no global shared-key fallback. | `lib/ingest/auth.ts:41-57` |
| CC6.1 | **No secrets in source.** Repo-wide scan for `sk_live_`/`sk_test_`/`AIza…`/private keys/`re_…`/`xoxb-` returns one hit: a placeholder in `.env.example`. Only `.env.example` is tracked; `.gitignore` excludes `.env*`. | `.env.example:18` (placeholder `re_xxxxxxxxxxxxxxxxxxxx`); `.gitignore:33-35` |
| CC6.3 | **Canonical 11-role definition** and a single path→roles authorization map enforced at the middleware edge. | `lib/erpAccess.ts:1-13` (`ERP_ROLES`), `:81-116` (`rolesAllowedForApi`) |
| CC6.3 | Fine-grained RBAC engine with module/entity scoping, field-level access and `ownOnly` constraints. | `lib/permissions/permission-engine.ts:30-80` |
| CC6.7 | **Rate limiting applied to every `/api/*` request at the edge**, before auth — covering login, OTP request/verify, signup, password reset and API-key routes — with tenant quotas and throttle exceptions. | `middleware.ts:409-464`; config `lib/rate-limit/config.ts:9-63`; additional per-route strict limit `app/api/logout/route.ts:19` |
| CC6.6 | Path-traversal/encoded-traversal requests blocked at the edge. | `middleware.ts:193-202`, `:381-399` |
| CC7.2 | **Sentry: DSN from env, `sendDefaultPii:false`, `beforeSend` strips cookies, headers and body** across client, server and edge runtimes. | `sentry.server.config.js:6-19`; `sentry.edge.config.js:6-18`; `sentry.client.config.js:32-39` |
| CC7.2 | **Server-side error capture** wired via the Next.js instrumentation hook, not client-only. | `instrumentation.ts:18` (`onRequestError = Sentry.captureRequestError`) |
| CC7.1 | Boot-critical environment validated at server startup, failing fast before any request. `CRON_SECRET` is required and rejects the placeholder value. | `instrumentation.ts:4-9`; `lib/env.ts:57-61` |
| C1 | **Log hygiene: only 4 `console.*` calls across `app/` and `lib/` reference any PII-adjacent term**, and 3 of those log invoice/order numbers rather than personal data. | Sweep over `app/`, `lib/`; sole identifier hit `app/api/cron/generate-invoices/route.ts:107` (F-20) |
| A1.2 | **Backups read the real top-level collections** (correcting a prior subcollection defect), grouped per tenant per collection. | `app/api/cron/backup/route.ts:13-32`, `:147-210` |
| A1.2 | **Backup integrity: per-file SHA-256 checksums recorded in a manifest** with record counts. | `app/api/cron/backup/route.ts:58-68`, `:210` |
| A1.2 | **Tested restore path that verifies each checksum before writing**, plus a `dryRun` mode. | `lib/backup/restore.ts:113-146`, esp. `:141-146` (checksum mismatch aborts) |
| A1.2 | **Backup bucket from env with no hardcoded fallback** — explicitly documented as a deliberate property. | `lib/storage/bucket.ts:16`, `:18-24`; `lib/backup/backup-bucket.ts:2-8` |
| A1.2 | Backup failures dead-letter to `dead_letter_backups` and alert by email, so a silently failing nightly backup cannot go unnoticed. Retention pruning bounds storage growth. | `app/api/cron/backup/route.ts:28-31`, `:75-95`, `:42-45` |
| A1.2 | Backup coverage cannot silently regress — a classification registry plus a drift test fails CI when a new top-level collection is unclassified. | `lib/backup/backup-registry.ts:6-10`, `:138`; `app/api/cron/backup/route.ts:34-38` |
| A1.3 | **DR runbook documenting RPO/RTO and a witnessed restore drill**, pinned against the real code by a test so it cannot drift. | `docs/runbooks/disaster-recovery.md`; `__tests__/docs/dr-runbook.test.ts:16-45` |
| A1.1 | Load-test suite across 6 scenarios with retained artifacts. | `.github/workflows/load-test.yml:9-56`; `tests/load/*.js` |
| CC7.1 | **Cron schedule hygiene: all 10 scheduled crons run at most once per day** — no Vercel Hobby deploy rejection risk. | `vercel.json:2-46` (`0 0 * * *`, `0 10 * * *`, `0 9 * * *`, `0 1 1 * *`, `0 2 1 * *`, `0 3 1 * *`, `0 12 * * *`, `30 12 * * *`, `0 2 * * *`, `30 9 * * *`) |
| CC6.1 | 8 of 12 cron routes require `Bearer ${CRON_SECRET}` unconditionally; a cron route with no secret verification fails the route-contract gate. | `app/api/cron/quickbooks-sync/route.ts:9-18`; `app/api/cron/xero-sync/route.ts:9-18`; gate `lib/api/route-contract.ts:260-264` |
| CC2.2 | Security policy, architecture docs, DR runbook, observability doc and generated API reference are version-controlled. | `docs/SECURITY.md`; `docs/ARCHITECTURE.md`; `docs/runbooks/disaster-recovery.md`; `docs/observability.md`; `docs/api/openapi.yaml` |
| CC8.1 | **CI gates on PR and on push to main:** OpenAPI drift, Firestore-schema drift, format check, lint, typecheck, tests with coverage threshold, tests under a non-UTC timezone, build, bundle size, license compliance, critical-severity dependency audit. | `.github/workflows/test.yml:8-81` |
| CC8.1 | **No gate is conditionally skipped, and no job-level `if:` references the `secrets` context** — the previously invalid `sonar` job gate was moved to step level, where `env` is valid. | `.github/workflows/test.yml:83-95` (documented fix), step gates `:104`, `:108` |
| CC8.1 | **`package-lock.json` is tracked and CI installs with `npm ci`**, not `npm install`, in every workflow that installs dependencies. | tracked lockfile; `.github/workflows/test.yml:24`, `:97`; `deploy-rules.yml:30`; `smoke.yml:23` |
| CC8.1 | Pre-commit hooks enforce lint (`--max-warnings=0`) and formatting. | `package.json` `lint-staged`; `.husky/` |
| PI1.1 | **All 3 Stripe webhooks verify the provider signature before any processing**, failing closed on an unverifiable signature. | `app/api/stripe/webhook/route.ts:250-258`; `app/api/stripe/subscription-webhook/route.ts:127-152`; `app/api/stripe/connect/webhook/route.ts:40-52` |
| PI1.1 | **Atomic webhook idempotency claimed BEFORE side effects** via Firestore `create()`, closing the read-then-write race that could double-apply money movement. Claim released on failure so Stripe retries. | `lib/stripe/webhook-idempotency.ts:3-46`, `:60-69`; ordering `app/api/stripe/webhook/route.ts:258` → `:266`; `subscription-webhook:149` → `:155`; `connect/webhook:50` → `:56` |
| PI1.2 | Deprecated webhook endpoints return `410 Gone` unconditionally with no data access. | `app/api/webhooks/stripe/route.ts:6`; `app/api/payments/webhooks/route.ts:6`; `app/api/billing/webhook/route.ts:15` |
| PI1.2 | **Append-only finance ledger by contract**, with a transactional wrapper guaranteeing no financial state changes without a ledger entry. | `lib/finance/ledger.ts:7-12`, `:85`, `:104` |
| PI1.2 | **Paid invoices are immutable**; corrections are recorded as separate credit notes, and the ledger entry is written *first* so a reversal can never exist without its entry. | `app/api/finance/credit-notes/create/route.ts:15`, `:86`; `app/api/finance/invoices/update/route.ts:374`; `app/api/admin/finance/invoices/update/route.ts:463` |
| C1.1 | **AES-256-GCM encryption at rest for BYOK provider keys: fresh random 12-byte IV per encryption, auth tag stored and verified on decrypt, key sourced from env, key length validated to exactly 32 bytes.** No ECB, no unauthenticated CBC. | `lib/ai/byok-crypto.ts:21-34` (key source + length validation), `:41-48` (random IV, tag stored), `:56-67` (tag verified) |
| C1.1 | The same AES-256-GCM construction is applied consistently to all integration OAuth tokens. | `lib/integrations/google-auth.ts:68-82`; `slack.ts:73-86`; `mailchimp.ts:99-113`; `calendly.ts`, `microsoft-auth.ts`, `quickbooks.ts`, `xero.ts`, `docusign.ts` |
| P2, P3 | **Public lead ingest enforces content-type, bounds body size to 64 KB, records explicit consent, and validates attribution to a known field set.** | `app/api/ingest/leads/route.ts:101-105` (content-type), `:61`+`:112` (64 KB cap), `:146`+`:241` (consent), `:145`+`:233-238` (attribution); consent parser `lib/ingest/lead-intake.ts:115-130` |
| P2 | Consent capture is conservative — a malformed `agreedAt` is dropped entirely rather than stored, so a record never looks like evidence it is not. | `lib/ingest/lead-intake.ts:126-128` |
| PI1.1 | Lead ingest is exactly-once for callers sending `Idempotency-Key`, claimed via `create()`. | `app/api/ingest/leads/route.ts:15-32` |
| P2 | Signup records terms acceptance with version, timestamp and client IP. | `app/api/signup/route.ts:198-201` |
| CC6.6 | **Strict nonce-based CSP is ENFORCED by default** (`'strict-dynamic'`, no `'unsafe-inline'` in `script-src`), promoted from Report-Only after an observation window, and still emitted Report-Only for continued violation telemetry. | `lib/security/headers.ts:56-90` (strict policy), `:93-119` (enforcement rationale + default-on), `:134-144` (applied) |
| CC6.6 | **All six required security headers present with strong values**, mirrored between middleware and static config with a parity test. Values: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`; `X-Frame-Options: DENY` + `frame-ancestors 'none'`; `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`; `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com"), usb=(), fullscreen=()`; plus COOP, CORP, `X-DNS-Prefetch-Control: off`. | `lib/security/headers.ts:121-132`; `next.config.js:86-104`; parity gate `__tests__/config/security-headers-parity.test.ts` (**passing**) |
| CC6.6 | CSP violations are collected to an in-app report sink. | `lib/security/headers.ts:38`; `app/api/security/csp-report/route.ts` |
| CC6.6 | **No `eval()` or `new Function()` anywhere in `app/` or `lib/`.** | Repo-wide grep: zero hits |
| CC6.6 | **All 4 `dangerouslySetInnerHTML` sinks are safe.** Two sanitize with DOMPurify; one is a nonce'd static theme script with no interpolation; one serializes static structured data. | `app/admin/settings/email-templates/page.tsx:437`, `:452` (DOMPurify); `app/layout.tsx:51-56` (nonce'd, static); `app/pricing/page.tsx:91` (static JSON) |
| CC6.1 | Versioned `/api/v1` and `/api/v2` proxies re-dispatch through the full middleware and target-route auth stack — no auth bypass. | `app/api/v1/[[...path]]/route.ts:9-13`; `lib/api/versioning.ts:55-84` |
| CC4.1 | Per-request usage logging (endpoint, tenant, user, IP, method, status, latency, rate-limit rule) for API traffic. | `middleware.ts:439-453`, `:549-563` |
| CC3.2 | Dependency triage is a documented, tracked activity. | `docs/security/dependency-triage.md` |
| CC5.2 | 190 test files including config/guard suites that encode security invariants as build gates. Verified run: **7 suites / 70 tests passing**. | `__tests__/config/`, `__tests__/api/route-guard-coverage.test.ts` |

---

## 6. Organizational Controls Not Evidenceable In Code

A SOC 2 engagement examines the organization, not only the codebase. The following are required by
the TSC and **cannot be demonstrated from this repository**. This list is what an auditor will ask
for in week one.

| # | Control an auditor will require | TSC ref | Status |
|---|---|---|---|
| 1 | **Security policy set** — information security, acceptable use, access control, cryptography, secure SDLC, data classification, incident response policies, formally approved and annually reviewed | CC1.1, CC5.3 | **PARTIAL** — `docs/SECURITY.md` (71 lines) and a DR runbook (74 lines) exist; both are engineering documents, not approved policies with owners, version history and review dates |
| 2 | **Periodic user access reviews** — evidence that entitlements are recertified on a defined cadence | CC6.2, CC6.3 | **NOT STARTED** — no review records or tooling in-repo |
| 3 | **Onboarding / offboarding procedures** — provisioning and timely deprovisioning, with tickets as evidence | CC6.2 | **NOT STARTED** — the technical primitives exist (invitation flows, `revokeRefreshTokens`, session invalidation), the documented process and records do not |
| 4 | **Security awareness training** — completion records for all personnel | CC1.4, CC2.2 | **NOT STARTED** |
| 5 | **Vendor / subprocessor management** — inventory, DPAs, annual vendor risk reviews for Stripe, Resend, Firebase/Google, Vercel, Upstash, Uploadcare, Sentry, Anthropic | CC9.2, P6.1 | **NOT STARTED** — see F-15 |
| 6 | **Penetration test** — independent test report with tracked remediation | CC4.1, CC7.1 | **NOT STARTED** — no report in-repo |
| 7 | **Risk register** — identified risks with likelihood, impact, owner and treatment | CC3.1–CC3.4 | **PARTIAL** — `docs/audits/v37/` and `docs/security/dependency-triage.md` show real risk-identification practice, but there is no maintained register |
| 8 | **BCP / DR test results** — evidence a restore was actually performed and timed | A1.3 | **PARTIAL** — strongest item on this list: the runbook documents RPO/RTO and a *witnessed restore drill*, pinned by `__tests__/docs/dr-runbook.test.ts:24-28`. An auditor will still want the signed drill record with dates and participants |
| 9 | **Board / management oversight** — governance meeting minutes, defined security ownership | CC1.2, CC1.3 | **UNKNOWN** — not evidenceable in a repository |
| 10 | **Change-approval records** — PR review requirements, required status checks, segregation of duties | CC8.1 | **UNKNOWN / MANUAL-VERIFICATION-REQUIRED** — CI gates are strong (`test.yml`), but branch protection and required reviewers live in GitHub settings (F-14). All CC8 technical strength is advisory until this is confirmed |
| 11 | **Incident response records** — declared incidents, timelines, post-mortems, on-call rotation | CC7.3–CC7.5 | **PARTIAL** — `docs/SECURITY.md` and the DR runbook exist; no incident log, on-call schedule or post-mortem record |
| 12 | **CPA attestation engagement** — an engaged, independent, licensed CPA firm; without it no SOC 2 or SOC 3 report exists regardless of control quality | — | **NOT STARTED** |
| 13 | **System description** — the narrative Section III of a SOC 2 report | — | **PARTIAL** — `docs/ARCHITECTURE.md` is raw material, not a system description |
| 14 | **Data classification & retention schedule** — documented categories and retention periods | P4.1–P4.3 | **NOT STARTED** — see F-16 (mechanism exists, policy does not, and F-03 shows enforcement is broken) |

---

## 7. Remediation Backlog

Ordered by priority. **Each package touches no more than 10 files.** No code is written here.

### WP-1 — Close the cross-tenant privacy boundary (P0) — 3 files
Blocks attestation; fix before anything else. Add a subject-ownership check resolving the
subject's `tenantId` and rejecting mismatches before any read or write, and add `tenantId`
filters to the six collection queries in `collectUserData`.
- `lib/compliance/data-retention.ts`
- `app/api/compliance/export-data/route.ts`
- `app/api/compliance/delete-data/route.ts`

### WP-2 — Regression tests for the tenant boundary — 2 files
No P0 fix is complete without a test that fails on the old behavior. Assert a tenant-A admin
requesting a tenant-B `subjectUserId` receives 403 for both export and delete.
- `__tests__/api/compliance-tenant-isolation.test.ts` *(new)*
- `__tests__/lib/compliance/data-retention.test.ts` *(new)*

### WP-3 — Repair retention cleanup (P1) — 3 files
Point `runRetentionCleanup` at top-level collections filtered by `tenantId`, mirroring the
already-corrected export path. Add a test that seeds an expired document and asserts deletion, so
the no-op cannot return.
- `lib/compliance/data-retention.ts`
- `app/api/cron/compliance-retention/route.ts`
- `__tests__/lib/compliance/retention-cleanup.test.ts` *(new)*

### WP-4 — Harden cron authentication (P1) — 6 files
Remove the `x-vercel-cron` short-circuit; require `Bearer ${CRON_SECRET}` unconditionally with a
constant-time comparison. Extract one shared `verifyCronRequest` helper rather than repeating the
check.
- `lib/api/cron-auth.ts` *(new)*
- `app/api/cron/backup/route.ts`
- `app/api/cron/trial-emails/route.ts`
- `app/api/cron/billing-locks/route.ts`
- `app/api/cron/abandoned-signups/route.ts`
- `__tests__/api/cron-auth.test.ts` *(new)*

### WP-5 — CSP on login and signup (P1) — 3 files
Apply security headers and the nonce to the login/signup branch; add `/signup/:path*` to the
matcher; extend the parity test to assert every matched path emits a CSP.
- `middleware.ts`
- `__tests__/config/security-headers-parity.test.ts`
- `app/layout.tsx` *(comment accuracy, F-18c)*

### WP-6 — Audit logging for the 20 highest-risk mutations (P1) — 10 files
Introduce a shared `withAuditLog` wrapper writing the entry in the same transaction as the
mutation, then apply it to the top of the Section 4a list.
- `lib/audit/with-audit-log.ts` *(new)*
- `app/api/admin/settings/api-key/route.ts`
- `app/api/admin/settings/security/route.ts`
- `app/api/admin/quotas/route.ts`
- `app/api/admin/finance/payroll/run/route.ts`
- `app/api/admin/finance/payroll/delete/route.ts`
- `app/api/admin/finance/invoices/delete/route.ts`
- `app/api/admin/files/delete/route.ts`
- `app/api/admin/hr/documents/delete/route.ts`
- `__tests__/api/audit-log-coverage.test.ts` *(new)*

### WP-7 — Audit logging, remaining high-risk routes (P1) — 10 files
Continue WP-6 across the rest of Section 4a, then raise the coverage gate's threshold.
- `app/api/compliance/export-data/route.ts`
- `app/api/compliance/delete-data/route.ts`
- `app/api/admin/finance/payroll/update/route.ts`
- `app/api/admin/finance/budgets/route.ts`
- `app/api/admin/finance/tax-rates/route.ts`
- `app/api/admin/settings/finance/route.ts`
- `app/api/admin/settings/integrations/route.ts`
- `app/api/admin/settings/email-provider/route.ts`
- `app/api/admin/settings/ai-workforce/route.ts`
- `app/api/admin/hr/settings/route.ts`

### WP-8 — Input-validation framework and gate (P1) — 4 files
One `parseBody(schema, request)` helper plus a coverage test modelled on
`route-guard-coverage.test.ts`, starting at the current 75 routes and ratcheting upward so the
figure can only improve.
- `lib/api/parse-body.ts` *(new)*
- `__tests__/api/input-validation-coverage.test.ts` *(new)*
- `lib/api/route-contract.ts` *(extend classifier with validation evidence)*
- `docs/architecture/api-route-contracts.md`

### WP-9 — Dependency remediation (P1) — 3 files
Clear the 12 highs. `next` and `sharp` need a semver-major upgrade and their own testing window;
schedule separately. Flip the `high` gate to blocking once clear.
- `package.json`
- `package-lock.json`
- `.github/workflows/test.yml`

### WP-10 — Processing-integrity cleanups (P2) — 5 files
Route `trial-emails` billing writes through `applySubscriptionState`; add idempotency claims to
the three non-Stripe webhooks.
- `app/api/cron/trial-emails/route.ts`
- `app/api/integrations/calendly/webhook/route.ts`
- `app/api/integrations/docusign/webhook/route.ts`
- `app/api/integrations/twilio/webhook/route.ts`
- `lib/webhooks/idempotency.ts` *(new — generalize `lib/stripe/webhook-idempotency.ts`)*

### WP-11 — Compliance documentation set (P2) — 5 files
The documents an auditor asks for first, and the cheapest items on this list to produce.
- `docs/compliance/subprocessors.md` *(new)*
- `docs/compliance/data-retention-policy.md` *(new)*
- `docs/compliance/data-classification.md` *(new)*
- `docs/compliance/incident-response.md` *(new)*
- `docs/compliance/access-review-procedure.md` *(new)*

### WP-12 — Hygiene and documentation accuracy (P2/P3) — 6 files
Sentry PII, logout cookie domain, tenant id in logs, and the three stale control comments that
would mislead an auditor reading the evidence pack.
- `sentry.client.config.js`
- `app/api/logout/route.ts`
- `app/api/cron/generate-invoices/route.ts`
- `lib/api/route-contract.ts` *(correct the `invoices/search` justification)*
- `middleware.ts` *(correct the stale "enforced CSP stays permissive" comment)*
- `lib/ai/byok-crypto.ts` *(plan removal of the plaintext fallback)*

### WP-13 — Manual verification (no files)
Not code. Capture as auditor evidence: GitHub branch-protection and required-status-check
settings (F-14); confirmation that `CSP_ENFORCE` is unset in production (F-21); confirmation of
whether the Vercel edge strips inbound `x-vercel-cron` headers (F-04); Vercel deployment
protection settings.

---

*This audit is a point-in-time static assessment of commit `38dfa163b9c5d7d437a54d64d76f34d6f3906be2`.
It is not a SOC 2 report and does not constitute an attestation. Only an independent licensed CPA
firm can issue a SOC 2 or SOC 3 report.*
