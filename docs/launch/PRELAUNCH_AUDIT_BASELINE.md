# Bizosto prelaunch audit baseline

Status: release candidate prepared; external launch gates remain blocked  
Evidence date: 2026-08-24  
Production-write policy: prohibited for this review

## Authoritative source baselines

| Surface           | Repository                            | Pinned `main` commit                       | Release branch                       |
| ----------------- | ------------------------------------- | ------------------------------------------ | ------------------------------------ |
| SaaS application  | `lacreativodesign/nextjs-boilerplate` | `f0d3ce4ba16c28bcb114fe01fa7054e6e3397d15` | `codex/release-readiness-2026-08-22` |
| Marketing website | `lacreativodesign/bizosto-website`    | `3608335e8a5ece2aef1befcae1e823a4e1187db1` | `codex/launch-alignment-2026-08-22`  |

The August 14, 2026 audit examined application commit
`38a096c34fc6924cf517ba69681cdc0a7f67299f` at 29/100. The later pinned main was
42/100. Findings were reproduced against the current source and runtime
evidence; neither historical report was treated as current truth.

## Deployment and safety baseline

- ERP Vercel project `prj_CHcNsgVwk8HnOXvRsETsCMEqomzF` uses Node 22.x;
  production deployment evidence included
  `dpl_FnUS1VkVE73RgHTodeB5zVfeTTHd` on `app.bizosto.com`.
- Website project `prj_HLD6aotNiW3ggkf2O397mUHo8gTF` was configured for Node
  24.x; source and CI now require Node 22.x. Owner must align the Vercel setting.
- Production and a preview both exposed Firebase client project
  `la-creativo-erp`; production Admin activity also resolved there. A distinct
  preview Admin service account could not be proven without exposing secrets.
- Therefore no deployed signup, OTP, seed/reset, import, migration, deletion,
  payment, refund, restore or other Firebase-writing browser flow was run.
- Both `main` branches were unprotected. The ERP had 25 open stale/diverged
  candidates and the website had two; none was merged or closed.

## Coverage

The generated ledger inventories **1,899** tracked plus release-addition paths:
**1,806** in the ERP tree and **93** in the website tree. It includes 659 ERP
API routes, 310 ERP pages/layouts, 144 ERP UI components, 268 ERP domain
services, 221 ERP tests, 31 website components and 18 website pages/layouts.
Binary, generated and dependency artifacts are inventoried with explicit
exclusions; they are not claimed as semantic source review.

## Historical findings already fixed on pinned main

The release preserves and re-verifies the durable transactional email outbox,
tenant-specific email provider settings, sender branding and Reply-To behavior,
API-key hardening, lead-ingest validation, additional checked-in indexes, email
and intake regression tests, append-only finance-ledger controls, Stripe event
claims, Storage path rules and fail-closed plan/module helpers.

## Reproduced and remediated on this release branch

- Removed the `x-middleware-prefetch` authentication bypass and made
  `pending_checkout` recovery route-specific.
- Added typed Firebase project and bucket boundaries, safe diagnostics, browser
  emulator binding and production-write guards for demo/E2E surfaces.
- Made public signup/OTP fail closed, blocked reserved tenants and removed the
  shared demo credential pattern.
- Repaired Node/build/Sonar/Firebase deployment workflows without deploying;
  Firebase deploys now use owner-approved target metadata and short-lived
  identity inputs.
- Consolidated ten schedules into one daily orchestrator with a central
  registry, per-job leases, idempotency, bounded retries/cursors, failure
  isolation, logs, budget-aware skips and honest owner-block records.
- Bound DocuSign and Stripe Connect events to server-owned resources; validated
  invoice amount/currency/client/account/fee; made public invoice attempts reuse
  a stable PaymentIntent and refunds idempotent.
- Centralized managed-file ACLs and tenant-prefix signed URLs, hardened chunk
  upload, and removed the active Uploadcare SDK path in favor of managed
  Firebase/Google Cloud Storage upload APIs.
- Bound client identities to tenant/client/role, enforced Starter's ten client
  portal seats, and centralized idempotent closed-won client/project/invite/
  notification activation with currency and discount approval rules.
- Removed the root-secret self-HTTP workflow mutation bus and disabled unsafe
  external actions that lack durable approval continuation.
- Replaced misleading UI stubs/toggles with working destinations or explicit
  beta limitations and deferred the PDF renderer until an export is requested.
- Replaced website Firebase Admin writes with a validated, CAPTCHA-protected,
  tenant API-key relay; aligned pricing/trial/fee claims, consent, headers,
  launch gating and accessibility; upgraded website Next.js to 16.3.2.

## Newly confirmed residual risks

- The ERP production dependency graph has 43 advisories: 38 moderate and 5
  high. No critical advisory is reported, but public launch is blocked pending
  a dedicated compatible Next/Sentry/Firebase upgrade.
- The bundle target fails: shared main is 205.14 KB against 200 KB and common
  shell routes remain approximately 378 KB in the current checker.
- Global ERP line/statement coverage is approximately 18%; high-risk focused
  modules have stronger floors, but broad route semantics are not proven.
- Legacy client Auth claims may not contain the new tenant/client binding and
  must be inventoried/migrated before client beta access.
- Marketing screenshots still display the legacy LA CREATIVO console and one
  finance image mixes payroll/USD/PKR concepts. Replacement must come from an
  isolated Bizosto tenant, not fabricated data.
- Website abuse limiting is process-local and cannot provide a global limit on
  horizontally scaled serverless instances.
- Organization-wide force logout, some finance report types/AR surfaces,
  durable dangerous-action continuation, autonomous queued integrations and a
  guaranteed daily backup remain incomplete or owner-blocked.

## Result

The verified release candidate is **68/100**, up from 29/100 historically and
42/100 on pinned main. It is a materially safer source candidate, but it is not
controlled-beta or public-launch ready until the P0 register is closed. No
production deployment, Firebase mutation, secret change, rule/index deployment
or branch-setting change was performed.
