# Firestore query and index matrix

Evidence date: 2026-08-24. `firestore.indexes.json` contains 161 composite
definitions and one field override on the release branch. This is source
evidence only. The live Firebase index state is `OWNER PENDING` because the
connected evidence did not expose a successful deployment inspection.

## Runtime-proven missing definitions

The following definitions were reconstructed from production/preview
`FAILED_PRECONDITION` errors and are present in release-branch source:

| Collection          | Filters / ordering                                                                  | Source          | Live state                  |
| ------------------- | ----------------------------------------------------------------------------------- | --------------- | --------------------------- |
| `activities`        | `tenantId ASC`, `createdAt DESC`, `__name__ DESC`                                   | Added/confirmed | **UNDEPLOYED / UNVERIFIED** |
| `activity_presence` | `online ASC`, `tenantId ASC`, `lastSeenAt DESC`, `__name__ DESC`                    | Added/confirmed | **UNDEPLOYED / UNVERIFIED** |
| `notifications`     | `isRead ASC`, `recipientUid ASC`, `tenantId ASC`, `createdAt DESC`, `__name__ DESC` | Added/confirmed | **UNDEPLOYED / UNVERIFIED** |
| `notifications`     | `isRead ASC`, `tenantId ASC`, `toUserId ASC`, `createdAt DESC`, `__name__ DESC`     | Added/confirmed | **UNDEPLOYED / UNVERIFIED** |
| `notifications`     | `isRead ASC`, `tenantId ASC`, `toUid ASC`, `createdAt DESC`, `__name__ DESC`        | Added/confirmed | **UNDEPLOYED / UNVERIFIED** |

Do not remove older notification definitions: the codebase contains legacy and
current recipient-field variants (`userId`, `recipientUid`, `toUserId`,
`toUid`) that must coexist until data/schema migration and query evidence prove
one can be retired.

## Domain query review

Static inventory identified direct references to more than 170 named
collections and collection groups. Composite definitions cover the principal
multi-filter/order domains below; each domain still requires emulator/runtime
query execution because static matching cannot prove live index readiness.

| Domain                      | Representative collections / groups                                                                          | Required review                                                 | State                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------- |
| Notifications/activity      | `notifications`, `activities`, `activity_feed`, `activity_presence`, `activity_read_states`, `user_activity` | Tenant/recipient filters, unread state, descending cursor order | Source repaired; live blocked                |
| Sales/CRM                   | `leads`, `deals`, `campaigns`, `followUps`, `leadNotes`, `clients`, `clientSegments`                         | Tenant + stage/owner/status + created/updated cursors           | Source inventory complete; execution pending |
| Projects/production         | `projects`, collection-group `projects`, `tasks`, `production_jobs`, resources, defects, QA/test runs        | Tenant/project/status/assignee/due ordering                     | Source inventory complete; execution pending |
| Finance                     | `invoices`, `payments`, `expenses`, `payroll`, `budgets`, `tax_rates`, `finance_ledger`, recurring templates | Tenant + state/date/client/order; append-only history           | Source inventory complete; execution pending |
| HR                          | `employees`, `employeeDocuments`, attendance, leave, time entries/timesheets, performance targets/reviews    | Tenant + employee/status/date                                   | Source inventory complete; execution pending |
| Security/audit              | `auditLogs`, `audit_trail`, `security_events`, `sessions`, `api_usage_logs`, `csp_violations`                | Tenant/user/action/date, retention cursor                       | Source inventory complete; execution pending |
| Automation/approval/AI      | workflows, runs, approvals, agent tasks, automation events                                                   | Tenant + status/trigger/date/owner                              | Source inventory complete; execution pending |
| Email/webhooks/integrations | outbox/queue/events, deliveries/dead letters, collection-group `integrations`                                | Tenant + status/next-attempt/date                               | Source inventory complete; execution pending |
| Compliance/backup           | exports, deletion requests, retention policies, backups, restore audit                                       | Tenant + status/date/type                                       | Source inventory complete; execution pending |
| Platform/admin              | tenants, users, invitations, quotas, reports, support tickets                                                | Tenant/status/plan/date and Super Admin filters                 | Source inventory complete; execution pending |

## Rules relationship

Indexes do not grant access. Firestore rules currently allow tenant members to
read their own tenant document, internal tenant members to read the explicit
tenant activity-feed subcollection, users to read their own user document, and
users to read only their own tenant-bound notifications. Other application
collections are client-denied and served through authenticated Admin SDK routes;
the Admin SDK bypasses rules, so route-level tenant/resource checks remain
mandatory. `settings/*`, including `launchChecklist`, and cron execution/lease
collections are denied to every browser role, including Super Admin; guarded
Admin SDK routes are the only supported access path.

Storage rules are path and role scoped for direct browser project, client,
employee, HR-document, and brand objects, with other tenant prefixes denied.
Generic managed files are delivered through short-lived signed URLs after API
ACL checks. Existing Firebase download tokens, if any, require a separate owner
inventory because rules do not revoke already-issued token URLs.

## Deployment verification procedure

1. Run rule/index tests against Firebase emulators only. This release ran
   static/source rule guards, not an actual Rules Emulator suite.
2. Authenticate the GitHub workflow with owner-approved short-lived Google
   identity; select the intended project via environment metadata, never a
   hard-coded project.
3. Deploy first to isolated staging.
4. Inspect the Firebase API/console until every composite index reports ready.
5. Execute each affected query with staging tenant data and record result IDs,
   never secret/data contents.
6. Manually approve production deployment from the pinned commit.
7. Repeat metadata inspection and affected read-only queries.

Until steps 3–7 occur, rules and indexes remain **CODE READY**, not **LIVE
VERIFIED**.
