# V37 — Verified Findings (P0-1: tenant isolation mutation audit)

**Baseline:** `nextjs-boilerplate-main (37).zip` — 1,682 files, 1,556 TS/TSX, 654 API routes, 257 pages, 128 static test files.
**Scope of this document:** P0-1 only. Other P0/P1 items from the v37 audit remain open.

## Method

Every `app/api/**/route.ts` was scanned for the defect class _"a document is loaded by a
request-supplied id and then mutated"_. 119 routes match. Each was then checked for a tenant
ownership assertion. 20 had none. Each of those 20 was read in full and classified.

`super_admin/*` is excluded: it is cross-tenant by design and gated by `requireSuperAdmin`.

## Confirmed defects (fixed in this change)

| ID      | File                                                   | Finding                                                                                                                                                                                                                                                       |
| ------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-001 | `app/api/admin/clients/delete/route.ts`                | Soft-deletes `clients/{id}` from a request id with no tenant check. The audit record was also written with the target's tenantId.                                                                                                                             |
| SEC-002 | `app/api/admin/production/project/move-stage/route.ts` | Mutates stage, stageHistory, stageTimestamps, deliveredAt, emits automation events and sends notifications on a foreign project.                                                                                                                              |
| SEC-003 | `lib/files/file-manager.ts` (`storeVersion`)           | A caller-supplied `fileId` becomes `fileRoot`; if `erp_files/{fileRoot}` exists it is updated with no tenant check, overwriting name/size/mimeType/storagePath/checksum. `folderId` was never ownership-checked either.                                       |
| SEC-004 | `app/api/files/upload/route.ts`                        | `uploadId` (min length 8 only) is used as a Firestore doc id **and** a server filesystem path segment; `totalChunks` unbounded; `chunkIndex` never proven `< totalChunks`. Partially fixed here (input bounds); assembled-byte/quota/magic-byte work is P0-2. |
| SEC-008 | `app/api/sales_manager/leads/convert/route.ts`         | **Not in the original audit.** No tenant check at all. Converting a foreign lead copies its name/email/phone into the caller's tenant as a new deal _and_ mutates the foreign lead record. Cross-tenant exfiltration, not just a destructive write.           |
| SEC-009 | `app/api/admin/change-requests/update-status/route.ts` | **Not in the original audit.** An admin of tenant A can transition tenant B's change request and inject notifications into tenant B.                                                                                                                          |

## Downgraded

| ID                | File                                    | Verdict                                                                                                                                                                                                                                                                 |
| ----------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V37-P2-DOMAIN-001 | `app/api/admin/domains/verify/route.ts` | Writes `tenant_domain_mappings/{domain}` stamped with the caller's tenantId even when DNS verification returns `verified: false`. Real defect, **P2 not P0**: a repo-wide grep shows the collection has no read path anywhere, so there is no exploitable impact today. |

## Reviewed and found already safe

These 15 routes match the detector but are bound by a principal other than a raw tenant
comparison. Each is recorded with its justification in `OWNERSHIP_EXEMPT_ROUTES`.

- Bound by uid: `am/change-requests/create` (`isOwnedByAm`), `crm/leads/convert` (`lead.createdBy`)
- Bound by clientId: `client/projects/approve`
- Local-variable tenant compare the regex cannot see: `admin/change-requests/create`, `client/change-requests/update-status`
- Tenant is in the document path: `admin/finance/tax-rates`, `support/tickets/[id]/messages`
- Recipient membership gate: `notifications/create`
- Server-generated single-use OAuth nonce: `stripe/connect/callback`, `billing/terminal/oauth-callback`
- Per-invoice payment token: `public/invoice/[invoiceId]/pay`, `public/invoice/[invoiceId]/confirm`
- Pre-authentication, keyed by email: `auth/send-otp`, `auth/verify-otp`, `signup`

## Canonical control introduced

`lib/tenant/ownership.ts` — `isTenantOwned({ data, callerTenantId, callerRole, allowSuperAdmin })`.

- Fails closed: an empty or missing caller tenant never matches anything.
- A document with no `tenantId` belongs to the default tenant, mirroring `docTenantId()` and
  `queryWithTenant()`, so behaviour for pre-multi-tenancy data is unchanged.
- The `super_admin` bypass is explicit and opt-in per call site. Internal helpers with no role
  context (`FileManager`) pass `allowSuperAdmin: false`.

Routes return **404**, not 403, so a foreign id never confirms that the record exists.

## Still open

REL-001: this commit is not runtime-certified until `npm ci`, `format:check`, `lint`, `typecheck`,
`test`, `build`, `bundle:check`, `licenses:check`, `npm audit` and Playwright all pass in CI on the
merged SHA. P0-2, P0-3 and P0-4 are untouched by this session.

## P0-2 — chunked upload and file content security (closed)

| Control          | Before                                                      | After                                                                                                                                       |
| ---------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| uploadId         | `min(8)`, used directly as a filesystem path segment        | opaque token `^[A-Za-z0-9_-]{8,128}$`, resolved path asserted under the approved temp root                                                  |
| chunkIndex       | unchecked at the manager layer                              | must be `< totalChunks`                                                                                                                     |
| totalChunks      | unbounded                                                   | capped at 2048, and `totalChunks * MAX_CHUNK_SIZE` capped at the 25MB assembled ceiling                                                     |
| assembled size   | never measured                                              | measured during assembly, capped, and compared with the declared size                                                                       |
| file content     | extension + declared MIME only                              | magic-byte signature must agree with the extension; executables, ELF, Mach-O, Java class and shell scripts rejected whatever they are named |
| SVG              | allowed image type                                          | blocked (executable document, was served from a signed URL on our own origin)                                                               |
| session claim    | read-then-write                                             | single Firestore transaction                                                                                                                |
| session binding  | tenant only                                                 | tenant AND the user who opened it                                                                                                           |
| session metadata | mutable between chunks                                      | immutable; a mismatch aborts the upload                                                                                                     |
| session lifetime | unbounded                                                   | 6h TTL, expired sessions never resumed, lazy purge of sessions and temp dirs                                                                |
| storage quota    | `erp_files` counted nowhere — every chunked upload was free | counted, and charged on the real assembled byte length                                                                                      |
| error surface    | 500 with the raw internal message                           | 4xx with an actionable message, 500 without internals                                                                                       |

