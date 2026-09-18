# P0-02 — Demo Firebase Auth identities: certification and hardening

**Status: CERTIFIED — production and staging, on live Firebase Admin evidence.**

Both projects were inventoried, remediated and proven by dispatched workflow runs against
this PR's own ref. The decisive result: the demo password that was **published in this
repository's public git history** for six months is recovered from the object database at
run time and **refused by all ten canonical identities in both projects**, while all ten
authenticate with the configured credential.

|                                            | `la-creativo-erp` | `bizosto-staging` |
| ------------------------------------------ | ----------------- | ----------------- |
| Auth identities inspected                  | 14 (all pages)    | 10 (all pages)    |
| Canonical demo users                       | **10 / 10**       | **10 / 10**       |
| Enabled noncanonical demo users            | **0**             | **0**             |
| Claim drift · Firestore mismatch · orphans | **0 · 0 · 0**     | **0 · 0 · 0**     |
| Password rotations                         | **10**            | **10**            |
| Refresh-token revocations                  | **10**            | **10**            |
| Current-password sign-ins                  | **10 / 10**       | **10 / 10**       |
| Published historical password accepted     | **0**             | **0**             |

P0-02 fails closed, and that applies to this document as much as to the tool: **an inventory
nobody could take is not an inventory of zero legacy accounts — and a proof nobody attempted
is not a proof that passed.** Both of those rules were earned; see
[the fail-open the first runs exposed](#the-fail-open-those-runs-exposed-and-the-fix).

Every figure above came out of a dispatched workflow run against a real Firebase project.
The certifying runs were dispatched against commit `6785c67c`, the last commit on this
branch that changes any code — the only commit after it is this document. Each project was
re-certified after every code change rather than once at the start, and the runs that
preceded them, including the two that got the verdict wrong, are linked alongside rather
than quietly dropped.

One owner action remains, and it is a hardening recommendation rather than an open defect:
see [Unresolved owner actions](#unresolved-owner-actions).

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

**Firebase project: `la-creativo-erp` — CERTIFIED.**

Live evidence, dispatched against this PR's ref with the production Admin credential, whose
`project_id` was verified against the stated project before anything was read or written.

| Measure                                  | Result                                     |
| ---------------------------------------- | ------------------------------------------ |
| Live Admin access available              | **Yes**                                    |
| Total Auth users inspected               | **14**, across 1 page (every page walked)  |
| Canonical demo users found               | **10 / 10**                                |
| Enabled noncanonical demo users          | **0**                                      |
| Disabled noncanonical demo users         | **0**                                      |
| Suspected-demo (reported, never mutated) | **0**                                      |
| Canonical claim drift                    | **0**                                      |
| Canonical disabled / unverified email    | **0 / 0**                                  |
| Firestore/Auth mismatch                  | **0**                                      |
| Orphan Firestore demo records            | **0**                                      |
| Password rotations                       | **10**                                     |
| Refresh-token revocations                | **10**                                     |
| Current-password sign-ins                | **10 / 10**                                |
| Published historical password accepted   | **0** (1 candidate tested against all ten) |

Certifying run: [remediate 35292887357](https://github.com/lacreativodesign/nextjs-boilerplate/actions/runs/35292887357),
on `6785c67c`. Earlier runs on the same branch, kept because they are part of the record:
[audit 35288757593](https://github.com/lacreativodesign/nextjs-boilerplate/actions/runs/35288757593)
· [audit after the fail-open fix 35289453869](https://github.com/lacreativodesign/nextjs-boilerplate/actions/runs/35289453869)
· [remediate 35289587921](https://github.com/lacreativodesign/nextjs-boilerplate/actions/runs/35289587921)
· [remediate 35291599056](https://github.com/lacreativodesign/nextjs-boilerplate/actions/runs/35291599056)
· [remediate 35291903896](https://github.com/lacreativodesign/nextjs-boilerplate/actions/runs/35291903896).

## Staging result

**Firebase project: `bizosto-staging` — CERTIFIED.**

Same tool, same day, staging credential — and at no point the production one.

| Measure                                | Result                |
| -------------------------------------- | --------------------- |
| Live Admin access available            | **Yes**               |
| Total Auth users inspected             | **10**, across 1 page |
| Canonical demo users found             | **10 / 10**           |
| Enabled noncanonical demo users        | **0**                 |
| Canonical claim drift                  | **0**                 |
| Firestore/Auth mismatch                | **0**                 |
| Orphan Firestore demo records          | **0**                 |
| Password rotations                     | **10**                |
| Refresh-token revocations              | **10**                |
| Current-password sign-ins              | **10 / 10**           |
| Published historical password accepted | **0**                 |

Certifying run: [remediate 35292995466](https://github.com/lacreativodesign/nextjs-boilerplate/actions/runs/35292995466),
on `6785c67c`. Earlier runs:
[audit 35288764089](https://github.com/lacreativodesign/nextjs-boilerplate/actions/runs/35288764089)
· [remediate 35289746586](https://github.com/lacreativodesign/nextjs-boilerplate/actions/runs/35289746586)
· [remediate 35291709914](https://github.com/lacreativodesign/nextjs-boilerplate/actions/runs/35291709914)
· [remediate 35292015320](https://github.com/lacreativodesign/nextjs-boilerplate/actions/runs/35292015320).

Staging holds exactly the ten canonical identities and nothing else. The isolation P0-01
established is visible in the numbers: 10 identities in staging against 14 in production,
and the two were never reachable from one credential.

### The fail-open those runs exposed, and the fix

The **first** two live runs printed "P0-02 CERTIFIED for this project" while they had signed
nobody in and tested the published password against nothing.

No Firebase Web API key had been configured, so the sign-in block returned early and
`currentPasswordSignIns` and `historicalCandidatesTested` both stayed at **0** — which is
exactly what a perfect run reports too. The verdict could not tell "all ten authenticate"
from "nobody asked them to", and certified on the inventory alone.

That is the same fail-open the rest of this work exists to prevent — _no access to Firebase
is not zero legacy users_ — one level down: **a proof that was never attempted is not a proof
that passed.** Two changes close it:

1. the report now states separately whether a sign-in was **attempted** and whether the
   historical proof was **requested**, and the verdict refuses to certify a run that proved
   neither. Nine of ten sign-ins and no sign-in at all now produce different reasons,
   because they are different facts;
2. the tool resolves the Web API key itself — from explicit configuration if present,
   otherwise from the Firebase Management API using the Admin credential it already holds
   and already verified. A Web API key is a public identifier that ships in every browser,
   so this adds no secret and removed the owner action that would otherwise have been
   needed.

Three mutation tests hold the fix in place. It is recorded here rather than quietly fixed
because the defect was found by _running_ the thing against real projects — which is the
whole argument for requiring live evidence over a code review, and the reason the certified
figures above are worth more than the first pair.

---

## Legacy account inventory

**Measured, and empty in both projects.**

| Project           | Enabled legacy | Disabled legacy | Suspected-demo | Orphan Firestore |
| ----------------- | -------------- | --------------- | -------------- | ---------------- |
| `la-creativo-erp` | **0**          | 0               | 0              | 0                |
| `bizosto-staging` | **0**          | 0               | 0              | 0                |

Production holds 14 Auth identities: the ten canonical demo accounts and four others that
carry no `bizosto-demo` claim, no `bizosto-demo` Firestore record and no demo-shaped
address. They are real accounts, and the classifier left every one of them alone — which is
the property that matters most in a tool that can disable things.

Nothing was disabled, revoked or deleted as legacy, because nothing qualified. The ten
canonical identities were rotated and revoked, which is a different action on a different
set.

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

**In this repository** — the controls below are implemented, tested and green.

| Change                                                                      | File                                                  |
| --------------------------------------------------------------------------- | ----------------------------------------------------- |
| Certification contract: classification, planning, verdict, secret-guard     | `lib/demo/auth-certification.ts`                      |
| Live tool: full-pagination inventory, rotate, revoke, exact claims, disable | `scripts/certify-demo-auth.ts`                        |
| Drift-prevention tests; 16/16 injected mutations killed                     | `__tests__/ci/p0-02-demo-auth-certification.test.ts`  |
| Dedicated live workflow                                                     | `.github/workflows/demo-auth-certification.yml`       |
| Pre-merge dispatchable certification                                        | `.github/workflows/seed-golden-tenant.yml`            |
| Certification tool brought under typecheck                                  | `tsconfig.scripts.json`, `.github/workflows/test.yml` |

**In Firebase** — performed against both projects, by dispatched workflow run:

| Action                                           | `la-creativo-erp`              | `bizosto-staging`    |
| ------------------------------------------------ | ------------------------------ | -------------------- |
| Canonical passwords set from `E2E_DEMO_PASSWORD` | 10                             | 10                   |
| Refresh tokens revoked                           | 10                             | 10                   |
| Claims rewritten to exactly `{ role, tenantId }` | 10                             | 10                   |
| Accounts re-enabled / emails verified            | 10 (already correct)           | 10 (already correct) |
| Legacy identities disabled                       | 0 — none existed               | 0 — none existed     |
| Accounts deleted                                 | **0** — the tool cannot delete | **0**                |
| Non-demo accounts touched                        | **0**                          | **0**                |

## Password rotation result

**10 / 10 in both projects.**

Each canonical account's password was set from `E2E_DEMO_PASSWORD` (minimum 16 characters,
surrounding whitespace rejected rather than trimmed), the account re-enabled, its email
verified, its canonical display name restored, and **exactly** the two intended claims
written. Claims are written whole rather than spread over what was there, which is what
removes a stale `super_admin` instead of preserving it.

**What this rotation did and did not change.** The ten accounts already carried the
configured `E2E_DEMO_PASSWORD` — all ten signed in with it before the write. So the rotation
re-asserted the value rather than replacing it; what it added was the revocation below and a
guaranteed-exact claim set. The credential **value** can only be changed by the owner, in the
two stores that hold it, which is why that remains the one open recommendation.

The important question — whether the _published_ password still works — is answered
separately and definitively: it does not, in either project.

Production and staging share one `E2E_DEMO_PASSWORD`. That is the existing architecture and
this work did not invent a second secret for it. Assessment: with the projects isolated by
P0-01 and the accounts distinct, a shared demo password is a **low-severity** residual — a
single value compromises the demo tenant in both environments at once. Recommended as
follow-up hardening, not as part of this P0.

## Token revocation result

**10 / 10 in both projects.**

What that proves, stated precisely so the claim is not overstated:
`revokeRefreshTokens(uid)` sets `tokensValidAfterTime`. It does **not** invalidate an
already-issued ID token at the moment of the call; Firebase's documented semantics let one
remain cryptographically valid until it expires, _unless the verifier checks revocation_.

Bizosto's session layer does check. Every server-side entry point verifies with
`checkRevoked = true`:

- `app/api/session-login/route.ts` — `verifyIdToken(idToken, true)`
- `lib/tenant/server.ts`, `lib/serverAuth.ts`, `app/page.tsx`, `app/api/client/_utils.ts` —
  `verifySessionCookie(cookie, true)`

So a demo session minted before the rotation is rejected on its next server-side check.
**No gap was found, and nothing in the auth architecture needed changing** — which is the
right outcome for a P0 that was explicitly told not to expand into unrelated auth work.

Ordering matters for the same reason and is asserted by test: the password is written
**first** and the revocation issued **after**, because revoking first would leave a window in
which a session minted on the old password stayed valid.

## Claim consistency result

**0 drift in both projects, before and after.**

Every canonical identity carried exactly `{ role, tenantId: "bizosto-demo" }` at audit time,
and the remediation rewrote that set whole regardless. No demo identity carries a
`super_admin`, module or any other residual claim in either project.

## Firestore/Auth consistency result

**0 mismatches, 0 orphans, in both projects.**

Each canonical Auth identity was matched against `users/{uid}` on email, role, tenant,
status, `isDeleted`, `isDemo` and `emailVerified`; every one agreed. No `bizosto-demo`
Firestore record exists without a surviving Auth identity behind it. No cross-tenant
mutation is possible: only `bizosto-demo` records are read or written.

## Sign-in proof

**10 / 10 in both projects, and the published historical credential is refused by all
twenty accounts.**

All ten roles were tested — not only admin — through the same Identity Platform endpoint the
browser SDK uses, so a pass establishes the authentication path that actually serves users
rather than a substitute for it. For each, the run required the sign-in to succeed, the
returned token's audience to be the intended project, and the `role` and `tenantId` claims to
be canonical. The ID token was decoded in memory for its claim set and discarded; it was
never printed or stored.

The historical proof is the one that closes P0-02. The candidate is recovered from this
repository's own object database at run time, checked against the SHA-256 recorded in
`lib/demo/auth-certification.ts`, and tried against all ten identities:

```
tested published candidate sha256:89f4400c532a against all 10 identities
historical credentials accepted: 0
```

Identical in both projects. The credential that was public for six months does not
authenticate anywhere.

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

**None blocking.** P0-02 is certified for both projects on live evidence. What follows is
hardening, in priority order.

### 1. Rotate `E2E_DEMO_PASSWORD` to a value this repository has never held — recommended

The published credential is proven dead, so this is defence in depth rather than incident
response. The current value is not in git history (no scanner found it, and it is not the
historical one — the historical one is refused while this one works), but it has existed
across the whole period the fixture was being debugged, so a fresh value costs nothing.

Choose ≥16 characters with no leading or trailing whitespace, and set it in **both** stores
from the same source:

- the GitHub Actions secret `E2E_DEMO_PASSWORD`,
- the Vercel environment variable of the same name.

A pasted trailing newline is the usual failure and neither settings page shows it; the shared
policy rejects it rather than silently trimming, so a mismatch fails loudly rather than
looking like a wrong password. Then re-dispatch `certify-remediate` for both projects to put
the new value on the accounts and revoke again.

### 2. Separate the demo password per environment — recommended, low severity

Production and staging share one value. See [Password rotation result](#password-rotation-result).

### 3. Re-certify after merge, from the permanent workflow

`.github/workflows/demo-auth-certification.yml` becomes dispatchable once this PR is on
`main`. It drives the same tool and is where routine re-certification belongs; the
`certify-*` actions on `Seed Golden Tenant` exist because a new workflow cannot be dispatched
against a feature ref, and can stay as the pre-merge path for future PRs.

### 4. Optional hygiene: prune stale branches carrying `firebase-debug.log`

662 branches carry commit `fe1ad42d`. The file holds no durable credential — verified above —
so this is tidiness, not remediation.

### How to re-run a certification

**Actions → Seed Golden Tenant → Run workflow** (or **P0-02 Demo Auth Certification** after
merge), against the ref you want to certify:

| Field                 | Production                             | Staging           |
| --------------------- | -------------------------------------- | ----------------- |
| `action`              | `certify-audit` or `certify-remediate` | same              |
| `firebase_project_id` | `la-creativo-erp`                      | `bizosto-staging` |
| `credential`          | `production`                           | `staging`         |

`certify-audit` is read-only. `certify-remediate` rotates, revokes, restores exact claims and
disables proven legacy identities; it never deletes. Crossing a project with the other
environment's credential is refused before anything is read.

---

## What certification required, and what was shown

For either project to be called CERTIFIED, a live run had to show: all Auth pages inspected;
the canonical ten accounted for; **zero** enabled noncanonical demo identities; exact
canonical role and tenant claims; no Firestore/Auth drift; ten password rotations; ten
refresh-token revocations; ten successful sign-ins with the current credential; **zero**
acceptances of the published historical credential; and the project identity verified before
anything was touched.

Both projects showed all eleven. The figures are reproduced above with links to the runs that
produced them.

Code inspection is not live proof, and nothing here rests on any: every number in this
document came out of a dispatched workflow run against a real Firebase project, and the two
runs that tried to certify without proving anything are recorded alongside the ones that did.
