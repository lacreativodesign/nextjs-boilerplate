# Firebase Security Rules — behavioural certification (P0-04)

`firestore.rules` and `storage.rules` are published to Firebase rather than executed from
this repository, so for most of their life the only thing standing behind them was a pair
of source guards — `__tests__/config/firestore-rules-guard.test.ts` and
`__tests__/config/storage-rules-guard.test.ts` — which read the rulesets as text and pin
the directives that must, and must not, appear.

Those guards catch a dangerous edit. They cannot answer the question that matters at
runtime: **what does the deployed ruleset actually do when a given principal addresses a
given path?** In Firebase Security Rules that is never a property of a single line. Every
matching `allow` is OR'd, and five match blocks overlap on every path in this product, so
"is this prefix closed?" is a property of the whole ruleset and only execution settles it.

P0-04 closes that gap. `__tests__/rules/` loads the real rules files into real Firebase
emulators and asks Firebase's own rules runtime for every answer.

## Running it

```bash
npm run test:rules
```

That starts disposable Firestore and Storage emulators through the pinned
`firebase-tools@13.35.1` — the same CLI `deploy-rules.yml` publishes production rules with —
and runs the matrix. It is a blocking step of the **Quality Gates** workflow
(`Firebase Security Rules behavioral certification (P0-04)`) and part of `npm run quality:ci`.

### It fails, it never skips

The three emulator suites in `__tests__/integration` use
`process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip`, which is right for them:
they are optional depth over unit suites that already cover the same code. An authorization
matrix has no such fallback — skipped, it reports green while proving nothing. So
`__tests__/rules/helpers/emulator.ts` resolves its prerequisites at module load and throws
if an emulator is absent.

Because the suite refuses to skip, it cannot live in the default `npm test` run (which has
no emulators): `jest.config.js` ignores `__tests__/rules/` and the suite runs under
`jest.rules.config.js`. `__tests__/ci/firebase-rules-behavioral-gate.test.ts` closes that
loop from inside the ordinary suite — it runs on every PR, needs no emulator, and fails if
the CI step, the npm script, the dev dependency, the Node/MSW isolation or the no-skip
property is ever removed or softened.

### Nothing live is touched

- The project id is `demo-bizosto-rules`. The `demo-` prefix makes firebase-tools treat it
  as emulator-only and refuse to contact production Google APIs.
- `firebase.emulator.json` is a separate, emulator-only config, so the production bucket
  named in `firebase.json` is never referenced by a certification run.
- No service-account key, `FIREBASE_ADMIN_KEY`, ADC or Firebase secret is read. The suites
  do not import `firebase-admin`.
- `la-creativo-erp` and `bizosto-staging` are not addressable from the suite, and the guard
  test asserts their names do not appear in it.

## Evidence model

| Question                                                      | Answered by                                                                                                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What does the ruleset DO for principal × path × operation?    | `__tests__/rules/` — real emulator, real rules runtime                                                                                                  |
| Has a dangerous directive been introduced or a grant removed? | `__tests__/config/*-rules-guard.test.ts` — source tripwires                                                                                             |
| Is the behavioural gate still wired and still blocking?       | `__tests__/ci/firebase-rules-behavioral-gate.test.ts`                                                                                                   |
| Is the ruleset published to the right project and bucket?     | `.github/workflows/deploy-rules.yml`, `__tests__/ci/firebase-rules-deploy-workflow.test.ts`, `__tests__/config/firebase-storage-bucket-binding.test.ts` |

The source guards stay. They are complementary tripwires, and for one clause (below) they
are the only evidence the emulator can't supply.

## Firestore surfaces certified

