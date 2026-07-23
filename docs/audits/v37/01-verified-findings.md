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
