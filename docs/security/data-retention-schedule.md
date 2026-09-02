# Data retention schedule

**Owner:** LA CREATIVO GROUP, LLC (Texas) trading as Bizosto
**Last reviewed:** September 2026
**Review cadence:** annually, and whenever a retention constant changes

SOC 2 (C1.2, P4.2) requires a documented retention schedule, and requires that what is
documented matches what the system does. Every period below is a constant in the codebase,
not an aspiration. `__tests__/config/compliance-docs.test.ts` reads those constants and
fails if this document drifts from them.

Where a category has **no** retention rule, that is stated plainly rather than omitted. An
undocumented indefinite retention is a finding; a documented one is a decision.

## Billing lifecycle

Source: `lib/billing/lifecycle-policy.ts`, `lib/billing/apply-subscription-state.ts`

| Event                              | Period                  | Behaviour                                                                                      |
| ---------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| Trial                              | 14 days                 | Cancel before the end of day 14 and nothing is charged                                         |
| Failed payment — grace             | 7 days                  | Full access continues while automatic retries run                                              |
| Failed payment — read-only         | from day 8              | Workspace becomes read-only                                                                    |
| Failed payment — hard lock         | from day 21             | Workspace is locked if the balance is still outstanding                                        |
| Failed payment — data retention    | 60 days after hard lock | `dataRetentionUntil` is stamped on the tenant. Data may be permanently deleted after this date |
| Voluntary or for-cause termination | 30 days                 | Read-only, then permanently deleted                                                            |

## Tenant-configured retention policies

Source: `lib/compliance/data-retention.ts`, `app/api/compliance/policies/route.ts`

A tenant admin may define retention policies with a period of **1 to 3650 days** against an
allowlisted entity type. The allowlist exists because `collectionPath` on a policy is a
free-form string; without it, a policy could be aimed at any collection in the database.

Eligible entity types: `audit_logs`, `invoices`, `expenses`, `projects`, `tasks`,
`documents`, `notifications`.

`users` is deliberately **not** eligible. Scheduled erasure of user documents would orphan
Firebase Auth accounts; subject erasure has its own audited path in
`createDataDeletionRequest`.

**Deletion is currently disarmed.** `runRetentionCleanup` reports the documents it would
remove via an `eligible` counter but performs no writes unless
`ERP_ENABLE_RETENTION_DELETION=true` is set. This is deliberate: the job previously queried
a subcollection that does not exist and so had never deleted anything in production, and
arming bulk deletion in the same change that fixed the query would have offered no
observation window. Review the `eligible` counts from a real run before arming it.

The job runs monthly via the `compliance-retention` cron.

## Backups

Source: `app/api/cron/backup/route.ts`

Daily Firestore export to Cloud Storage, retained **30 days** by default
(`BACKUP_RETENTION_DAYS`). This is the point-in-time recovery window.

**Restore has never been exercised.** A backup with no tested restore does not satisfy
availability criteria A1.2. See `docs/runbooks/disaster-recovery.md`.

## Categories with no retention rule today

Each of these is retained indefinitely. Listed so the position is explicit.

| Data                      | Where                      | Position                                                                                                                                                                                     |
| ------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audit logs                | `auditLogs`                | Indefinite unless a tenant configures an `audit_logs` policy. Long retention is usually correct for audit trails, but the period should be a deliberate choice                               |
| Billing state transitions | `billing_state_audit`      | Indefinite. Retain — this is the evidence trail for every subscription state change                                                                                                          |
| Processed webhook events  | `processed_webhook_events` | Indefinite. Grows unbounded, one document per webhook delivery across Stripe, Calendly, DocuSign and Twilio. Needs a TTL; a 90-day window comfortably exceeds every provider's retry horizon |
| Email outbox              | `email_outbox`             | Indefinite. Delivered entries are never pruned                                                                                                                                               |
| Rate-limit counters       | Upstash Redis              | Short-lived, expire with their own window. No action needed                                                                                                                                  |
| Platform support tickets  | `platform_tickets`         | Indefinite, including any screenshots attached to them                                                                                                                                       |

## Data subject rights

Source: `lib/compliance/data-retention.ts`

- **Export (DSAR):** `POST /api/compliance/export-data` returns the subject's user record,
  audit log entries, and their invoices, expenses, projects, tasks, documents and
  notifications, as JSON or CSV.
- **Erasure:** `POST /api/compliance/delete-data` in either `delete` or `anonymize` mode.

Both verify that the subject belongs to the requesting tenant before any read or write, and
return 404 rather than 403 on a cross-tenant subject, since confirming a uid exists in
another tenant would itself be a disclosure.

## Outstanding

- Arm `ERP_ENABLE_RETENTION_DELETION` after reviewing real `eligible` counts
- Add a TTL to `processed_webhook_events` and prune delivered `email_outbox` entries
- Perform and document a restore test against a real backup
- Decide a deliberate retention period for `auditLogs` rather than inheriting indefinite