| Surface                                         | Policy proven                                                                                                                                                                                                                                                                                                                      | Browser reader in the product                                           |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `match /{document=**}`                          | `super_admin` holds global read **and write**, in every tenant, from the browser SDK. Exact-string only: `super-admin`, `SUPER_ADMIN`, `' super_admin '`, absent, blank, numeric, null and array role claims all fail to inherit it.                                                                                               | —                                                                       |
| `tenants/{tenantId}`                            | Any member of the tenant reads it (tenancy only, no role narrowing), including the external client. Cross-tenant denied. All writes denied.                                                                                                                                                                                        | none today                                                              |
| `tenants/{tenantId}/activity_feed/{docId}`      | Every internal role reads it; the `client` role is denied; cross-tenant denied; all writes denied. Role-claim shapes: see **F-1**.                                                                                                                                                                                                 | `components/activity/ActivityFeed.tsx`, `app/activity/page.tsx`         |
| `tenants/{tenantId}/{subcollection}/{docId=**}` | `support_tickets`, its `notes` subcollection and `support_meta` are closed to every browser principal for read, write and list.                                                                                                                                                                                                    | none (Admin SDK only)                                                   |
| `users/{docId}`                                 | A user reads only their own document; another user's is denied in or across tenants; all writes denied; no tenant claim required.                                                                                                                                                                                                  | `lib/firebaseClient.ts` `fetchUserRole()`, `app/sales/profile/page.tsx` |
| `notifications/{docId}`                         | A read requires **both** `userId == auth.uid` and `tenantId == tenant claim`. Right user + wrong tenant denied; wrong user + right tenant denied; non-existent document denied. The production two-filter query succeeds; dropping either filter, or scanning unconstrained, is denied. All writes denied, including marking read. | `components/notifications/NotificationBell.tsx`                         |
| `clients`, `projects`, `invoices`               | Closed to every browser principal for read, write and list — including the `projects` listener `lib/data.ts watchProjects()` would open.                                                                                                                                                                                           | none (Admin SDK only)                                                   |
| deny-all fallback                               | `audit_logs`, `payments`, `emails`, an invented collection, a deeply nested path and `collectionGroup` scans are all denied.                                                                                                                                                                                                       | —                                                                       |

## Storage surfaces certified

Per prefix, the matrix runs READ, CREATE, UPDATE (metadata), DELETE and the size ceiling
across the ten tenant roles, the same roles in a second tenant, `super_admin` with no
tenant claim and with each tenant claim, an unauthenticated client, and thirteen malformed
claim shapes.

| Prefix                                                                                                                  | READ / CREATE                                                                                                                              | UPDATE                                        | DELETE    |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | --------- |
| `tenants/{t}/projects/**`                                                                                               | READ: **denied to everyone (P0-07)**. CREATE: `admin`, `am`, `production`, `production_manager` in-tenant, plus `super_admin` cross-tenant | denied                                        | denied    |
| `tenants/{t}/client-files/**`                                                                                           | READ: **denied to everyone (P0-07)**. CREATE: `client` in-tenant **only** — `super_admin` is denied, in or out of the tenant               | denied                                        | denied    |
| `tenants/{t}/employees/**`                                                                                              | READ: **denied to everyone (P0-07)**. CREATE: `admin` in-tenant, plus `super_admin` cross-tenant                                           | denied                                        | denied    |
| `tenants/{t}/employee-documents/**`                                                                                     | READ: **denied to everyone (P0-07)**. CREATE: `hr`, `admin` in-tenant, plus `super_admin` cross-tenant                                     | denied                                        | denied    |
| `tenants/{t}/brand/**`                                                                                                  | READ: any member of the tenant (see **F-2**) or `super_admin`. CREATE: `super_admin` only                                                  | `super_admin` only — the deliberate exception | denied    |
| `tenants/{t}/exports                                                                                                    | imports                                                                                                                                    | support                                       | documents | docusign | files | branding/**` | denied to every browser principal, `super_admin` included | denied | denied |
| any other `tenants/{t}/…` prefix                                                                                        | denied                                                                                                                                     | denied                                        | denied    |
| legacy flat `projects/`, `employees/`, `employee-documents/`, `client-files/`, `brand/`, root objects, `tenants/<file>` | denied to every browser principal                                                                                                          | denied                                        | denied    |

**P0-07 amendment.** Browser READ on the four protected file prefixes was withdrawn. It
was the grant that let the Firebase Storage API mint a permanent download token on any
protected object (getDownloadURL() on a token-free object creates one) — executed in
`__tests__/rules/storage-download-token.rules.test.ts`. Downloads now go through
authenticated API routes; see `docs/security/p0-07-firebase-storage-certification.md`.
CREATE, UPDATE, DELETE and the size ceiling are unchanged.

Also proven: cross-tenant denial in both directions on all five prefixes; a forged tenant
segment in the path does not help; the ceiling is strictly less-than (exactly 52,428,800
bytes is refused, one byte under is accepted), applies to `brand/**`, and an oversized
payload from an ungranted role is refused on both counts.

## Findings

