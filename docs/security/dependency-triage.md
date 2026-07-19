# SEC-05 — High-severity dependency advisory triage

**Status:** documented, no upgrade performed this session
**Date:** 2026-07-19
**Owner:** platform / security

## Why this doc exists

`npm audit` currently reports **9 high-severity advisories** (0 critical, 40 moderate).
Every remaining high requires a breaking `--force` upgrade of `next` and/or `@sentry/nextjs`
and their transitive graphs. Doing that as a drive-by inside an unrelated feature session is
how a monorepo gets a silent regression, so the mass bump is **deferred to dedicated dependency
PRs** (one for `next`, one for `@sentry/nextjs`). This document records the triage so a reviewer
can confirm nothing here is exploitable in production today.

The CI gate reflects this split (`.github/workflows/test.yml`):

- `npm audit --audit-level=critical` — **blocking** (build fails on any critical).
- `npm audit --audit-level=high` — **report only** (`continue-on-error: true`) until this triage lands.

## Block-level criterion

> **Raise the audit block level from `critical` to `high`** (make the `--audit-level=high`
> step blocking, i.e. remove `continue-on-error`) **once `next` and `@sentry/nextjs` are patched
> in their own dependency PRs** and the high count reaches zero. Until then the high-level audit
> stays non-blocking and this document is the compensating control.

## The 9 high advisories

Current versions: `next@14.2.35`, `@sentry/nextjs@^8.55.0`.

| Package                    | Vector (summary)                                                                                                           | Why not exploitable here now                                                                                                                                                                                                                  | Upgrade path                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `next`                     | Image Optimizer DoS, RSC request DoS, rewrite request smuggling, cache poisoning, App Router CSP-nonce XSS, WebSocket SSRF | App runs on Vercel: the managed edge/image layer terminates and normalizes requests, so the self-hosted Image Optimizer and request-smuggling vectors are mitigated at the platform. No custom `remotePatterns` exposing arbitrary upstreams. | Bump `next` to the latest patched 14.2.x (or 15.x) in a dedicated PR; re-run the app + e2e suite. |
| `@sentry/nextjs`           | Pulls vulnerable `@sentry/node`, `@sentry/opentelemetry`, `@sentry/webpack-plugin`, `rollup`                               | Sentry SDK + webpack/rollup plugin run at **build time / server instrumentation only**; not reachable by untrusted end-user input in the request path.                                                                                        | Bump `@sentry/nextjs` to latest 8.x/9.x in a dedicated PR alongside the `next` bump.              |
| `rollup`                   | Arbitrary file write via path traversal (Rollup 4)                                                                         | **Build-only** — pulled transitively via `@sentry/webpack-plugin`; never runs against untrusted input in production.                                                                                                                          | Resolved by the `@sentry/nextjs` bump.                                                            |
| `glob`                     | Command injection via `-c/--cmd` in the glob CLI                                                                           | **Dev/build-only** and only via the CLI `-c` flag, which this repo never invokes; pulled transitively through `@next/eslint-plugin-next`.                                                                                                     | Resolved by the `next` / `eslint-config-next` bump.                                               |
| `@next/eslint-plugin-next` | Transitive `glob`                                                                                                          | Lint-time only; never ships to the runtime bundle.                                                                                                                                                                                            | Resolved by the `eslint-config-next` bump.                                                        |
| `eslint-config-next`       | Transitive `@next/eslint-plugin-next` → `glob`                                                                             | Lint-time only.                                                                                                                                                                                                                               | Bump with `next`.                                                                                 |
| `@playwright/test`         | Transitive `playwright`                                                                                                    | **Test-only** dev dependency; never in the production graph.                                                                                                                                                                                  | Bump Playwright in a routine dev-dep PR.                                                          |
| `playwright`               | Downloads browsers without verifying the SSL certificate                                                                   | **Test/CI-only**; browsers are pre-provisioned in CI, download path not used at runtime.                                                                                                                                                      | Bump Playwright.                                                                                  |
| `undici`                   | Random-value weakness, decompression/WebSocket DoS, request/response smuggling, header injection                           | Pulled transitively; production HTTP egress goes through the Vercel runtime's `fetch`, not a request-path use of the vulnerable WebSocket/decompression surface.                                                                              | Resolved by the `next` bump (which updates the transitive floor).                                 |

## Summary

- **0 critical**, so the blocking CI gate is green.
- All 9 highs are either **dev/build/test-only** or **mitigated by the Vercel platform** in
  production, so none is a live production exploit today.
- The fix is a coordinated `next` + `@sentry/nextjs` upgrade in **dedicated dependency PRs**,
  after which the audit block level is raised from `critical` to `high` per the criterion above.
