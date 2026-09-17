# P0-02 — Demo Firebase Auth identities: certification and hardening

**Status: NOT CERTIFIED — OWNER ACTION REQUIRED (both environments).**
The controls, the tooling and the workflows are implemented, tested and merged-ready. The
live evidence they exist to produce has not been collected, because the environment this
work was performed in holds no Firebase Admin credential for either project. P0-02 fails
closed, and that applies to this document as much as to the tool: **an inventory nobody
could take is not an inventory of zero legacy accounts.** See
[Unresolved owner actions](#unresolved-owner-actions) for the two dispatches that close it.

---

## Scope

P0-02 asks one question: **what can actually log in to the `bizosto-demo` golden tenant?**

`lib/demo/seed.ts` cannot answer it. The seeder makes the ten canonical identities correct,
but it only ever looks up the ten emails it already knows — it calls `getUserByEmail` for
each and stops. Anything else in the project's Auth population is invisible to it:

- an identity from an earlier demo roster,
- a renamed or aliased demo address,
- an account still carrying `tenantId: bizosto-demo` under some other email,
- a demo account that has acquired a privileged custom claim from an old repair job.

An invisible enabled account is an authentication path nobody is watching. This work adds
the thing that can see them, proves it fails closed, and pins the rules in tests.

In scope: Firebase Auth identities, their custom claims, their Firestore `users` records,
the demo credential and its rotation, and the git history that published it.
Out of scope: the product's authorization model, the P0-01 environment-isolation contract
(depended on, not modified), and PRs #1011 and #60, which are untouched.

---

## Source-of-truth canonical roster

`lib/demo/users.ts` remains the single source of truth. It is unchanged by this work.

| Email                                 | Role                 |
| ------------------------------------- | -------------------- |
| `demo_admin@bizosto.com`              | `admin`              |
| `demo_sales@bizosto.com`              | `sales`              |
| `demo_sales_manager@bizosto.com`      | `sales_manager`      |
| `demo_am@bizosto.com`                 | `am`                 |
| `demo_am_manager@bizosto.com`         | `am_manager`         |
| `demo_production@bizosto.com`         | `production`         |
| `demo_production_manager@bizosto.com` | `production_manager` |
| `demo_finance@bizosto.com`            | `finance`            |
| `demo_hr@bizosto.com`                 | `hr`                 |
| `demo_client@bizosto.com`             | `client`             |

Tenant: `bizosto-demo`. Ten identities, ten distinct roles, no `super_admin`.
Verified in source: exactly 10 entries, 0 duplicate emails, 0 duplicate roles, 0 privileged
roles. Pinned by `__tests__/ci/p0-02-demo-auth-certification.test.ts`, which also fails if
an eleventh identity is added or any role is changed to `super_admin`.

### Required state for each canonical identity

**Firebase Auth**

| Property        | Required value                                                  |
| --------------- | --------------------------------------------------------------- |
| `email`         | the canonical address                                           |
| `disabled`      | `false`                                                         |
| `emailVerified` | `true`                                                          |
| `displayName`   | the canonical name from `lib/demo/users.ts`                     |
| custom claims   | **exactly** `{ role, tenantId: "bizosto-demo" }` — no other key |

"Exactly" is the load-bearing word. A check that only asserts `role` and `tenantId` are
correct passes an account that has also acquired `super_admin: true`, and that extra key is
precisely the kind of forgotten privilege this P0 exists to find.

**Firestore `users/{uid}`**

`uid`, `email`, `role`, `tenantId: bizosto-demo`, `status: active`, `isDeleted: false`,
`isDemo: true`, `emailVerified: true`, and `clientId` for the client role. These are the
fields `lib/demo/seed.ts` already writes; no new schema requirement was invented.

---

## Historical credential search

Scanned: **the entire object database — 17,599 blobs across 3,214 commits and 1,039 refs**,
reachable and unreachable. Not just `main`, and not just HEAD.

| Scanner                        | Version | Scope                               | Result                              |
| ------------------------------ | ------- | ----------------------------------- | ----------------------------------- |
| gitleaks                       | 8.21.2  | `--log-opts=--all`, redacted        | 13 findings, **0 real credentials** |
| trufflehog                     | 3.82.13 | full git source, all detectors      | 10 findings, **0 real credentials** |
| targeted object-database sweep | —       | every blob, 20 credential patterns  | **1 real credential**               |
| targeted pickaxe               | —       | 14 weak-password literals, all refs | 0 credentials                       |

### FINDING — a real demo password was published, and is therefore compromised

| Property                        | Value                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| Type                            | shared golden-tenant demo account password                                         |
| Fingerprint                     | SHA-256 `89f4400c…574572` (recorded in full in `lib/demo/auth-certification.ts`)   |
| Shape                           | 16 characters, mixed case, digits, one symbol                                      |
| Locations                       | `lib/demo/seed.ts` **and** `app/super_admin/demo/page.tsx`                         |
| Introduced                      | `a4fffcf9`, 2026-02-27                                                             |
| Removed from HEAD               | `ae1c63de` — _"fix(pr6): remove demo password from the client bundle"_, 2026-09-06 |
| Reachable from `main`'s history | **Yes**                                                                            |
| Repository visibility           | **Public**                                                                         |
| Exposure window                 | ~6 months                                                                          |

The second location is the aggravating one: `app/super_admin/demo/page.tsx` is a client
component, so the credential was compiled into the browser bundle and served to every
visitor of that page, not merely readable by anyone who cloned the repository.

**Removing it from HEAD is not remediation.** The value remains readable in git history by
anyone, and the repository is public. The only remediation is to rotate the credential on
the accounts that carry it, revoke the sessions it minted, and prove the old value no
longer authenticates. That is what `--mode=remediate --prove-historical-rejected` does, and
it is why P0-02 cannot be closed by a code review.

The value is recorded **only by digest**. `scripts/certify-demo-auth.ts` recovers the
candidate from the repository's own object database at run time, checks it against the
recorded SHA-256, tests it against all ten identities, and asserts every attempt is refused.
It never writes the value to disk, to a log, or to this document.

### The other 22 findings, and why they are not credentials

- **8 × `ai-byok-crypto.test.ts`** — a self-describing 32-byte hex test key on a line
  commented _"never a real key"_. Encrypts nothing outside the test process.
- **1 × `firebase-environment-isolation.test.ts`** — a PEM header and footer with the
  words "NEVER-IN-OUTPUT" between them. No key material. (New fixtures added by this work
  deliberately avoid a PEM header at all, so they cost no future sweep an adjudication.)
- **10 × vendored `functions/node_modules/**`** — placeholder examples in third-party
  README and `.d.ts` files (`<KEY>`, `xxxxxxx`, `your-project-id`) and one regex.
- **1 × `lib/firebaseClient.ts` @ `747b49c1`** — a hard-coded Firebase **Web** API key.
  Not on `main`. A Firebase Web API key is a public identifier by design: it ships in every
  browser's Firebase config, and access control comes from Security Rules and Auth, not from
  its secrecy. Current `main` fetches it from `/api/public/firebase-config` at runtime.
- **1 × `firebase-debug.log` @ `fe1ad42d`** — an **incomplete** `firebase login` device
  flow. Contains a session id, a PKCE `code_challenge` (public by design) and a short-lived
  `auth.firebase.tools` attestation token issued 2026-02-09. Verified to contain **no**
  `refresh_token`, `access_token`, `id_token`, `client_secret` or private key — the flow
  never completed in the captured output. Not reachable from `main`; the path is gitignored
  at HEAD. Reachable from 662 stale branches, which is untidy rather than dangerous.
- **1 × `github-main-protection-certification.test.ts`** — see the note below.

### Methodological warning: trufflehog's GitHub `verified` flag is unusable here

Trufflehog reported **1 verified GitHub credential** for user `lacreativodesign` with a real
expiry. It is a **false positive**, proven by control experiment: a token consisting of 36
literal `Z` characters "verifies" with the _identical_ account and _identical_ expiry. The
sandbox's outbound HTTPS proxy injects the session's own GitHub credentials into
`api.github.com` requests, so every GitHub token trufflehog tests comes back verified with
the proxy's identity rather than the token's.

The underlying literal is independently provable as synthetic — it is
`ghp_thisIsNotARealToken` followed by padding: a 37-character body (a real classic PAT body
is 36) containing **zero digits**, 15 distinct characters, and one character repeated 19
times. It is a fixture in a test that asserts tokens never leak into logs.

Two consequences worth recording. First, **no GitHub-token verification performed from this
environment should be believed**, in this task or a future one; classification must rest on
structure or on a scan run outside the proxy. Second, the fixture uses a realistic `ghp_`
prefix, which is what made it collide with a detector at all — new fixtures in this
repository should not (that file belongs to PR #1011 and was not modified here).

### Also verified absent

No `.env` file has ever been committed on any ref — only `.env.example` and
`.env.local.example`. No service-account JSON, no `.pem`/`.key`/`.p12`, and no screenshots;
the only image files ever added are three app icons.

### Rotation status

| Credential                  | Action                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| Demo golden-tenant password | **ROTATION REQUIRED — owner action.** Rotate `E2E_DEMO_PASSWORD`, then run `certify-remediate`. |
| Firebase service accounts   | None required — none was ever committed.                                                        |
| GitHub / Vercel tokens      | None required — none was ever committed.                                                        |
| Firebase Web API key        | Not a secret. No rotation required.                                                             |

---

## Production result

**Firebase project: `la-creativo-erp` — NOT CERTIFIED — OWNER ACTION REQUIRED.**

No Firebase Admin credential for this project was reachable from the environment this work
was performed in, so no Auth page was inspected and no identity was mutated. Every live
figure below is therefore unknown, and is recorded as unknown rather than as zero.

| Measure                          | Result                        |
| -------------------------------- | ----------------------------- |
| Live Admin access available      | **No**                        |
| Total Auth users inspected       | 0 — not measured              |
| Canonical demo users found       | not measured                  |
| Enabled noncanonical demo users  | **not measured** — not "zero" |
| Disabled noncanonical demo users | not measured                  |
| Canonical claim drift            | not measured                  |
| Firestore/Auth mismatch          | not measured                  |
| Orphan Firestore demo records    | not measured                  |
| Password rotations               | 0                             |
| Refresh-token revocations        | 0                             |
| Current-password sign-ins        | 0 / 10                        |
| Historical password accepted     | **not measured**              |

## Staging result

**Firebase project: `bizosto-staging` — NOT CERTIFIED — OWNER ACTION REQUIRED.**

Identical position, for the identical reason: `FIREBASE_ADMIN_KEY_STAGING` was not
reachable. All measures are unknown, as above.

---

## Legacy account inventory

Not measured in either project — see above. The classifier that will produce it, and the
policy it applies, are implemented and tested.

### How an identity is classified

Evidence is graded, because the grade decides whether an account may be **touched**:

| Evidence                                                 | Strength                | Permits mutation                |
| -------------------------------------------------------- | ----------------------- | ------------------------------- |
| exact canonical email                                    | canonical               | rotate + revoke + reset claims  |
| custom claim `tenantId == bizosto-demo`                  | strong                  | disable + revoke                |
| Firestore `users` record with `tenantId == bizosto-demo` | strong                  | disable + revoke                |
| Firestore `users` record with `isDemo == true`           | strong                  | disable + revoke                |
| email matches the demo naming pattern                    | **weak**                | **report only — never mutated** |
| email ends `@bizosto.com`                                | **not evidence at all** | nothing                         |

The last two rows are the safety property. Staff and customers use `@bizosto.com`, so a
classifier that treated the domain as a demo signal would hand a remediating run a list of
real people to disable. And a real person whose local part begins "demo" would match the
naming pattern while a stale fixture at `qa-fixture@bizosto.com` would not — so the pattern
decides what is worth _looking at_, and only recorded state decides what may be _changed_.
Both cases are driven as tests, including a `demo-demopoulos@bizosto.com` lookalike that
must survive a remediating run untouched.

### Policy for a proven legacy account

**Disable + revoke refresh tokens. Never delete.**

Phase 5 permits deletion only when the run can _also_ prove no real tenant data depends on
the account, and a script cannot prove that about a project it is meeting for the first
time. Disabling ends the authentication path immediately and is reversible; deleting is
neither better nor undoable. `scripts/certify-demo-auth.ts` contains no `deleteUser` call —
absent by construction, not merely unused, and asserted so by test.

---

## Remediation performed

**In this repository — complete.** The controls below are implemented and green.

| Change                                                                      | File                                                  |
| --------------------------------------------------------------------------- | ----------------------------------------------------- |
| Certification contract: classification, planning, verdict, secret-guard     | `lib/demo/auth-certification.ts`                      |
| Live tool: full-pagination inventory, rotate, revoke, exact claims, disable | `scripts/certify-demo-auth.ts`                        |
| 62 drift-prevention tests, 13/13 mutations killed                           | `__tests__/ci/p0-02-demo-auth-certification.test.ts`  |
| Dedicated live workflow                                                     | `.github/workflows/demo-auth-certification.yml`       |
| Pre-merge dispatchable certification                                        | `.github/workflows/seed-golden-tenant.yml`            |
| Certification tool brought under typecheck                                  | `tsconfig.scripts.json`, `.github/workflows/test.yml` |

**In Firebase — none.** No live action was taken in either project.

---

## Password rotation result

Not performed — 0 / 10 in both projects.

When `--mode=remediate` runs it sets each canonical account's password from
`E2E_DEMO_PASSWORD` (minimum 16 characters, surrounding whitespace rejected rather than
trimmed), re-enables the account, verifies its email, restores the canonical display name,
and writes **exactly** the two intended claims. Claims are written whole rather than spread
over what was there, which is what removes a stale `super_admin` instead of preserving it.

Production and staging currently share one `E2E_DEMO_PASSWORD`. That is the existing
architecture and this work did not invent a second secret for it. Assessment: with the
projects isolated by P0-01 and the accounts distinct, a shared demo password is a
**low-severity** residual — a single value compromises the demo tenant in both environments
at once. Recommended as follow-up hardening, not as part of this P0.

## Token revocation result

Not performed — 0 / 10 in both projects.

What revocation will prove, stated precisely so the claim is not overstated:
`revokeRefreshTokens(uid)` sets `tokensValidAfterTime`. It does **not** invalidate an
already-issued ID token at the moment of the call; Firebase's documented semantics let an
outstanding ID token remain cryptographically valid until it expires, unless the verifier
checks revocation.

Bizosto's session layer does check. Every server-side entry point verifies with
`checkRevoked = true`:

- `app/api/session-login/route.ts` — `verifyIdToken(idToken, true)`
- `lib/tenant/server.ts`, `lib/serverAuth.ts`, `app/page.tsx`, `app/api/client/_utils.ts` —
  `verifySessionCookie(cookie, true)`

So a session minted before the rotation is rejected on its next server-side check. **No gap
was found, and nothing in the auth architecture needed changing.** The ordering inside the
tool matters for the same reason and is asserted by test: the password is written _first_
and the revocation issued _after_, because revoking first would leave a window in which a
session minted on the old password stayed valid.

## Claim consistency result

Not measured. The contract is implemented: exactly `{ role, tenantId }`, any additional key
reported as drift and removed on remediation.

## Firestore/Auth consistency result

Not measured. The contract is implemented: each canonical Auth identity is matched against
`users/{uid}` on email, role, tenant, status, `isDeleted`, `isDemo` and `emailVerified`, and
`bizosto-demo` Firestore records with no surviving Auth identity are counted as orphans. No
cross-tenant mutation is possible: only `bizosto-demo` records are read or written.

## Sign-in proof

Not performed — 0 / 10 in both projects, and **no historical-password rejection was
proven**. The tool tests all ten roles, not only admin, through the same Identity Platform
endpoint the browser SDK uses. For each it requires the sign-in to succeed, the returned
token's audience to be the intended project, and the `role` and `tenantId` claims to be
canonical. The ID token is decoded in memory for its claim set and discarded; it is never
printed or stored.

---

## Fail-closed behaviour

Verified by execution. Every one of these exits non-zero with a message that contains no
credential material:

| Scenario                                            | Exit |
| --------------------------------------------------- | ---- |
| No credential in the environment                    | 1    |
| `--project` omitted                                 | 1    |
| `--mode` omitted                                    | 1    |
| Credential is not valid JSON                        | 1    |
| Credential's `project_id` ≠ stated `--project`      | 1    |
| Staging named, production credential variable given | 1    |
| Production named, staging credential variable given | 1    |
| Unrecognised argument                               | 1    |
| Unrecognised mode                                   | 1    |

And in the verdict itself: a report whose inventory did not complete **cannot** be
certified, however clean its other numbers are. `--mode=audit` performs no write of any
kind; every mutation lives in the remediate branch, asserted by test.

## Project-isolation proof

Three independent bounds, all fail-closed:

1. **The operator states the project.** `--project` has no default and is never derived
   from the credential. A run that asks the service account where it is pointed can only
   ever agree with itself.
2. **The credential must confirm it.** The tool parses `project_id` — and no other field —
   and aborts before any read or write if it differs from the stated project.
3. **The two credentials may not be crossed.** Staging may not be certified with
   `FIREBASE_ADMIN_KEY`; production may not be certified with `FIREBASE_ADMIN_KEY_STAGING`.
   In the workflows each credential is bound to an expression that yields the empty string
   unless the operator chose that environment, so a staging run does not have the production
   secret in its environment at all — there is nothing for a fallback to fall back to.

P0-01 is depended upon and unmodified. The `seed` job of `Seed Golden Tenant` keeps the
production credential it has always had; the automated smoke gate keeps its staging-only
credential. That invariant was previously asserted as "the file never mentions the staging
key", which the new certification job made untrue; it is now asserted **per job**, which is
the property that was always meant and is strictly stronger.

## Workflow security

`workflow_dispatch` only — no `push`, `pull_request` or `pull_request_target` trigger, so
no branch and no fork can reach an Admin credential by opening a PR. `permissions:
contents: read`. Explicit `timeout-minutes` on every job. `concurrency` with
`cancel-in-progress: false`, because cancelling a half-finished rotation would leave
accounts on mixed passwords. Credentials scoped to the single step that needs them, so
`npm ci` never sees one. No secret is echoed, no artefact is uploaded, no credential is
written to a file in the workspace, and no `continue-on-error` is used. No new PAT and no
new long-lived credential were introduced. All of this is asserted against a real YAML
parse rather than a text match — DS-33 is the precedent: a job-level `if:` reading the
`secrets` context once made GitHub reject an entire workflow file, and every run completed
with zero jobs for three days.

---

## Unresolved owner actions

### 1. Rotate `E2E_DEMO_PASSWORD` — required, and required _first_

The current value must be treated as the one that may still be on the accounts. Choose a
new value of at least 16 characters with no leading or trailing whitespace, and set it in
**both** stores from the same source:

- the GitHub Actions secret `E2E_DEMO_PASSWORD`,
- the Vercel environment variable of the same name.

A pasted trailing newline is the usual failure and neither settings page shows it; the
shared policy rejects it rather than silently trimming, so a mismatch fails loudly.

### 2. Dispatch the live certification

Audit first — it is read-only and answers the question this P0 was opened to ask. Both
dispatches must target **this PR's ref**, not `main`.

**Actions → Seed Golden Tenant → Run workflow**

| Field                 | Production        | Staging           |
| --------------------- | ----------------- | ----------------- |
| Use workflow from     | this PR's branch  | this PR's branch  |
| `action`              | `certify-audit`   | `certify-audit`   |
| `firebase_project_id` | `la-creativo-erp` | `bizosto-staging` |
| `credential`          | `production`      | `staging`         |
| `reset`               | ignored           | ignored           |

Then, once the audit output has been read and the legacy list is understood, re-dispatch
each with `action: certify-remediate`. That run rotates the ten canonical passwords, revokes
their refresh tokens, restores exact claims, disables proven legacy demo identities, signs
all ten in, and proves the published historical credential is refused.

This workflow is used rather than the dedicated one because a new workflow file cannot be
dispatched against a feature ref until it exists on the default branch.
`.github/workflows/demo-auth-certification.yml` is the permanent home and takes over after
merge; both drive the same tool.

### 3. Repository secrets the run needs

`FIREBASE_ADMIN_KEY` (production), `FIREBASE_ADMIN_KEY_STAGING` (staging) and
`E2E_DEMO_PASSWORD` are existing contracts. Sign-in proof additionally needs the project's
Firebase **Web** API key as `FIREBASE_WEB_API_KEY` (production) and
`FIREBASE_WEB_API_KEY_STAGING` (staging). A Web API key is a public identifier — it ships in
every browser — but it is held as a secret so the two environments cannot be confused for
one another. Without it the tool reports that it could not prove the ten identities
authenticate, rather than claiming that they do.

### 4. Consider separating the demo password per environment

Low severity, recommended as follow-up. See _Password rotation result_.

### 5. Optional: prune stale branches carrying `firebase-debug.log`

662 branches carry commit `fe1ad42d`. The file holds no durable credential, so this is
hygiene, not remediation.

---

## What "certified" will require

For either project to be called CERTIFIED, a live run must show: all Auth pages inspected;
the canonical ten accounted for; **zero** enabled noncanonical demo identities; exact
canonical role and tenant claims; no Firestore/Auth drift; ten password rotations; ten
refresh-token revocations; ten successful sign-ins with the current credential; **zero**
acceptances of the published historical credential; and the project identity verified before
anything was touched.

Code inspection is not live proof, and this document does not present it as any.
