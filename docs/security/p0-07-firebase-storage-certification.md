# P0-07 — Firebase Storage production-readiness certification

**Scope:** production project `la-creativo-erp`, bucket `la-creativo-erp.firebasestorage.app`.
**Base:** `origin/main` at `73ae872bda3227fbf2986387cda8a6ad070dbb8e`.
**Merge policy:** manual merge only, by Mansoor Ahmed. Stripe / P0-05 is on hold and untouched.

Every claim below sits under exactly one of four labels, and nothing is promoted to a
stronger one than the evidence supports:

| Label                                | Meaning                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| **CODE CERTIFIED**                   | Proven by tests in this repository, run in the blocking `quality` job         |
| **LIVE VERIFIED**                    | Observed against production by an authenticated read, with the evidence cited |
| **OWNER ACTION REQUIRED**            | Cannot be done from a pull request; the exact action is given                 |
| **POST-MERGE VERIFICATION REQUIRED** | Becomes observable only after merge + owner action; the exact check is given  |

---

## 1. Current state at a glance

| Control                                                                               | Status                                                                                     |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Storage Security Rules published to the bucket                                        | **LIVE VERIFIED** (run 34862537234, §2) — for the ruleset _before_ this PR                 |
| This PR's ruleset (browser READ withdrawn)                                            | **CODE CERTIFIED**; **POST-MERGE**: publish via `Deploy Security Rules` (lifecycle step 6) |
| Protected downloads authorized + short-lived                                          | **CODE CERTIFIED** (§4)                                                                    |
| No caller-supplied `downloadUrl` trusted                                              | **CODE CERTIFIED** (§4.2)                                                                  |
| Upload-time download token revoked at registration                                    | **CODE CERTIFIED** against a Cloud Storage double; **POST-MERGE** live confirmation (§3)   |
| Support screenshots super_admin-only, no token                                        | **CODE CERTIFIED** (§5)                                                                    |
| Branding without tokens, canonical bucket                                             | **CODE CERTIFIED** (§6)                                                                    |
| No persisted signed URL                                                               | **CODE CERTIFIED** (§7)                                                                    |
| Canonical bucket everywhere                                                           | **CODE CERTIFIED** (§7.3)                                                                  |
| Object ACL evidence with uniform access off must be positively observed               | **CODE CERTIFIED** (§9) — a partial projection is FAIL / Unobservable, never PASS          |
| Reader assumable only by this repository on `main`, enforced by Google IAM            | **CODE CERTIFIED** evaluator + runbook (§9); live binding **OWNER ACTION** (pre-merge)     |
| Bucket IAM / public access / UBLA / CORS / lifecycle / versioning / retention / holds | **UNVERIFIED** — nothing observed yet; **POST-MERGE** (lifecycle step 7)                   |
| Legacy tokenized objects in the live bucket                                           | **UNVERIFIED** — count unknown; **POST-MERGE** (§10, lifecycle steps 8–10)                 |

No bucket setting was changed by this PR, and no live object or document was read or
written in producing it. The Workload Identity pool and providers were **not** observed from
here (no Google credential in this environment); §9's Step 1 is how the owner observes them.

### Lifecycle — each gate needs the one before it, and none needs a later one

| #   | Step                                                                                                                                                                       | Who                | Status reached                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------- |
| 1   | Corrected pull request, full local gate, exact-head CI green                                                                                                               | Claude Code        | —                                  |
| 2   | Independent exact-head review of the code and this runbook                                                                                                                 | ChatGPT            | **CODE CERTIFIED**                 |
| 3   | §9 Steps 1–6: record repository IDs, create the dedicated pool/provider, `POOL SAFE`, create the reader, bind the repository-ID subject, `VERIFIED`, set the two variables | Owner (read + IAM) | **PRE-MERGE OWNER SETUP COMPLETE** |
| 4   | Independent review of the Step 1 / Step 4 evidence against the same head                                                                                                   | ChatGPT            | **SAFE FOR MANUAL MERGE**          |
| 5   | Manual merge                                                                                                                                                               | Mansoor Ahmed      | —                                  |
| 6   | Approve `Deploy Security Rules` for this ruleset                                                                                                                           | Owner              | —                                  |
| 7   | `Storage Bucket Certification` runs on `main` (push trigger, or dispatch)                                                                                                  | GitHub Actions     | —                                  |
| 8   | §10 legacy-token audit (read-only)                                                                                                                                         | Owner              | —                                  |
| 9   | Separately approved §10 remediation apply — never from CI, never from a branch                                                                                             | Owner              | —                                  |
| 10  | Re-run certification; register a fresh protected upload and confirm it is not tokenized                                                                                    | Owner              | **POST-MERGE LIVE VERIFIED**       |
| 11  | Independent review of the live evidence                                                                                                                                    | ChatGPT            | **P0-07 CLOSED**                   |

