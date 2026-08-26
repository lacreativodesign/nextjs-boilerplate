# Bizosto threat model

Last reviewed: 2026-08-24. Scope includes the SaaS application, marketing lead
entry, Firebase, Vercel, GitHub, Stripe/Connect, email, files, integrations, AI,
and operational tooling.

## Assets and trust boundaries

Critical assets are authentication identities and custom claims, tenant and
client records, employee/HR data, contracts/files, financial and subscription
history, Stripe/Connect bindings, provider OAuth tokens, tenant BYOK keys,
email identities/outbox, audit logs, backups/exports, and production
configuration.

Primary boundaries:

- Browser ↔ Next.js middleware/API.
- Marketing origin ↔ application lead-ingest API.
- Auth/session claims ↔ Firestore resource ownership.
- Next.js Admin SDK ↔ Firebase (rules are bypassed).
- Public capability token/provider signature ↔ server-owned resource.
- Vercel environment ↔ Firebase project/service account.
- Tenant Stripe Connect account ↔ platform subscription Stripe account.
- Daily orchestrator ↔ individual job routes and durable execution records.
- GitHub workflow identity ↔ Firebase/Vercel deployment authority.

## Adversaries and failure modes

- Unauthenticated internet attacker abusing signup, OTP, invoice links,
  ingestion, webhooks, OAuth callbacks, support uploads, or monitoring endpoints.
- Authenticated external client attempting same-tenant internal or other-client
  access.
- Tenant employee escalating role, module, ownership, or cross-tenant access.
- Compromised tenant admin/API key/integration token.
- Malicious or duplicated provider webhook.
- Unsafe AI/tool instruction attempting a financial, deletion, outbound, or
  cross-tenant action without durable approval.
- Accidental operator error: wrong Firebase project, stale workflow credential,
  unsafe demo reset, bad index/rules deploy, or production test data.
- Availability failure: single daily cron budget, provider outage, missing
  index, stuck outbox/job, or incomplete backup.
- Supply-chain/CI attacker targeting dependencies, pull requests, unprotected
  branches, cached credentials, or deployment workflows.

## Required controls

| Threat                    | Preventive controls                                                                                                       | Detective/recovery controls                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Cross-tenant access       | Session-derived tenant, resource tenant/owner check, plan + role check, deny-by-default rules                             | Negative matrix, audit events, anomaly review                  |
| Environment crossover     | Expected/Admin/public/production project contract; preview must differ                                                    | Safe diagnostics, deployment metadata inspection               |
| Session/CSRF bypass       | No prefetch bypass; CSRF-aware mutation client; secure session cookies                                                    | Route-contract tests, auth event logs                          |
| Signup/OTP abuse          | Fail-closed owner switch, rate limit, single-use verified OTP, reserved tenant policy                                     | Signup funnel and security events without PII                  |
| Webhook forgery/replay    | Required signature, account/resource binding, event claim/idempotency                                                     | Dead letter, retry log, reconciliation                         |
| Financial corruption      | Server amount/currency/fee validation, atomic state + append-only ledger, explicit corrections                            | Reconciliation, deterministic ledger IDs, audit                |
| File disclosure           | Tenant prefix, MIME/magic/size validation, metadata ACL, short signed URL                                                 | Access audit, token/object inventory, quota alerts             |
| Demo/destructive mutation | Exact demo tenant, explicit flag, non-production project/emulator proof, confirmation phrase, unique external credentials | Owner inspection, mutation audit, disabled production accounts |
| AI/workflow unsafe action | In-process server binding, immutable run/action context, human approval; unsupported actions disabled                     | Approval audit, action result log, key rotation                |
| Secret disclosure         | Server-only variables, encryption keys, redacted diagnostics/logs, no values in PRs                                       | Secret scanning, rotation runbook, provider audit              |
| Cron partial failure      | One authenticated orchestrator, per-job daily lease, bounded retry, budget reservation, isolated results                  | Run/execution/lease collections; incomplete status alert       |
| CI/deploy compromise      | Protected branch, reviewed draft PR, Node-aligned gates, short-lived cloud identity                                       | Required checks, audit log, rollback pin                       |

## Non-negotiable invariants

1. `super_admin` is not a magic cross-project credential; cross-tenant actions
   are explicit and audited, and managed files remain tenant-bound.
2. Request tenant IDs and webhook metadata are never sufficient authority.
3. Missing configuration fails closed for authentication, project isolation,
   webhook verification, signup availability, cron authentication, and unsafe
   actions.
4. Posted finance history is never silently rewritten.
5. Immediate critical communication/payment state does not wait for daily cron.
6. “Queued,” “source exists,” and “workflow passed” do not mean externally
   delivered or live-deployed.

## Residual risks requiring owner action

The shared production/preview Firebase project, historical demo accounts,
legacy client claims, undeployed/unverified rules and indexes, Stripe/Storage
activation, ERP high dependency advisories, absent branch protection, global
marketing abuse limiting, full backup guarantee, provider sandbox certification,
and legal approval remain outside this source-only remediation. See the blocker
register and owner checklist.