Recorded rather than acted on. P0-04 exists to prove the current policy; changing a rule
inside a certification PR would replace evidence with a new, uncertified policy.

### F-1 — `activity_feed` narrows on role with a deny-list, not an allow-list (advisory)

`allow read: if belongsToTenant(tenantId) && !isClientRole();`

Executed, the two role-claim shapes behave differently:

- **Role claim absent → DENIED.** `request.auth.token.role` on a token with no such
  property raises `Property role is undefined on object`, and a rule that errors cannot
  allow. Fails closed.
- **Role claim present but not the string `client` → ALLOWED**, whatever it contains.
  `''`, `7`, `null` and `['admin']` are all `!= 'client'`.

The rule's own comment states the intent as "Internal staff only; client role excluded". A
token whose role claim is blank or of the wrong type is not internal staff, so
implementation and stated intent diverge for that shape.

Not changed, for three reasons: claims are minted server-side from the user's role, so a
malformed role claim requires an already-broken minting path; `belongsToTenant()` is
unaffected, so the blast radius is one tenant's own feed and never cross-tenant; and the
one principal the rule exists to exclude — the external `client` — is correctly denied.
Tightening it to an allow-list of the nine internal roles is a product decision that would
silently revoke the feed from any role not on the list.

Both shapes are pinned in
`__tests__/rules/firestore-authorization.rules.test.ts`, so the deny-list stays a
deliberate decision and a future edit cannot drift it unnoticed.

### F-2 — `brand/**` READ is tenancy-scoped, not role-scoped (intended)

`allow read: if inCallerTenant(tenantId) || isSuperAdmin();` is the only prefix with no
role test on READ, because the tenant logo is rendered in every signed-in surface including
the external client's. Consequence, proven: every member of the tenant reads it — the
`client` role, and also a member whose role claim is missing, blank, numeric, null, an
array or wrongly cased. A malformed **tenant** claim is still denied, and none of those
principals can create, update or delete. Certified as intended; stated here so the absent
role test is not mistaken for an omission.

### F-3 — the Storage emulator classifies a byte overwrite as `create` (emulator fidelity)

Characterised against `firebase-tools@13.35.1` with a synthetic ruleset
(`allow create: if true; allow update: if false`): re-uploading **bytes** to an existing
object is classified as `create` and allowed, while `updateMetadata()` on the same object
is classified as `update` and denied. The emulator populates `resource` correctly — a rule
of `allow write: if resource == null` does deny the second upload — so the gap is in method
classification, not in the evaluation context.

Consequence for the evidence: the behavioural proof of `allow update: if false` on the four
paid prefixes is the metadata path, and the suite proves it is not vacuous by showing the
same operation through the same mechanism **succeeding** on `brand/**` for `super_admin`.
The byte-overwrite clause of that same rule remains covered by
`__tests__/config/storage-rules-guard.test.ts` ("grants no update on the four browser file
prefixes"), which is exactly the complementary-tripwire role a source guard should keep.
The suite makes no claim that the emulator denies a byte overwrite, because it does not.

### F-4 — the "capped at 2MB" note on `brand/**` is an application cap (documentation)

`storage.rules` says `brand/**` is "super_admin-only, capped at 2MB". The 2MB figure is
enforced in `lib/white-label/branding.ts` on the Admin-SDK `branding/` path, not by the
ruleset. At the rules level `brand/**` carries the same 50MB `withinSizeLimit()` backstop as
every other prefix, which the suite proves. No behavioural gap — the comment describes a
stricter application limit, as the `withinSizeLimit()` comment itself says it should.

### F-5 — the operator's reach is asymmetric between the two services (intended)

`firestore.rules` opens with a recursive `match /{document=**}` granting `super_admin` read
**and write** everywhere. `storage.rules` has no global operator match at all, so
`super_admin` reaches `tenants/{t}/exports/**` and the other Admin-SDK prefixes only through
`firebase-admin`, and is denied outright on `client-files/**`. Both are certified as written.

### Rule composition — an erroring rule denies only itself

Worth recording because a product flow depends on it: for a freshly signed-in token with no
custom claims, the global `super_admin` rule raises `Property role is undefined`, and the
request to `users/{uid}` is still **allowed** by the `users/{docId}` rule. An erroring rule
does not poison the other match blocks — so `fetchUserRole()`, which reads `users/{uid}`
precisely in order to discover the role, is not one claim away from breaking sign-in.