No step is circular. The reader needs no merged code: Step 3 uses only `gcloud`/`gh` read
output and the evaluator, which runs from a checkout of this pull request's head. The
certification workflow needs the reader (step 3) but runs only on `main`, so it is first
exercised at step 7. The step-7 run is expected to be red on `tokens.*` until step 9, and it
is not a merge gate.

---

## 2. What was already live — and what it does not prove

**LIVE VERIFIED.** GitHub Actions run
[34862537234](https://github.com/lacreativodesign/nextjs-boilerplate/actions/runs/34862537234)
(`Deploy Security Rules`, event `push`, `main` at `bdb45e1f96ae5316ab77df206a41df2bb84589fd`,
conclusion `success`). Its `deploy` job log was re-read for this certification:

```
✔  firebase.storage: rules file storage.rules compiled successfully
i  storage: uploading rules storage.rules...
✔  storage: released rules storage.rules to firebase.storage
✔  Deploy complete!
```

`git diff bdb45e1..73ae872 -- storage.rules` is empty, so the ruleset live today is the one on
this PR's base.

**That run proves the Security Rules release and nothing else.** Rules are consulted for
browser SDK access only. They are not consulted for Admin SDK access, signed URLs, IAM, public
ACLs, CORS, lifecycle deletion, or — the P0-07 finding — any request that carries a Firebase
download token. None of those are claimed from it.

---

## 3. The defect, established by execution rather than assumption

`__tests__/rules/storage-download-token.rules.test.ts` runs against the pinned
firebase-tools 13.35.1 Storage emulator (the same CLI version that publishes production rules)
and observes token state through the Cloud Storage JSON API, which never mints:

1. **A browser upload is tokenized without being asked.** `uploadBytes()` to each of the four
   protected prefixes produces `firebaseStorageDownloadTokens`. Removing `getDownloadURL()`
   from the client therefore does not remove tokens; the server must.
2. **A permitted READ re-mints a stripped token.** `getDownloadURL()` on a token-free object in
   a prefix the rules let the caller READ creates a new token.
3. **With READ denied, nothing is minted.** The same call on the four protected prefixes is
   refused before a token is created, and the object stays token-free.

Fact 2 is why `storage.rules` had to change: while delivery roles held READ on `projects/**`,
any of them could turn any project file — including projects they are not assigned to — into
a permanent, forwardable URL, and every stripped token would grow back. **Browser READ on
`projects/**`, `client-files/**`, `employees/**` and `employee-documents/**` is now denied to
every principal.** CREATE, UPDATE, DELETE and the 50MB ceiling are unchanged; `brand/**` keeps
its tenancy READ (logos are public-facing, §6). The P0-04 matrix was updated for exactly this
and nothing else (§11).

**What the emulator cannot prove, stated so it is not overstated:** the emulator stores tokens
outside custom metadata, so a JSON-API PATCH setting `firebaseStorageDownloadTokens` to `null`
does not remove them there, whereas in Cloud Storage the key is ordinary custom metadata. The
strip is therefore **CODE CERTIFIED** against a Cloud Storage double that asserts the exact
request and refuses success unless the response proves the token is gone, and its live effect
is **POST-MERGE VERIFICATION REQUIRED** (§10, check 3).

---

## 4. Protected tenant files

### 4.1 Architecture

```
browser ──uploadBytes──▶ tenants/{t}/{surface}/{resource}/…   (CREATE only; READ denied)
browser ──POST storagePath + metadata──▶ registration route
          route: auth → tenant/role/resource → path bound to surface+resource
                 → measure (size, generation) → STRIP TOKEN (generation+metageneration bound)
                 → quota reservation → record { storagePath, downloadUrl: null }
browser ──GET /api/…/download──▶ route: session → tenant → resource ACL → deleted/scan gates
                                  → path bound to this record's resource → V4 signed URL, 5 min
                                  → 302 (Cache-Control: no-store, Referrer-Policy: no-referrer)
```

| Surface                      | Records             | Download route                                       | Who may download (union of the lists that already expose the record)                                                                                                   |
| ---------------------------- | ------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project deliverables, briefs | `files`             | `GET /api/project-files/[id]/download`               | admin, super_admin, sales_manager (tenant); am (owned project, `sales` module); production / production_manager (assigned, `production` module); client (own clientId) |
| Client uploads               | `files`             | same                                                 | same                                                                                                                                                                   |
| HR employee documents        | `employeeDocuments` | `GET /api/hr/documents/[id]/download`                | `requireHrAccess()` — hr, admin, super_admin with the `hr` module — same tenant                                                                                        |
| Managed files                | `erp_files`         | `GET /api/files/[id]/download`                       | the file's stored ACL (visibility / allowedRoles / allowedUsers / uploader / admin) — **newly enforced**                                                               |
| Document library             | `documents`         | `GET /api/documents/[id]/download` (existing)        | unchanged ACL + scan gate; URL now 5 minutes (was 1 hour) and bound to the caller's tenant prefix                                                                      |
| Support screenshots          | `platform_tickets`  | `GET /api/super_admin/tickets/[ticketId]/screenshot` | super_admin only                                                                                                                                                       |
| Exports                      | `exportJobs`        | `GET /api/export/jobs/[id]/download` (existing)      | unchanged guard; URL minted per request instead of the stored 1-hour URL                                                                                               |

Refusals preserve the established semantics: another tenant's, a missing and a deleted record
are one indistinguishable **404**; a same-tenant record the caller has no right to is **403**; a
definitive `infected` scan verdict is **403 `file_infected`** for every role.

Two defences apply to records written **before** this PR, whose `storagePath` was only ever
tenant-checked:

- the minter refuses a legacy flat path (**409 `legacy_storage_path`**) rather than sign bytes
  whose owner cannot be proven;
- the minter refuses a path outside the record's own resource root
  (**409 `storage_path_mismatch`**) — so an HR record pointing at a project file, or a project
  record pointing at another project's file, cannot be used to reach it.

### 4.2 Registration no longer trusts the caller

The six browser-direct registration routes (`am/files/upload`, `admin/files/create`,
`client/files/upload`, `production/files/upload`, `hr/documents/upload`,
`admin/hr/documents/upload`) **no longer read `downloadUrl`** from the request and write
`downloadUrl: null` (which also clears a stale URL on an upserted legacy record). They require
the path to sit under **their own surface and resource**
(`tenants/{t}/projects/{projectId}/`, `client-files/{projectId}/`, `employees/{userId}/`,
`employee-documents/{userId}/`) — necessary now that the record's `storagePath` is what its
download route signs.

Token revocation runs inside `admitTenantUpload()` for every attempt, including a retry of an
already-registered object:

- **generation-safe:** bound to the generation just measured; a different generation is
  **409**, and nothing is touched or deleted;
- **race-safe:** the PATCH carries `ifGenerationMatch` **and** `ifMetagenerationMatch`, so a
  concurrent metadata change (including a token being minted) fails the precondition;
- **quota-neutral:** a metadata PATCH changes neither bytes nor generation, so the
  `path#generation` reservation key and `storageGeneration` stay exactly as measured;
- **fail-closed:** success requires Cloud Storage's own response to show the same generation
  and no token; otherwise **502** — no record, reservation released, object left for the
  uploader to retry (never deleted by this path);
- **idempotent:** an already-clean object is a no-op success.

List APIs return a same-origin `downloadHref` and never the stored URL; the HR lists strip
`downloadUrl` before spreading the record.

---

## 5. Support screenshots

- Stored at `tenants/{tenantId}/support/{ticketId}.{png|jpg|webp}` in the canonical bucket
  with **no** download token; `cacheControl: private, max-age=0, no-store`.
- The ticket persists `screenshotPath` and an explicit `screenshotUrl: null`.
- **No ticket read sends a locator to a browser.** Tenant admins get `hasScreenshot` only;
  super_admin views get `screenshotHref` → `/api/super_admin/tickets/[ticketId]/screenshot`,
  which requires super_admin on every request and redirects to an inline 5-minute URL for the
  ticket's **own** object only.
- **Legacy tickets** (only `screenshotUrl`): the object path is recovered from the URL, checked
  to be that ticket's own object, and signed; the token in the URL is discarded and never
  followed. The legacy URL itself stops working when the object's token is revoked (§10).
- Preserved: tenant-derived path, 3MB ceiling and length-first rejection, PNG/JPEG/WebP only,
  strict rate limit, content-hash deduplication, super-admin email and in-app notification.

---

## 6. Branding — the deliberate public exception

A tenant logo appears on the public invoice payment page and in invoice PDFs, so it is served
**without authentication on purpose**. What changed is how:

- `uploadTenantLogo()` now uses the canonical bucket (it called a bare `adminStorage.bucket()`
  which, with no `storageBucket` on the Admin app, is not the canonical bucket) and writes **no**
  download token.
- The tenant stores `whiteLabel.logoStoragePath` and a stable Bizosto URL,
  `/api/public/branding/{tenantId}/logo?v={generation}`.
- That endpoint reads **only** the object named by the tenant document, only if it is one of
  that tenant's logo objects (`tenants/{t}/branding/logo.{png,jpg,webp,svg}` or the legacy
  `tenants/{t}/brand/logo.webp`), only if ≤ 2MB, with `X-Content-Type-Options: nosniff` and
  `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`. It never
  returns a token, a signed URL or a storage path.