Deferred with reasons: malware scanning and quarantine (a scanner already exists at
`lib/storage/storage-service.ts` for the documents path and should be unified, not duplicated);
decompression-bomb limits on zip/rar (needs an archive reader, tracked in P3); download-time
content-disposition hardening (touches the share/serve flow).

## P0-3(a) — canonical subscription lifecycle policy (closed)

`lib/billing/lifecycle-policy.ts` is now the single source of truth. The Terms, Privacy Policy and
Refund & Cancellation page derive every lifecycle statement from it.

| Fact                        | Canonical value                                | Was                                                                   |
| --------------------------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| Trial                       | 14 days, card required, first charge day 15    | consistent, now single-sourced                                        |
| Dunning                     | 7-day grace, read-only day 8, hard lock day 21 | stated only on the refund page                                        |
| Retention after hard lock   | 60 days                                        | refund page said 60, Terms/Privacy said 30, neither named the trigger |
| Retention after termination | 30 days                                        | same, and the two were indistinguishable                              |
| Money-back guarantee        | none                                           | pricing page promised 30 days against a non-refundable policy         |
| Billing cycles              | monthly and annual                             | Terms claimed monthly only                                            |

Neither retention number changed. What changed is that each page now names the event that starts
its clock, so the 60-day and 30-day windows can no longer read as a contradiction.

`__tests__/lib/billing/lifecycle-policy-consistency.test.ts` fails the build if a legal page
hardcodes a lifecycle day count again, or if a withdrawn promise reappears.

The pricing page is intentionally out of scope here and is corrected in P0-3(b).

## P0-3(b) — pricing page truth (closed)

| Removed                                                                                       | Why                                                                   |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Four testimonials (Northline Manufacturing, Alder Retail Group, TerraBuild, Helios Logistics) | Bizosto is pre-revenue. None are customers; the quotes were invented. |
| Four-name logo wall                                                                           | Same non-customers presented as logos.                                |
| "reduced month-end close time by 42%"                                                         | No source, no customer, no measurement.                               |
| "SOC 2 Ready"                                                                                 | No audit, no report, no auditor engaged.                              |
| "GDPR Compliant"                                                                              | No DPA and no subprocessor list; both are tracked in P3-3.            |
| "30-Day Money-Back Guarantee"                                                                 | Withdrawn in P0-3a; contradicted the Refund page and Terms.           |
| FAQ "your workspace is paused and retained for 30 days"                                       | Contradicted a card-required trial that auto-converts on day 15.      |

| Corrected                                                               | Evidence                                                                                                                                        |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `SSO / SAML` → `SSO (OAuth/OIDC)`, SAML marked planned                  | `lib/auth/sso-oauth.ts` supports `google \| microsoft \| okta \| auth0` over OAuth 2.0 / OIDC. The string "saml" appears nowhere in the module. |
| `AI forecasting` Enterprise `true` → `'coming-soon'` on all three plans | No forecasting implementation exists in `lib/ai` or `app/reports`.                                                                              |
| "Advanced finance & HR" tooltip no longer mentions forecasting          | Same reason.                                                                                                                                    |

Left unchanged because they are accurate: seat counts (10 / 20 / Unlimited) and storage
(20GB / 75GB / 250GB) both match `lib/billing/plans.ts` byte for byte.

The removed proof was replaced with four controls that are verifiable in this repository
(tenant isolation, RBAC, audit trail, encryption) plus an explicit statement that Bizosto is not
SOC 2 certified. `lib/marketing/proof-policy.ts` is the single list of what may not be claimed,
and `__tests__/marketing/pricing-truth.test.ts` fails the build if any of it returns.

## P0-4(a) — invoice reminder cron (closed)

The job had never executed a single action. It iterated `tenants/{id}/invoices` and
`tenants/{id}/clients`; a repo-wide search finds no writer for either. Invoices are created at
top-level `invoices`, clients at top-level `clients`.

| Aspect           | Before                                                  | After                                                                                                                              |
| ---------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Invoice source   | `tenants/{id}/invoices` (empty)                         | top-level `invoices`, filtered by `isDeleted` + canonical status                                                                   |
| Client source    | `tenants/{id}/clients` (empty)                          | top-level `clients`, with a tenant match before use                                                                                |
| Identifier       | an invoice-number field                                 | `orderId`                                                                                                                          |
| Amount           | a flat total                                            | `amountTotal` and `balanceDue`                                                                                                     |
| Due date         | `new Date(string)`                                      | Timestamp / Date / ISO / epoch, via `toDate()`                                                                                     |
| Status filter    | `['sent','overdue']` — neither is canonical             | `['issued','partially_paid']`                                                                                                      |
| Overdue          | wrote `status: 'overdue'`, corrupting the field         | derived; recorded as `overdueSince`                                                                                                |
| Late fee         | direct `total` mutation, no audit trail                 | `mutateFinanceInTransaction` + `adjustment.created` ledger entry, both totals adjusted together, re-checked inside the transaction |
| Late fee default | always on                                               | **off** unless `ERP_ENABLE_INVOICE_LATE_FEES=true`                                                                                 |
| Scale            | unpaginated scan per tenant inside a 5-minute execution | paginated with a 2,000-document budget, `truncated` reported, tenant and client reads cached                                       |
| Payment link     | `/client/invoices/{id}` — route does not exist          | `/pay/{id}?token=…` — the payable route                                                                                            |

