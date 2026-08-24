# Production dependency advisory triage

Status: **public-launch blocker**

Evidence date: 2026-08-24

Owner: platform/security

## Actual audit result

After non-breaking lockfile remediation and clean installation:

| Severity   |  Count |
| ---------- | -----: |
| Critical   |      0 |
| High       |      5 |
| Moderate   |     38 |
| Low / info |      0 |
| **Total**  | **43** |

The production graph's five high package nodes are `next`, `@sentry/nextjs`,
`rollup`, the nested Next/PostCSS graph and `undici`. Moderate nodes include the current
Firebase/Admin dependency chain, Sentry/OpenTelemetry, ExcelJS and UUID.

This document does not assert that a high advisory is harmless merely because a
known vector is build-time or Vercel-hosted. Reachability and platform
mitigations are inputs to triage, not substitutes for a supported upgrade. The
release remains blocked for public self-service while high advisories remain.

## Remediation completed here

- Applied only non-breaking lockfile updates; no `npm audit fix --force` was
  used.
- Upgraded test-only Playwright from 1.49.1 to 1.62.1.
- Upgraded the root PostCSS development dependency from 8.4.38 to 8.5.26; the
  remaining high PostCSS node is nested in the Next 14 graph.
- Reinstalled from the lockfile and reran TypeScript, lint, 2,039 tests,
  production build and license policy.
- Upgraded the independent marketing site to Next.js/eslint-config-next 16.3.2;
  its production audit now reports zero advisories.

## Why the remaining upgrade is separate

The ERP is on Next.js 14.2.35 and a large Sentry/Firebase graph. The available
remediation requires coordinated framework/runtime behavior changes rather than
a safe patch-only lock update. A forced major upgrade inside the security/
billing/cron release would invalidate too many assumptions without an isolated
browser environment.

Required dedicated sequence:

1. Upgrade Next and `eslint-config-next` together to a supported patched line;
   apply official codemods and review middleware, dynamic rendering, cache,
   image and build behavior.
2. Upgrade `@sentry/nextjs` and its OpenTelemetry/Rollup graph; verify server,
   edge/middleware and browser instrumentation plus source-map handling without
   exposing a token.
3. Upgrade Firebase and Firebase Admin to supported compatible lines; repeat
   Auth, emulator, tenant, Storage, query and webhook-adjacent tests.
4. Replace or upgrade ExcelJS/UUID paths as required by the final audit graph.
5. Run on Node 22: clean install, audit, formatting, lint, typecheck, both
   timezone test runs, production build, unchanged bundle/license gates and an
   isolated 11-role browser matrix.
6. Make the CI high-level audit blocking only when the high count is zero or a
   time-bounded owner acceptance explicitly documents each reachable risk.

Block level criterion: once the high count reaches zero (or a time-bounded owner
acceptance covers every remaining reachable advisory), change the CI audit
block level from critical to high. The current CI still blocks critical
advisories and reports high advisories as non-blocking so this draft PR can
expose the complete source remediation. This is a temporary containment, not a
launch waiver.