- The Super Admin tenant screen now uploads through
  `POST /api/super_admin/tenants/[tenantId]/branding/logo` instead of the browser SDK +
  `getDownloadURL()`.
- `normalizeLogoUrl()` makes it impossible to store a bearer URL again: a tokenized Firebase URL
  is refused, unless it is this tenant's own legacy logo, in which case it is migrated to the
  endpoint with the token dropped. External `https` logos remain allowed.
- Enumerating tenant ids reveals only those tenants' **public** logos, which is the intent.

---

## 7. Signed URLs and the canonical bucket

### 7.1 Every `getSignedUrl` call, before and after

| Call site (before)                                | Before                                                 | After                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `lib/files/file-manager.ts` upload                | 2-day URL **persisted** as `previewUrl`                | not signed; `previewUrl: null`; preview minted per request after the ACL                       |
| `lib/files/file-manager.ts` `generateDownloadUrl` | 10 min, no ACL                                         | removed; route uses the shared minter after the ACL                                            |
| `lib/storage/storage-service.ts` upload           | 7-day URL **persisted** as `storageUrl` + `previewUrl` | not signed; both `null`                                                                        |
| `lib/storage/storage-service.ts` `getDownloadUrl` | 1 hour                                                 | shared minter, 5 min, tenant-bound                                                             |
| `lib/export/bulk-export.ts`                       | 1 hour, **persisted** on the job, re-served later      | shared minter for the caller who ran it; job stores `signedUrl: null`; download route re-mints |
| `lib/integrations/docusign.ts` status             | 1 hour, on demand                                      | shared minter, **15 min** (retained above 5: shown in a status panel), bound to `docusign/`    |

