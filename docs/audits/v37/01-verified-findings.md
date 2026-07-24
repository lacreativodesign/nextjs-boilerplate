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