All date and money logic moved to `lib/finance/invoice-schedule.ts` as pure functions, covered by
`__tests__/finance/invoice-schedule.test.ts`. `generate-invoices` carries the same defect and is
tracked as P0-4(b).

## P0-4(b) — canonical URLs and link contract (closed)

Resolving every hardcoded `app.bizosto.com` link against the real route tree found two dead
links shipping to customers, plus two wrong base-URL fallbacks.

| Defect                                            | Impact                                                                                                                                                | Fix                                                                                                             |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/approvals` in the approval-request email        | The approval queues are role-scoped and nothing else in the app links to them, so this email was the only entry point and it 404'd for every approver | `approvalsUrlForRole(approver.role)` → the real per-role queue; roles without one (admin) get the root redirect |
| `/client/invoices/{id}` in `generate-invoices`    | Dead link (job is no-op'd behind `ERP_ENABLE_RECURRING_INVOICES`)                                                                                     | `invoicePaymentUrl()` → `/pay/{id}`                                                                             |
| `onboarding-emails.ts` fell back to `bizosto.com` | Trial, payment-failed and restore-access emails linked to the marketing site, which serves neither `/login` nor `/billing`                            | `getAppUrl()`                                                                                                   |
| `billing/portal` fell back to `bizosto.com`       | Stripe `return_url` sent a paying customer to a 404                                                                                                   | `getAppUrl()`                                                                                                   |

`lib/urls.ts` is the single source: `getAppUrl`, `getMarketingUrl`, `appUrl`, `invoicePaymentUrl`,
`approvalsPathForRole`, `approvalsUrlForRole`. It is the one file exempt from the sweeps, since it
defines both bases.

`__tests__/api/v37-link-contract.test.ts` builds the route set from the app directory (257 routes on
this commit) and fails the build on any link that does not resolve, or any file that resolves an app
base URL to the marketing domain.

Deliberately not done here: the ~40 remaining hardcoded `app.bizosto.com` links inside email HTML.
All of them resolve to real routes — the new test proves it — so they are hygiene, not a blocker,
and churning 25 more files alongside three live 404 fixes would make this PR unreviewable.

`generate-invoices` was inspected during this work and needs no P0 session: it is already correctly
disabled behind `ERP_ENABLE_RECURRING_INVOICES` with an E4c note describing the same subcollection
defect fixed in P0-4(a). Migrating it is feature completion, not a release blocker.

## P0-5 — undelivered onboarding email (closed)

Two Firestore collections were written to and never read. Every message routed through them
since the features shipped was discarded.

| Path                                  | Was                                                                                                         | Now                                                                                                      |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `lib/emailEvents.ts` → `email_events` | row written with a pending status; zero readers, no draining cron                                           | renders and sends inline via `sendEmail`, records `sent \| failed \| unroutable` with the failure reason |
| `lib/clientActivation.ts` → `emails`  | the client's set-password link written with a pending status from five call sites                           | sent via `sendSetPasswordEmail`, the helper four other routes already use; the row records the outcome   |
| `app/api/super_admin/tenants`         | Auth user created with **no password and no setup token**, activation email queued into the dead collection | mints a set-password token and delivers it                                                               |
| `app/api/admin/projects/create`       | onboarding payload carried `instructions: 'TODO: …'`, unread by any template                                | removed                                                                                                  |

Consequences before the fix: a client provisioned through client-create, invoice-create,
client-activation, order-ingest or CRM never received the only link that grants portal access, and
a super_admin-created tenant admin had no credential at all — no password, no token, no email.

Design notes:

- Delivery never throws. A provider outage must not roll back the client or tenant just created,
  so failures are recorded and logged instead of propagated.
- An activation email with no link is never sent. `render()` returns null and the row is marked
  `unroutable`, because telling someone to activate and giving them nothing to click is worse than
  sending nothing.
- The set-password link is a live credential and is stripped from both stored payloads. It exists
  only inside the message.
- No cron was added. A queue nothing drains is the defect; a drainer is one more thing that can
  silently fail to run.

Deliberately out of scope: the five other writers to `emails` (sales, HR, finance, `lib/email.ts`).
They are a separate delivery path with its own semantics.

TODO/FIXME count in `app`, `lib` and `components` is now zero, enforced by
`__tests__/api/v37-email-delivery.test.ts`.

## P1-1 — one identity source in the application shell (closed)

`components/layout/AppShell.tsx` resolved `currentUser.role` from three sources in priority order:
the server tenant context, a browser localStorage key, and finally the literal string `'admin'`. It
also ran its own Firebase auth listener and its own Firestore read of `users/{uid}`, duplicating
work `RequireAuth` performs on the same page load.

| Before                                                            | After                                                                                                                                         |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `serverRole \|\| fallbackRole \|\| 'admin'`                       | `normalizeRole(data?.user?.role \|\| '') \|\| ''` — no fallback; an unrecognised role coerces to the empty role, never to a guessed `'admin'` |
| role seeded from and written to browser storage                   | storage is not consulted; the key is now read by nothing                                                                                      |
| second `getFirebaseAuth` + `onAuthStateChanged` + `fetchUserRole` | removed; the shared cached tenant context is the only source                                                                                  |

**Severity, stated precisely.** This was not privilege escalation. `RequireAuth` never read browser
storage — it verifies the role against `users/{uid}` or `/api/tenant/context` and redirects to
`/unauthorized`, and every API route enforces role and tenant server-side (P0-1 guard: 119 routes,
zero unexplained offenders). A forged storage value produced a misleading sidebar, not access.

The material defects were that a legitimate non-admin with a slow context request was rendered an
admin shell, and that every authenticated page paid for two Firebase auth initialisations and two
identity reads before first paint.

Removing the fallback required no change to any consumer. Verified against the real modules on this
commit: `getNavigationForRole('')` returns 0 items (`'finance'` returns 7, `'admin'` returns 11),
`formatRoleLabel('')` returns `'User'`, and `getRoleRoute('')` returns `'/login'`, which never
matches the current pathname so the product tour cannot fire.

Collapsing `RequireAuth`'s own duplicate identity fetch, and moving page authorisation to the server
layout, is P1-2.

## P1-3 — middleware Stripe exemption scope (closed)

`middleware.ts` classified Stripe routes with two broad prefixes — `startsWith('/api/stripe')` for
the public gate and `startsWith('/api/stripe/')` for the CSRF skip — plus a
`startsWith('/api/webhooks/stripe')` prefix. Of the eight `/api/stripe/*` routes, only four are
genuinely unauthenticated:

| Exempt (unauthenticated)      | Authenticates by             |
| ----------------------------- | ---------------------------- |
| `stripe/webhook`              | stripe-signature             |
| `stripe/subscription-webhook` | stripe-signature             |
| `stripe/connect/webhook`      | stripe-signature             |
| `stripe/connect/callback`     | single-use OAuth state nonce |

The other four ran a session guard and were wrongly waved through:

| Was exempt, should not be   | Guard                        |
| --------------------------- | ---------------------------- |
| `stripe/checkout`           | `requireAdminOrSuperAdmin`   |
| `stripe/connect/status`     | `requireAdminOrSuperAdmin`   |
| `stripe/connect/start`      | `requireTenantStripeConnect` |
| `stripe/connect/disconnect` | `requireTenantStripeConnect` |

The broad prefix skipped the middleware session gate and the CSRF check for all four. Separately,
the `/api/webhooks/stripe` prefix also matched the authenticated `/api/webhooks/subscriptions/*` and
`/api/webhooks/deliveries/*` admin routes; the real endpoint there is a deprecated 410 stub, now
matched by exact path.

**Severity.** Not a confirmed breach. Each route's own guard runs independently of the middleware
and rejects unauthenticated or cross-tenant callers (P0-1 guard: 119 routes, zero unexplained
offenders). The exposure was defence-in-depth plus CSRF on authenticated, state-changing routes —
checkout creates a Stripe Checkout session, disconnect tears down a tenant's Connect account.

Fix: `PUBLIC_STRIPE_PATHS` is an exact-match allowlist of the four public endpoints, shared by both
the public gate and the CSRF skip via `isPublicStripePath`. The route contract's existing refusal to
list `stripe/checkout` in `PUBLIC_ROUTES` is unchanged and now agrees with the middleware.

## P1-5 — readiness probe fails red on a dead dependency (closed)

`/api/health/ready` checked Firestore only and, on failure, returned a bare `not_ready` naming no
dependency. Redis — which backs every rate-limited and cached path — was not checked, so an instance
with a configured-but-unreachable cache reported itself ready and continued to receive traffic it
could not serve.

| Aspect                    | Before               | After                                                                           |
| ------------------------- | -------------------- | ------------------------------------------------------------------------------- |
| Dependencies checked      | Firestore            | Firestore + Redis, run concurrently                                             |
| Failure detail            | bare `not_ready`     | per-check `{ state, required, latencyMs, error }` naming the failing dependency |
| Hung dependency           | could hang the probe | every check bounded by a 3s timeout                                             |
| Unconfigured optional dep | n/a                  | reported `skipped`, never fails readiness (preview deployments)                 |
| Configured-but-down Redis | reported ready       | fails readiness with 503                                                        |
| Probe error               | possible 500         | returned as a 503 not-ready signal; never a stack trace                         |

Liveness (`/api/health`) is unchanged and remains dependency-free, which is correct for a liveness
probe. Stripe, Resend and the storage bucket are deliberately not part of readiness: an instance can
serve requests without them, and gating rotation on a payment provider or an email API would take
the whole app out over a non-critical outage.

## P1-6a — storage bucket resolution unified (closed)

Ten server-side storage call sites across five files each inlined the same chain:

    process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FB_STORAGE || undefined

`NEXT_PUBLIC_FB_STORAGE` is set nowhere; the real public var is
`NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`. Whenever the server var was unset, all ten sites silently
used the Admin SDK default bucket instead of the configured one, and the dead legacy branch hid the
missing fallback. This is the same defect class the backup path already fixed by dropping its
hardcoded `bizosto-backups` fallback.

| Call site                      | Occurrences |
| ------------------------------ | ----------- |
| lib/export/bulk-export.ts      | 1           |
| lib/files/file-manager.ts      | 2           |
| lib/integrations/docusign.ts   | 2           |
| lib/storage/storage-service.ts | 3           |
| lib/import/bulk-import.ts      | 2           |

`lib/storage/bucket.ts` → `getStorageBucketName()` is now the single resolver
(`FIREBASE_STORAGE_BUCKET` → `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` → `undefined`, no hardcoded
fallback). `getBackupBucketName` delegates to it, so backup, restore and every storage path agree on
the bucket. `__tests__/lib/storage-bucket-resolution.test.ts` fails the build if any file re-inlines
the legacy chain.

Two related items from an earlier note were verified already resolved in the tree and needed no
work: the backup cron's hardcoded `bizosto-backups` fallback (replaced by `lib/backup/backup-bucket.ts`)
and the dead `lib/firebase.ts` reading a nonexistent `NEXT_PUBLIC_FB_*` set (deleted).

## P1-6a — backup coverage registry + retention (closed)

The nightly backup cron backed up seven hardcoded collections. A scan of every `collection('name')`
reference in app/ and lib/ found 113 distinct top-level collections, ~95 of them carrying tenant
business or audit data — including the append-only `finance_ledger`, plus `deals`, `leads`, `orders`,
`expenses`, `payroll`, `credit_notes`, the HR set and the tax tables. None of these were backed up,
and nothing detected the drift.

`lib/backup/backup-registry.ts` now classifies every top-level collection as
`durable | audit | ephemeral | subcollection`, each with a one-line justification. The cron backs up
`durable + audit` (95 collections); it skips `ephemeral` (40) and `subcollection` (3).
`__tests__/backup/backup-registry-coverage.test.ts` walks the source and fails the build if any
referenced top-level collection is unclassified, so coverage cannot silently regress.

Retention: after each successful run, `pruneOldBackups` deletes `backups/YYYY-MM-DD/` folders older
than `BACKUP_RETENTION_DAYS` (default 30). It runs only after the new backup is written, matches only
dated backup prefixes, never touches the current run, and a prune failure is logged but never fails
the backup. Storage growth is now bounded by design.

Cost: the high-volume, low-restore-value collections (activity feeds, notification instances, CSP
noise, usage and run logs) are classified `ephemeral` — both the correct things to skip and the
collections that would otherwise dominate backup size and Firestore read cost. Backing up the durable
business + audit set plus 30-day retention keeps this within the Firestore free read tier and pennies
of storage at current scale.

Deferred to P1-6b: the cron still reads each collection with a single unpaginated `.get()` and holds
documents in memory. Fine at current volume; the streaming/paginated rewrite is needed before
`finance_ledger` grows large. Also for P1-6b: subcollections (`counters` holds invoice sequence
numbers; `messages` holds project comms) are not captured by the top-level backup and need
collection-group handling.

## P1-6b — restore path fixed (was non-functional and data-corrupting) (closed)

`lib/backup/restore.ts` was written against a backup format that does not exist. It had never once
run, and would have corrupted data if it had:

| Defect               | Detail                                                                                                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Could never run      | Required a single-tenant `backups` record with `tenantId`; the cron writes a multi-tenant record (`tenants: <count>`, no `tenantId`), so the assertion threw on every real backup.                                                      |
| Wrong read path      | Read `${storagePath}/{collection}.json`; the cron writes `backups/{runDate}/{tenantId}/{collection}.json`. The tenant segment was missing → 404.                                                                                        |
| Wrong write location | Wrote to `tenants/{tenantId}/{collection}` subcollections; the app and the backup use top-level collections. A restore would have scattered data to a location nothing reads — the DR-01 defect the backup fixed and restore never did. |
| No integrity check   | Ignored the per-file sha256 the cron records in the manifest.                                                                                                                                                                           |
| No dry run           | Destructive overwrite with no preview.                                                                                                                                                                                                  |

Rewrite: restore now drives entirely off `backups/{runDate}/manifest.json`, which lists every file
with `{ path, tenantId, collection, records, sha256 }`. It downloads each file by its recorded path,
verifies the checksum before writing, and restores documents to the top-level collection under their
original id with `{ merge: true }`. A `dryRun` option verifies the manifest and all checksums and
reports what would be written without touching Firestore; a `tenantIds` filter restores one tenant.
The route (`app/api/backup/restore`) stays super_admin-gated and now accepts `dryRun`/`tenantIds` and
returns the result.

Deferred to P1-6c: the nightly cron still reads each collection with a single unpaginated `.get()`
and holds documents in memory (fine at current volume, needs streaming before `finance_ledger` grows
large), and subcollections (`counters`, `messages`) are still not captured.

## P2-1 — colour design tokens formalized + benchmark page migrated (Phase 2 opens)

The design-token system in app/globals.css is comprehensive and good. The problem is drift: 95 of
479 component files used raw hex instead of tokens, including token-divergent values and mixed-case
duplicates. Phase 2 enforces the existing system rather than building a new one.

P2-1 lays the foundation:

- **Formalized the colours that had no token**, preserving their exact values:
  `--danger-strong: #dc2626` and `--warning-strong: #d97706` (the darker -600 shades used for text,
  where the -500 fills `--danger`/`--warning` lack contrast — verified: #dc2626 is used only for
  `color:`, never fills), `--info-strong: #0891b2`, and the brand palette `--brand-navy: #012167`
  and `--brand-blue-light: #6692f9` (used across 13 and 11 files, previously absent from :root).
  Snapping these to nearby tokens was rejected: it would have altered brand colour and reduced text
  contrast, with no staging to catch it.
- **Converted the benchmark page** (super_admin/payments, the master UI reference): its five
  hardcoded stat-card accents now use the tokens holding those exact values, joining the sixth card
  that already used var(--erp-blue). The page renders identically.
- **Added a drift guard** (`__tests__/ui/color-token-drift.test.ts`) with a CLEAN_FILES allowlist that
  only grows. Each later Phase 2 batch adds the files it converts; the guard fails CI if a converted
  file re-introduces raw hex, so cleaned files cannot regress while the remaining ~94 are migrated.

No rendered colour changed in this session — every replaced hex maps to a token of the same value.

## P2-2 — super_admin route group migrated to design tokens

Converted the eight remaining super_admin pages (21 raw-hex occurrences) to design tokens; the whole
route group is now hex-free and covered by the drift guard's CLEAN_FILES allowlist.

Every replaced hex maps to a token of the exact same value — no rendered colour changed. Four tokens
were formalized to preserve exact colours: `--warning-strong-alt` (#b45309), `--warning-deep`
(#92400e), `--warning-deeper` (#78350f) — the amber 700/800/900 ramp used for warning text and
gradient stops — and `--brand-primary` (#6366f1), the indigo accent used in four files.

Two latent bugs were fixed in passing: `text-[var(--erp-green,#16a34a)]` referenced an undefined
token (`--erp-green`) and only rendered via its hex fallback — now `var(--color-green)`; and
`bg-[var(--brand-primary,#6366f1)]` referenced `--brand-primary` before it existed — now formalized.

Dead `var(--token,#hex)` fallbacks were dropped where the token is always defined, so no visual
change: `var(--surface-muted,#f1f5f9)` (the token is also theme-aware, so the light-hex fallback
could have flashed on a dark surface had it ever been missing) and `var(--brand-primary,#6366f1)`.

Deviation from the batch spec on the two error banners (`maintenance`, `security`): the spec assumed
each `<p>` banner's border had already migrated to `border-[var(--danger-strong)]`, leaving only the
text to convert to `--danger-strong`. In the actual tree both the border and the text still read
`var(--danger,#dc2626)`, and — because `--danger` is defined (#ef4444) — both render #ef4444, not the
#dc2626 fallback. Converting the text to `--danger-strong` would have repainted #ef4444 → #dc2626 (a
rendered change), and would have left the border hex in place, breaking the hex-free guarantee and the
drift guard. To honour the batch's non-negotiable "no rendered colour changed" rule, both the border
and text on each banner were instead converted to `var(--danger)` — dropping the dead #dc2626 fallback
while preserving the exact #ef4444 render. This matches the spec's own "dead fallbacks dropped" list,
which names `var(--danger,#dc2626)` as a no-visual-change drop.

## P2-3 — finance / hr / production route groups migrated to design tokens

Converted seven pages (40 raw-hex occurrences) across finance, hr and production to design tokens;
these groups are now hex-free and covered by the drift guard. Every replaced value renders the exact
colour it did before — no visual change. Five tokens were formalized: `--color-info` (#3b82f6),
`--warning-alt` (#eab308), `--surface-inverse` (#1f2937), and the `--status-success-bg` (#dcfce7) /
`--status-success-text` (#166534) pair whose token references previously resolved only via a live
fallback.

Applied the P2-2 rule consistently: `var(--token, #fallback)` references render the token's value,
so `var(--danger, #dc2626)` (which rendered #ef4444) was mapped to plain `var(--danger)`, never to
the dead #dc2626 fallback. Where #dc2626 appeared as a real ternary value (production/resources) it
was mapped to `--danger-strong`.

## P2-4 — settings / onboarding route groups migrated to design tokens

Converted four pages (10 raw-hex occurrences) across settings and onboarding to design tokens; both
groups are now hex-free and covered by the drift guard. No rendered colour changed. Two tokens were
formalized: `--text-on-brand` (#ffffff, the white foreground on the dark brand gradient, distinct
from the surface-whites) and `--stripe-brand` (#635bff, Stripe's official button colour, named so it
is obviously an external brand colour not to be reused). Existing brand tokens (`--brand-navy`,
`--brand-blue-light`) absorbed the gradient stops; dead `var(--token,#fallback)` references were
mapped to the plain token per the P2-2 rule.

## P2-5 — sales route group migrated to design tokens

Converted eight sales pages (23 raw-hex occurrences) to design tokens; the group is now hex-free and
covered by the drift guard. No rendered colour changed. Two tokens were formalized: `--success-strong`
(#15803d) and `--danger-deep` (#b91c1c), the darker green-700/red-700 status-text shades. Existing
tokens absorbed the rest, including `--chart-series-5` (#8b5cf6) and `--brand-primary` (#6366f1) for
Recharts fill/stroke — a pattern already used in app/billing/terminal — and dead `var(--danger,#dc2626)`
references were mapped to plain `var(--danger)` per the P2-2 rule.

## P2-6 — admin settings + reports migrated to design tokens (admin batch 1)

Converted seven admin pages/components to design tokens; no rendered colour changed. Four tokens were
formalized: `--alert-error-text` (#991b1b), `--alert-success-text` (#065f46), `--color-indigo`
(#4f46e5), and `--email-canvas` (#ffffff — a theme-locked white for the email-preview body, which
must render as the recipient sees it regardless of app theme).

Two files under admin/settings were deliberately excluded and documented:

- `branding/page.tsx` — its hex values are tenant branding CONFIG DATA (default colour-picker values
  fed into CSS vars), i.e. the source of tokens, not styling. They must stay hex.
- `_components/SettingsAlert.tsx` — has explicit light/dark colour pairs needing theme-aware tokens;
  deferred to a later batch alongside admin/users.

A dead `var(--color-primary,#4f46e5)` reference (token never defined) was mapped to `var(--color-indigo)`.
Remaining admin subfolders (users, clients, hr, finance, projects, monitoring, and the deferred
SettingsAlert) follow in subsequent batches.

## P2-7 — admin/users migrated to design tokens (admin batch 2)

Converted four admin/users pages (11 raw-hex occurrences) to design tokens; no rendered colour
changed. Three tokens were formalized: `--surface-neutral` (#e5e7eb, gray-200 neutral button
background), `--text-strong` (#111827, gray-900 strong text), and `--danger-bg` (#fee2e2, a solid
error-banner background, distinct from the color-mix-based `--danger-soft`).

`app/admin/users/roles/page.tsx` was deliberately deferred to P2-8: its 22 hex form a complete
role-colour palette (a per-role accent map, a `<style>` block of badge backgrounds, and a purple/gray
ramp) that warrants a coherent set of role tokens rather than mechanical mapping.

## P2-8 — role/org-chart colour palette migrated to design tokens (admin batch 3)

Converted app/admin/users/roles/page.tsx (22 raw-hex occurrences, 15 distinct values) to design
tokens; the whole admin/users group is now hex-free. No rendered colour changed. Seven palette tokens
were formalized for the role badges and org-node hierarchy — a violet ramp (`--color-violet`,
`--color-violet-deep`, `--color-violet-deeper`), a slate pair (`--color-slate`, `--color-slate-deep`),
`--color-emerald` (#059669) and `--color-rose` (#e11d48) — named generically to match the existing
`--color-*` convention, since they are a display palette rather than semantic status colours. The
`.org-node-*` backgrounds live in a `<style jsx>` block that already used var() references, so the
token backgrounds follow the established pattern there.

## P2-9 — admin clients / hr / projects migrated to design tokens (admin batch 4)

Converted ten admin pages (22 raw-hex occurrences) across clients, hr and projects to design tokens;
these subfolders are now hex-free. No rendered colour changed. Two tokens were formalized:
`--danger-text-soft` (#fca5a5, the red-300 error text used on dark banners) and `--color-sky`
(#38bdf8, the sky accent for inline "Required" labels). Everything else mapped to existing tokens.

## P2-10 — admin finance / monitoring / singletons + SettingsAlert (admin complete)

Converted eight admin files (SettingsAlert, finance budgets/reports/settings, jobs, leads,
monitoring, sales/deals) to design tokens. The entire admin route group is now hex-free except
settings/branding/page.tsx, which holds tenant branding config data by design. No rendered colour
changed. Six tokens were formalized: the SettingsAlert dark-palette shades (`--alert-error-text-dark`
#fecaca, `--alert-success-text-dark` #a7f3d0, `--alert-info-text` #1e3a8a, `--alert-info-text-dark`
#e2e8f0), `--color-orange-deep` (#ea580c), and `--danger-border-soft` (#f87171).

Notable correctness point: the jobs card border `#f87171` was NOT mapped to `--toast-error` — that
token is `#ef4444` in light mode (only `#f87171` in dark), so snapping would have changed the light
rendering. It was formalized as `--danger-border-soft` instead. A token's value can differ by theme,
so the light `:root` value is what must match.

Separately noted for a later session (not fixed here): SettingsAlert always selects its `.light`
palette (`const palette = alertStyles[tone].light`), so its dark palette is currently dead — a
behaviour bug outside the scope of the colour migration.

## P2-11 — shared components migrated to design tokens (batch 1)

Converted five shared components (ActivityFeedSidebar, ActivationChecklist, ProductionProjectDrawer,
ImpersonationBanner, NotificationToast) to design tokens; no rendered colour changed. One token was
formalized: `--color-violet-light` (#8b5cf6), a fixed violet accent for the change-request
notification type — deliberately distinct from the theme-aware `--chart-series-5`, which shares the
light value but adapts in dark mode. Dead `var(--surface-muted,#f1f5f9)` fallbacks and an undefined
`var(--erp-green,#16a34a)` reference were mapped to their real tokens.

Three components were deferred with documented reasons:

- `files/TagManager.tsx` — `useState('#3b82f6')` is a default colour-picker value (config data).
- `finance/ExpenseBreakdownChart.tsx` — the COLORS pie palette is pending a dedicated chart-theme
  decision: some values match the theme-aware chart-series tokens, some match semantic tokens, and no
  mapping is both coherent and zero-change. To be handled as one deliberate chart-theme pass.
- `production/GanttChart.tsx` — `context.fillStyle` is a canvas 2D call that cannot resolve CSS
  var(); needs a computed-value approach.

## P2-12 — shared components migrated to design tokens (batch 2, layout/auth)

Converted four shell components (DashboardLayout, RequireAuth, ERPLayout, ProgressBar) to design
tokens; no rendered colour changed. Five tokens formalized the neutral gray ramp used across the app
shell: `--gray-50` (#f9fafb), `--gray-100` (#f3f4f6), `--gray-300` (#d1d5db), `--gray-400` (#9ca3af),
`--gray-500` (#6b7280).

All seven of RequireAuth's colours were dead `var(--token, #fallback)` references whose tokens are
defined and differ from the fallback hexes (e.g. `--erp-blue` = #2563eb, not the #3b82f6 fallback;
`--text-primary` = #0f172a, not #111827). They rendered the token value, so mapping to the plain
token preserves the screen exactly; mapping to the fallback hexes would have changed five spots.

## P2-13 — Header + TimeTrackingDashboard migrated to design tokens (components batch 3)

Converted the role-badge colour map in Header and the styles in TimeTrackingDashboard (18 raw-hex
occurrences) to design tokens; no rendered colour changed. Two border tokens were formalized:
`--border-muted` (#cbd5e1) and `--border-faint` (#f1f5f9), both used as 1px table/control borders.

`components/ui/BizostoSplash.tsx` was deferred: it is a self-contained splash screen with its own
light/dark decorative gradient system (including its own @media prefers-color-scheme block), so its
one-off gradient stops are handled in a separate decorative pass rather than forced into global
semantic tokens.

## P2-14 — auth / entry pages migrated to design tokens

Converted five pre-dashboard pages (login, signup, set-password, error, not-found; 45 raw-hex
occurrences) to design tokens; no rendered colour changed. login and signup were almost entirely the
brand palette (--brand-navy / --brand-blue-light / --text-on-brand). Two tokens were formalized for
the error/not-found screens: --text-slate-deep (#1e293b) and --brand-navy-soft (#1e3a5f). rgba()
values in gradients were left untouched.

Scope note: a fuller scan found ~21 app/ files still carrying hex (root layout/error/not-found, legal
pages, pay, sales_manager, am, users, billing/upgrade) beyond the route-group folders migrated so
far. These are covered by the remaining P2 batches.

## P2-15 — public invoice-payment page migrated to design tokens

Converted app/pay/[invoiceId]/page.tsx (26 raw-hex occurrences) to design tokens; no rendered colour
changed. Three tokens were formalized: --text-near-black (#1a1a1a) for the heading, and a soft
success-banner pair --status-success-bg-soft (#f0fdf4) and --status-success-border (#bbf7d0). The rest
mapped to existing brand, gray-ramp and semantic tokens.

## P2-16 — legal + security pages migrated to design tokens

Converted the five legal/security pages (terms, privacy, cookie-policy, refund-cancellation,
security) to design tokens. Each had an identical brand-gradient header and white title, all mapping
to existing tokens (--brand-navy, --brand-blue-light, --text-on-brand). No new tokens, no globals
change, no rendered colour change.

## P2-17 — shared layouts migrated to design tokens (team / hierarchy / activity)

Converted three near-identical admin-shell layouts to design tokens; no new tokens, no globals change,
no rendered colour changed. All values mapped to existing gray-ramp, surface and semantic tokens.

These layouts used the `#fff` 3-char shorthand, which the earlier 6-digit-only hex sweeps did not
catch. Both the 6-digit hex and the shorthand were converted here. A follow-up "shorthand sweep" pass
is scheduled to find and correctly map remaining `#fff`/`#000`-style shorthands across the codebase
(including six in app/pay/[invoiceId]/page.tsx that P2-15's 6-digit sweep missed, whose uses mix
surface backgrounds and on-brand text and need per-use mapping). The drift-guard HEX regex is
intentionally left at 6-digit for now to avoid false positives on those not-yet-swept files; it will
be extended to shorthand as part of that pass.

## P2-18 — misc role/util pages migrated to design tokens

Converted six pages (impersonate, billing/upgrade, am/change-requests, sales_manager deals and leads,
users; 17 raw-hex occurrences including one `#fff` shorthand) to design tokens; no rendered colour
changed. One token was formalized: `--text-slate` (#334155). The billing plan-tier accent `#8b5cf6`
was mapped to the fixed `--color-violet-light` (a plan-card accent, not a chart series). Everything
else mapped to existing brand, gray-ramp and semantic tokens.

## P2-19 — shorthand colour sweep (#fff / #999) and drift-guard lockdown

Swept every 3-char shorthand hex across app/ and components/ (20 occurrences in 10 files, several in
files earlier batches had converted but whose shorthand the 6-digit-only sweeps missed). No rendered
colour changed. `#fff` was mapped by role: background uses → --surface-card (#ffffff), text uses →
--text-on-brand (#ffffff). Two `var(--text-on-inverse, #fff)` references were dead fallbacks
(--text-on-inverse is undefined) and were mapped to --text-on-brand. `#999` (dashed drop-zone border)
was formalized as --border-dashed (#999999).

With the repo now shorthand-free, the drift-guard HEX regex was extended to also catch 3-char
shorthand, closing the gap that had allowed `#fff` to pass. Every allowlisted file was verified to
pass the shorthand-aware guard. FileUploader and the two hr/attendance pages (whose only raw colour
was shorthand) were added to the allowlist.

## P2-20 — Phase 2 closeout: GanttChart SVG tokenised + exclusions formalized

Tokenised the GanttChart arrowhead SVG (fill/stroke → --gray-500); its canvas export background
remains an intentional literal #ffffff (theme-independent PNG background; a canvas 2D fillStyle cannot
resolve CSS var()), now annotated in code.

Added an EXCLUDED_FILES registry to the drift guard documenting the six files that legitimately retain
raw colour, each with a reason and a test asserting it exists and is not also in the clean allowlist:
branding (config data), TagManager (picker seed), ExpenseBreakdownChart (pending chart-theme pass),
GanttChart (canvas export background), BizostoSplash (self-contained decorative gradients), and
app/layout.tsx (viewport.themeColor meta tag).

**Phase 2 is complete.** All 479 app/ + components/ .tsx files are now either driven by design tokens
(tracked in CLEAN_FILES and enforced by the shorthand-aware drift guard) or a documented exclusion in
EXCLUDED_FILES. No rendered colour changed across the entire migration.

## P3-1a — audit-log collection unified on `auditLogs`

Two parallel audit systems wrote to two collections: writeAuditLog (~18 callers) → auditLogs, and a
second logger plus four inline .add calls → audit_logs. Compliance/retention exports, the reporting
engine and /api/audit-logs all read audit_logs, so the real audit trail (auditLogs) was invisible to
the enterprise-facing readers.

Unified on auditLogs (the collection already holding the real history) with no change to the 18
writer call-sites — the collection is defined once in the helper. The helper now writes superset
fields (timestamp, userId, status) so the rich readers, which order by timestamp and filter by
userId/status, see helper-written entries. The five stray audit_logs write sites and the reader
collection paths (report-builder COLLECTION_MAP value, data-retention ×2, /api/audit-logs, the search
route's collection option) were repointed. The data-retention repoint covered three reader queries
(GDPR subject-access export, GDPR erasure/redaction, and the audit-trail export), not two — the
subject-access export in collectUserData was an additional reader on the wrong collection.
DataSource labels and Zod enum members reading
'audit_logs' were deliberately left unchanged — they are public identifiers for stored reports and
searches.

Deferred to P3-1b: full schema convergence (enrich writeAuditLog toward the typed AuditLog shape,
retire the second logger) and a one-time backfill/verification of any historical rows in the old
audit_logs collection.