`lib/storage/protected-download.ts` is now the **only** `getSignedUrl` caller in product code
(pinned by `p0-07-storage-invariants.test.ts`). Default TTL **5 minutes**; any requested TTL is
clamped to **15 minutes**. Readers strip `downloadUrl`, `storageUrl` and `previewUrl` from legacy
records before they leave the server; V2/V4 signed URLs expire within 7 days of issue, so any
already persisted are dead within a week of merge regardless.

### 7.2 CORS requirement derived from the application

None. Browser uploads go to `firebasestorage.googleapis.com` (Firebase's CORS, not the
bucket's); downloads are top-level navigations to a signed URL; previews are `img` / `iframe` /
`video` loads; no client code `fetch()`es `storage.googleapis.com`. The verifier therefore
passes an **absent** CORS configuration, fails a wildcard origin, and raises any other entry
for the owner to remove or justify. No CORS change is proposed by this PR.

### 7.3 Canonical bucket

`lib/storage/product-bucket.ts` `productStorageBucket()` is the only product path to a bucket
handle. It resolves through `getStorageBucketName()` and **throws** when nothing is configured,
instead of falling back to the Admin SDK's unconfigured default. Converted: tenant-object
measurement/deletion, token stripping, file manager, storage service, exports, imports,
DocuSign, support screenshots, branding, the minter and the public logo endpoint. Backups keep
their own resolver (`lib/backup/backup-bucket.ts`) by design. A scan fails the build if any
other product file calls `adminStorage.bucket(` or `.bucket()`.

---

## 8. Lifecycle and retention inventory

| Data                  | Where                                                                                        | Lifecycle today (from code)         | Assessment                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Primary tenant files  | `tenants/{t}/{projects,client-files,employees,employee-documents,files,documents,docusign}/` | none                                | **Absence is correct.** Primary files must never disappear on an age threshold. Deletion stays with the generation-guarded routes. |
| Backups               | backup bucket via `lib/backup/backup-bucket.ts`                                              | governed by the backup/restore code | Out of P0-07 scope; not changed.                                                                                                   |
| Export artefacts      | `tenants/{t}/exports/`                                                                       | none — accumulate, counted in quota | **Gap, owner decision.** A prefix-scoped Delete rule (e.g. 30 days) is reasonable _only_ with owner approval; not deployed.        |
| Import payloads       | `tenants/{t}/imports/`                                                                       | none — accumulate, counted in quota | Same as exports.                                                                                                                   |
| Chunk upload sessions | Firestore `erp_file_upload_sessions` + temp dir                                              | 6h `expiresAt` in code              | Unchanged.                                                                                                                         |
| Support screenshots   | `tenants/{t}/support/`                                                                       | none                                | Retention follows ticket retention (`docs/security/data-retention-schedule.md`); owner decision.                                   |
| Branding              | `tenants/{t}/branding/`, legacy `brand/`                                                     | none                                | Correct: one object per tenant, overwritten.                                                                                       |

Whether the **live** bucket has lifecycle rules is **UNVERIFIED** until the certification runs
(§9). The verifier fails any Delete rule without a prefix condition and raises any
prefix-scoped one for owner confirmation. **No lifecycle rule is deployed by this PR.**

---

## 9. Live bucket certification (read-only)

`scripts/verify-storage-bucket.mjs`, run by `.github/workflows/storage-bucket-certification.yml`
(dispatch, daily, and on change to either file on `main`).

- **Targets exactly** `la-creativo-erp` / `la-creativo-erp.firebasestorage.app` — constants, no
  input can retarget.
- **Read-only by construction:** one request function, hard-coded `GET`; by identity: a
  dedicated reader holding only the permissions below; and by content: no `update`, PATCH or
  remediation call exists in the workflow. All three pinned by tests.
- **Fails closed:** an unset variable, a refused read (with the missing permission named) or an
  unfinished object listing is a FAIL. Verdict `CERTIFIED` requires zero FAIL and zero
  OWNER_ACTION.
- **Never prints secrets:** token values are reduced to a boolean as each page arrives; object
  names are never printed; only per-category counts are.

| #   | Control                            | Verifier id                                           | Pass condition                                  |
| --- | ---------------------------------- | ----------------------------------------------------- | ----------------------------------------------- |
| 1   | Bucket identity                    | `bucket.identity`                                     | name is exactly the production bucket           |
| 2   | Project binding                    | `bucket.project_binding`                              | bucket projectNumber = `la-creativo-erp`'s      |
| 3   | Location                           | `bucket.location`                                     | recorded                                        |
| 4   | Bucket exists / Storage live       | `bucket.exists`                                       | metadata served                                 |
| 5   | Public access prevention           | `iam.public_access_prevention`                        | `enforced` (else owner action)                  |
| 6   | Uniform bucket-level access        | `iam.uniform_bucket_level_access`                     | enabled (else owner action + object-ACL scan)   |
| 7   | Object / bucket / default ACLs     | `acl.*`                                               | no `allUsers` / `allAuthenticatedUsers`         |
| 8   | CORS                               | `cors.minimal`                                        | absent (§7.2)                                   |
| 9   | Lifecycle                          | `lifecycle.no_unapproved_deletion`                    | no unscoped Delete                              |
| 10  | Versioning / soft delete           | `versioning.state`                                    | recorded                                        |
| 11  | Retention policy                   | `retention.policy`                                    | none (it would block quota-enforcement deletes) |
| 12  | Default event-based hold           | `holds.default_event_based`                           | false                                           |
| 13  | Website configuration              | `website.none`                                        | none                                            |
| 14  | Labels                             | `labels.recorded`                                     | recorded                                        |
| 15  | Anonymous IAM grants               | `iam.no_public_members`                               | none                                            |
| 16  | Legacy tokens on protected objects | `tokens.protected_prefixes`, `tokens.outside_tenants` | zero                                            |
| 17  | Tokens on the public logo prefixes | `tokens.branding`                                     | zero (else owner action — hygiene)              |

**ACL evidence must be positive.** With uniform bucket-level access **on**, ACLs cannot grant
access and are not inspected. With it **off**, the bucket ACL, the default object ACL and every
object ACL must actually be _returned_ (`projection=full`) before they count: an absent `acl`
field is a partial projection — the caller lacked `storage.buckets.getIamPolicy` or
`storage.objects.getIamPolicy` — and is reported **FAIL / Unobservable** naming that
permission, never PASS. One object without an observed ACL fails the control. ACL entity
names (which can be email addresses) are reduced to "public / non-public" as each page
arrives and never reach the report.

**Status: UNVERIFIED.** The reader identity does not exist yet, so nothing has been observed.

### The reader's trust boundary — immutable repository identity + `main`, enforced by Google

The reader can list production object metadata, so who may become it is enforced at the
Google IAM / Workload Identity boundary, not by branch-controlled workflow source.

**Selected model — one dedicated pool, one provider, immutable GitHub IDs.** P0-07 does not
reuse the shared deployment pool and does not depend on GitHub's legacy-vs-immutable default
`sub` format. GitHub documents `repository_id` and `repository_owner_id` as immutable numeric
claims; Google recommends numeric GitHub `*_id` claims and an attribute condition for GitHub's
multi-tenant issuer.

The dedicated provider is:

- pool: `p007-storage-cert`
- provider: `github-main`
- issuer: `https://token.actions.githubusercontent.com/`
- `google.subject = assertion.repository_id`
- immutable repository ID: `1087507601`
- immutable owner ID: `240409176`
- provider condition: repository ID + owner ID + `refs/heads/main`

The reader's only `roles/iam.workloadIdentityUser` member is therefore the exact pool subject
`principal://.../workloadIdentityPools/p007-storage-cert/subject/1087507601`. The repository
identity is encoded in `google.subject`; the owner and branch are independently enforced by
the provider condition before Google accepts the credential.

A repository-only `principalSet` is not used. The shared
`GCP_WORKLOAD_IDENTITY_PROVIDER` is not used by this workflow. The local
`github.ref == refs/heads/main` check remains defence in depth only.

`scripts/verify-storage-reader-trust.mjs` fails closed unless:

1. the configured provider is exactly `p007-storage-cert/github-main`;
2. that pool contains exactly one provider;
3. the issuer is GitHub Actions;
4. the four attribute mappings exactly match the certified immutable-ID mapping;
5. the provider condition exactly requires repository ID `1087507601`, owner ID `240409176`
   and `refs/heads/main`;
6. the live GitHub repository metadata still reports those immutable IDs;
7. the reader service account has exactly one `workloadIdentityUser` member — the immutable
   repository-ID subject — and no project-level federated impersonation role bypasses it.

### OWNER ACTION REQUIRED — after merge, create and verify the dedicated reader identity

These commands are intentionally separate from the source-code merge. Merging a green PR
does **not** close P0-07; live verification closes it only after the identity and bucket checks
below succeed. Never create a JSON service-account key.

**Step 1 — record immutable GitHub repository metadata (read-only).**

```bash
gh api -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  repos/lacreativodesign/nextjs-boilerplate > repo.json
```

`repo.json` must report repository ID `1087507601` and owner ID `240409176`. If either differs,
STOP and investigate before creating Google trust.

**Step 2 — create the dedicated pool/provider.**

```bash
PROJECT_ID="la-creativo-erp"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

gcloud iam workload-identity-pools create p007-storage-cert \
  --project="$PROJECT_ID" --location=global \
  --display-name="P0-07 storage certification"

gcloud iam workload-identity-pools providers create-oidc github-main \
  --project="$PROJECT_ID" --location=global \
  --workload-identity-pool=p007-storage-cert \
  --issuer-uri="https://token.actions.githubusercontent.com/" \
  --attribute-mapping="google.subject=assertion.repository_id,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository_id == '1087507601' && assertion.repository_owner_id == '240409176' && assertion.ref == 'refs/heads/main'"

PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/p007-storage-cert/providers/github-main"
gcloud iam workload-identity-pools providers list \
  --project="$PROJECT_ID" --location=global \
  --workload-identity-pool=p007-storage-cert --format=json > providers.json

node scripts/verify-storage-reader-trust.mjs \
  --workflow-provider="$PROVIDER" --providers=providers.json --repo=repo.json
```

The checker must print `POOL SAFE` and the one service-account binding to create. If it prints
`STOP`, do not weaken the provider or substitute the shared provider.

**Step 3 — create the reader and read-only roles.**

```bash
gcloud iam service-accounts create storage-cert-reader \
  --project=la-creativo-erp \
  --display-name="Storage certification reader (GitHub Actions, read-only)"

gcloud iam roles create bizostoStorageCertReader --project=la-creativo-erp \
  --title="Bizosto storage certification reader" --stage=GA \
  --permissions=storage.buckets.get,storage.buckets.getIamPolicy,storage.objects.list,storage.objects.getIamPolicy
gcloud storage buckets add-iam-policy-binding gs://la-creativo-erp.firebasestorage.app \
  --member="serviceAccount:storage-cert-reader@la-creativo-erp.iam.gserviceaccount.com" \
  --role="projects/la-creativo-erp/roles/bizostoStorageCertReader"

gcloud iam roles create bizostoProjectNumberReader --project=la-creativo-erp \
  --title="Bizosto project number reader" --stage=GA \
  --permissions=resourcemanager.projects.get
gcloud projects add-iam-policy-binding la-creativo-erp \
  --member="serviceAccount:storage-cert-reader@la-creativo-erp.iam.gserviceaccount.com" \
  --role="projects/la-creativo-erp/roles/bizostoProjectNumberReader"
```

**Step 4 — bind only the immutable repository-ID subject.**

```bash
gcloud iam service-accounts add-iam-policy-binding \
  storage-cert-reader@la-creativo-erp.iam.gserviceaccount.com \
  --project=la-creativo-erp \
  --role="roles/iam.workloadIdentityUser" \
  --member="principal://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/p007-storage-cert/subject/1087507601"
```

**Step 5 — verify policies (read-only). Must print `VERIFIED`.**

```bash
gcloud iam service-accounts get-iam-policy \
  storage-cert-reader@la-creativo-erp.iam.gserviceaccount.com \
  --project=la-creativo-erp --format=json > reader-policy.json
gcloud projects get-iam-policy la-creativo-erp --format=json > project-policy.json

node scripts/verify-storage-reader-trust.mjs \
  --workflow-provider="$PROVIDER" --providers=providers.json --repo=repo.json \
  --sa-policy=reader-policy.json --project-policy=project-policy.json
```

**Step 6 — only after `VERIFIED`, set the two repository variables.**

```bash
gh variable set GCP_STORAGE_CERT_WIF_PROVIDER \
  --repo lacreativodesign/nextjs-boilerplate \
  --body "$PROVIDER"

gh variable set GCP_STORAGE_CERT_READER_SA \
  --repo lacreativodesign/nextjs-boilerplate \
  --body "storage-cert-reader@la-creativo-erp.iam.gserviceaccount.com"
```

The saved `repo.json`, `providers.json`, policy JSON files and checker output are the live
identity evidence. Any future provider change, repository transfer, or ID mismatch requires
re-running the checker. A rename does not broaden access because the trust uses immutable IDs.

### Reader permission set

| Scope                                        | Permission                     | Why                                                            |
| -------------------------------------------- | ------------------------------ | -------------------------------------------------------------- |
| bucket `la-creativo-erp.firebasestorage.app` | `storage.buckets.get`          | bucket identity, location, UBLA/PAP, CORS, lifecycle, …        |
| bucket                                       | `storage.buckets.getIamPolicy` | bucket IAM (public members); bucket/default ACLs when UBLA off |
| bucket                                       | `storage.objects.list`         | token inventory (metadata only)                                |
| bucket                                       | `storage.objects.getIamPolicy` | object ACLs positively observable when UBLA is off             |
| project `la-creativo-erp`                    | `resourcemanager.projects.get` | project-number binding check                                   |

- `storage.objects.list` returns object metadata, including token **values**, to this identity.
  The verifier discards them immediately; after §10 remediation there are none to see. That is
  why the reader is dedicated, read-only, and main-only at the Google boundary.
- Not granted, deliberately: `storage.objects.get` (object bytes), any `*.update`, `*.create`,
  `*.delete`, `setIamPolicy`, and every predefined role.

---

## 10. Legacy token inventory and remediation

Historical code minted permanent tokens on every browser upload, every support screenshot and
every logo. **The live count is UNVERIFIED** — no live read has been made.

`scripts/storage-token-remediation.mjs`:

- **Default: audit, GET only.** Per-category counts of tokenized objects; with `--firestore`,
  per-collection counts of what the legacy URL fields hold (`firebase_token_url`, `signed_url`,
  `bizosto_route`, …) read with a field mask. Never a token value, object name or document id.
- **Apply refuses** unless `--mode=apply`, `--confirm-project=la-creativo-erp`,
  `--confirm-bucket=la-creativo-erp.firebasestorage.app` and
  `P0_07_TOKEN_REMEDIATION_APPROVED_BY=<owner>` are all present, and refuses inside CI. It is
  in no workflow.
- **Apply does one thing:** PATCH `firebaseStorageDownloadTokens: null` with
  `ifGenerationMatch` + `ifMetagenerationMatch`, verified against the response. Never bytes,
  never a delete, never an ACL, never public. 412 → `skipped_changed`; unverified or error →
  non-zero exit. `--scope=protected` (default) excludes logos; `--scope=all` includes them —
  logos keep working either way through the public endpoint (§6).
- Firestore records are inventoried, **not rewritten**: every reader strips the fields, stored
  token URLs die with the object token, and signed URLs expire on their own.

### POST-MERGE (separately approved, owner-run, with the owner's own `gcloud` login)

1. `node scripts/storage-token-remediation.mjs --firestore` → record the counts.
2. After approval: `P0_07_TOKEN_REMEDIATION_APPROVED_BY="Mansoor Ahmed" node
scripts/storage-token-remediation.mjs --mode=apply --confirm-project=la-creativo-erp
--confirm-bucket=la-creativo-erp.firebasestorage.app` → expect only `revoked`.
3. Dispatch `Storage Bucket Certification` → `tokens.protected_prefixes` must be `PASS`. A new
   browser upload made after deploy, then registered, must not appear as tokenized — this is the
   live confirmation of §3's strip.

---

## 11. P0-04 and quota regressions

- `storage.rules`: the **only** change is `allow read: if false;` on the four protected prefixes,
  justified by §3. `firestore.rules` is untouched.
- P0-04 matrix (`__tests__/rules/storage-authorization.rules.test.ts`): READ expectations for
  those four prefixes now deny every principal; every CREATE, UPDATE, DELETE, cross-tenant,
  malformed-claim, admin-only-prefix, legacy-path and size-ceiling case is unchanged and passes.
- `storage-rules-guard.test.ts` pins the new READ denial and keeps every CREATE guard.
- Quota: plan ceilings, atomic reservations, retry/idempotency, generation-guarded commit and
  delete, managed versions, `documents` and `employeeDocuments` accounting are unchanged. Test
  doubles were given a configured bucket (the resolver now fails closed without one) and the
  storage-service failure test triggers on the record write instead of the removed signing
  step. The Firestore-emulator concurrency suite runs unchanged.

---

## 12. Tests and mutation battery

| Suite                                                  | What it proves                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `__tests__/rules/storage-download-token.rules.test.ts` | §3 facts 1–3 against the emulator                                                                                                                                                                                                                                                                                                                 |
| `__tests__/lib/p0-07-download-tokens.test.ts`          | strip request, preconditions, verification, fail-closed, no secret logged                                                                                                                                                                                                                                                                         |
| `__tests__/api/p0-07-upload-registration.test.ts`      | all six routes: no caller URL, strip before record, 502/409, path binding                                                                                                                                                                                                                                                                         |
| `__tests__/api/p0-07-protected-downloads.test.ts`      | ACL matrix, 404/403 semantics, deleted, scan gate, TTL, path roots, screenshot route                                                                                                                                                                                                                                                              |
| `__tests__/lib/p0-07-support-branding.test.ts`         | screenshot storage/shape/views; branding bucket, token refusal, public endpoint                                                                                                                                                                                                                                                                   |
| `__tests__/lib/p0-07-storage-invariants.test.ts`       | repository scans: canonical bucket, single minter, no token code, no `getDownloadURL`                                                                                                                                                                                                                                                             |
| `__tests__/ci/p0-07-storage-certification.test.ts`     | verifier and remediation behaviour, GET-only, no secret output, workflow read-only                                                                                                                                                                                                                                                                |
| `__tests__/ci/p0-07-reader-trust.test.ts`              | reader trust evaluator truth table (dedicated pool, exact provider mapping and condition, immutable repository/owner IDs, reader policy), each check asserted on its own; workflow uses only the dedicated provider; runbook creates it exactly, evaluates before binding, binds the repository-ID subject, grants `storage.objects.getIamPolicy` |
| `__tests__/lib/p0-07-signed-url-persistence.test.ts`   | document minting re-checks tenant/deleted; export jobs store no URL                                                                                                                                                                                                                                                                               |
| `__tests__/api/p0-07-list-routes.test.ts`              | every list that returned a stored URL, driven with legacy records: none leaks                                                                                                                                                                                                                                                                     |
| `__tests__/components/file-preview-modal.test.tsx`     | previews fetch a short-lived URL per open and degrade on refusal                                                                                                                                                                                                                                                                                  |

### Mutation battery — 98 mutants, 0 survivors

The 41 mutants covering the workflow, the ACL evidence and the dedicated-pool trust model were
re-run at the final head. The other 52 code mutants target files unchanged since they were last
run (`3725c2c`). The 5 rules mutants were run against the emulator at `46b9b2b`, and
`storage.rules` has not changed since.

Each mutant weakened one security invariant in the **real** source file, the targeted suites
were run, and the file was restored (the working tree was verified clean against the commit
afterwards). A mutant counts as killed only when a test fails.

- **56 code mutants**: token strip (metageneration precondition dropped, post-PATCH verification
  skipped, generation check skipped, token presence misread); admission (strip never called,
  strip failure ignored); registration (caller URL persisted, surface binding removed, surface
  root ignoring the resource); minter (TTL clamp removed, 7-day default, allowed roots and tenant
  prefix unenforced, responses cacheable); project ACL (production tenant-wide, AM ownership
  skipped, cross-tenant, deleted, any client, virus gate, plan entitlement); HR and project
  download roots unbound; HR tenant check removed; screenshot route without super_admin, any
  stored path accepted, token re-added, URL persisted, legacy URL passed to tenants; HR and AM
  lists returning stored URLs; branding on the default bucket, token URL stored as-is, logo path
  allow-list skipped, nosniff dropped; product bucket falling back to the default; managed-file
  ACL ignored; 2-day preview and 7-day document URLs persisted; document tenant not re-checked;
  export returning or persisting its URL; verifier passing wildcard CORS, public IAM,
  unreadable metadata and failed listings, issuing a non-GET, leaking object names; remediation
  running in CI, dropping the metageneration precondition, not requiring an approver; workflow
  with `continue-on-error`, the deployer identity, no ref guard, or invoking remediation.
- **28 WIF trust mutants** (dedicated-pool model): the evaluator accepting the shared provider,
  extra providers in the pool, a listed provider other than the workflow provider, any or a
  prefixed issuer, a non-OIDC provider, `google.subject` from `assertion.sub`, extra or wrong
  mappings, a missing or prefix-matched condition, a certified condition without the ref clause,
  another repository or owner ID; the member reverting to the repository `principalSet`; extra
  reader members, a conditional binding, other roles on the reader, or project-level federated
  impersonation accepted; the workflow restoring the shared-provider fallback, gaining an
  `environment:` or a `pull_request` trigger, or calling the ref check the boundary; the runbook
  binding a repository `principalSet`, creating the provider without the `main` clause or with
  `google.subject` from `sub`, dropping `storage.objects.getIamPolicy`, or binding before
  evaluating.
- **9 ACL-observability mutants**: `observedAcl` restoring `item.acl ?? []`; the listing
  turning an absent ACL into `[]`; the bucket/default ACL defaulting to `[]`;
  `objectAclControl` ignoring unobserved objects; the inventory dropping the unobserved count;
  `projection=full` not requested; object ACLs never checked; the tally skipping unobserved
  objects; the `storage.objects.getIamPolicy` permission hint removed.
- **5 rules mutants against the emulator**: READ regranted on each of the four protected
  prefixes (each kills `storage-download-token.rules.test.ts` fact 3), and brand READ removed
  (kills the fact 2 control case — proving the READ denial, not something else, is what stops
  the re-mint).

Two mutants survived the first pass and the suite was strengthened, not the result reported:
`StorageService.getDownloadUrl` without its own tenant check (the route tests mock the service)
and an export job persisting its URL through a shorthand property (the scan matched only
`signedUrl:`). `p0-07-signed-url-persistence.test.ts` now kills both behaviourally.
