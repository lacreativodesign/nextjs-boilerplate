# Bizosto release gates

Evidence date: 2026-08-24. No merge or production deployment is authorized by
this document. Every assertion uses one of: `CODE READY`, `SANDBOX VERIFIED`,
`OWNER PENDING`, `LIVE VERIFIED`, or `BLOCKED`.

## Risk-weighted scorecard

| Domain                                      |  Weight | Historical Aug 14 | Pinned main | Release candidate |
| ------------------------------------------- | ------: | ----------------: | ----------: | ----------------: |
| Tenant isolation and application security   |      20 |                 — |           7 |                14 |
| Identity, signup, sessions, roles           |      10 |                 — |           5 |                 8 |
| Subscription and payments                   |      12 |                 — |           5 |                 8 |
| Firestore, Storage, indexes, data integrity |      12 |                 — |           5 |                 7 |
| Cron, email, backups, operations            |      12 |                 — |           3 |                 8 |
| CI/CD and release controls                  |      10 |                 — |           2 |                 7 |
| Automated QA and dependency posture         |      10 |                 — |           7 |                 7 |
| UI/UX, accessibility, responsiveness        |       8 |                 — |           5 |                 5 |
| Product, legal, operating evidence          |       6 |                 — |           3 |                 4 |
| **Total**                                   | **100** |            **29** |      **42** |            **68** |

The score measures source and evidence maturity; it does not override a
mandatory gate. The release candidate is **not controlled-beta ready and not
public-launch ready** while production and preview share Firebase, live rules,
indexes, Storage and Stripe are unverified, branch protection is absent, the ERP
production graph contains five high advisories, and no isolated browser/rules
environment exists.

## Verified source gates

| Gate                                                  | Result                          | Evidence                                                                      |
| ----------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| Build-time TypeScript and ESLint enforcement          | **CODE READY**                  | Next ignores removed; typecheck, lint and production build exit 0             |
| Exactly one daily Vercel cron                         | **CODE READY**                  | One `/api/cron/daily-orchestrator` entry at `0 2 * * *`; contract suites pass |
| Firebase project/bucket contract                      | **CODE READY**                  | Admin/client/expected/production boundaries fail closed in tests              |
| Signup, OTP, reserved tenant and demo mutation policy | **CODE READY**                  | Policy and negative suites pass; live signup remains disabled                 |
| Pending-checkout recovery                             | **CODE READY**                  | Only exact checkout/billing recovery routes are allowed                       |
| Tenant-bound Connect, invoice and refund integrity    | **CODE READY; SANDBOX PENDING** | Unit/contract tests pass; no Stripe sandbox credential was available          |
| Managed-file ACL and tenant-prefix download           | **CODE READY**                  | ACL suites pass; production Storage remains blocked                           |
| Closed-won activation and client-seat identity        | **CODE READY**                  | Idempotency, discount, tenant, currency and seat-limit tests pass             |
| Website lead relay and claim alignment                | **CODE READY**                  | 9 tests, lint, typecheck and 37-route build pass; audit is clean              |
| Full ERP test and build gate                          | **CODE READY**                  | 191 suites / 2,039 tests pass; 516-page build passes with 4 GB heap           |
| ERP dependency and bundle target                      | **BLOCKED**                     | 43 production advisories (5 high); bundle target still fails                  |

## Controlled-beta mandatory gates

- [ ] Separate preview/staging Firebase project is configured for browser SDK,
      Admin SDK, Auth, Firestore and Storage.
- [ ] Firestore and Storage authorization tests run against emulators, then the
      approved rules and all 161 composite indexes are verified in isolated
      staging.
- [x] Exactly one daily schedule and one authenticated, bounded orchestrator are
      present and source-tested.
- [x] Demo mutation, public signup, reserved tenants and unverified E2E targets
      fail closed in source.
- [ ] Stripe test products, all six prices, subscription lifecycle and Connect
      flows pass sandbox duplicate/delay/concurrency/refund scenarios.
- [ ] Legacy demo accounts and legacy client identities are inspected and
      remediated by the owner.
- [ ] ERP high dependency advisories are removed in a dedicated Next/Sentry/
      Firebase compatibility upgrade and the complete release suite passes.
- [ ] All eleven roles and three plans pass isolated browser, accessibility and
      responsive journeys.
- [ ] No P0 remains; each contained P1 has an owner, review date and beta limit.

## Public self-service gates

All controlled-beta gates plus:

- [ ] Both `main` branches are protected with required checks and review.
- [ ] Production Stripe products, six price mappings, webhook destinations and
      Connect capabilities are `LIVE VERIFIED`.
- [ ] Firebase billing/Storage, rules, indexes, monitoring and backup/restore are
      `LIVE VERIFIED`.
- [ ] Public signup and marketing ingestion abuse controls are verified with a
      shared/global rate-limit strategy and bounded load test.
- [ ] Production performance budgets, keyboard/screen-reader behavior, visual
      regressions and replacement product screenshots pass review.
- [ ] Legal counsel approves Terms, Privacy, DPA/retention, cookies,
      subprocessors and transaction-fee wording.

## Enterprise and investor-readiness gates

- [ ] SSO tenant discovery and intended provider sandboxes are certified.
- [ ] Auditable Super Admin overrides, impersonation and organization-wide
      session revocation are complete and tested.
- [ ] Backup RPO/RTO and an isolated restore drill have evidence.
- [ ] Provider/key ownership, rotation, vendor inventory, incident response and
      dependency remediation cadence have named owners.
- [ ] Stripe Connect tenant/account binding, eligible 0.5% fee, refunds,
      disputes and reconciliation are sandbox- and live-certified.
- [ ] Dangerous AI actions use an immutable, expiring, single-use approval
      envelope with approver separation and durable continuation.
