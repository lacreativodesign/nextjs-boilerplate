# Firebase Environment Isolation (P0-01)

Production and Vercel Preview/staging must never share a Firebase project, Firestore
database, Auth tenant or Storage bucket.

## What was wrong

Measured against `main` at `da41e8d1f223c1aa2ca6b1ccaa43167dab195519`, the Vercel Preview
deployment for PR #1008 answered `/api/public/firebase-config` with:

```json
{ "projectId": "la-creativo-erp", "storageBucket": "la-creativo-erp.firebasestorage.app" }
```

That is byte-identical to the answer from `https://app.bizosto.com`. There is one Vercel
project and one set of Firebase environment variables, so every Preview served the
**production** Firebase project to every browser.

Nothing in the codebase objected. `lib/env.ts` accepted any service account with a
non-empty `project_id`, and the config route returned whatever `NEXT_PUBLIC_FIREBASE_*`
held. The consequences were concrete:

- a write-capable browser/E2E certification run against a Preview wrote into production;
- `.github/workflows/smoke.yml` rebuilt the golden tenant with `--reset`, which deletes
  every `bizosto-demo` document in nine collections, using the **production** service
  account, against a deployment reading the **production** project;
- that workflow also carried a `secret missing -> skip the reseed -> certify anyway`
  branch, so a run could certify a fixture nobody had rebuilt.

## The contract

`lib/firebase/environment.mjs` is the single authoritative contract. It is plain ESM with
JSDoc types because five consumers that do not share a module system have to apply the
identical rule:

| Consumer                                  | What it does with the verdict                           |
| ----------------------------------------- | ------------------------------------------------------- |
| `lib/env.ts` (`assertServerEnv`)          | Refuses to boot a mis-wired runtime                     |
| `lib/firebaseAdmin.ts`                    | Hands out a throwing proxy instead of a writable client |
| `app/api/public/firebase-config/route.ts` | Serves no browser configuration at all                  |
| `app/api/health/route.ts`                 | Reports the non-secret facts CI must name               |
| `scripts/verify-golden-tenant-signin.mjs` | Refuses to seed or certify a non-staging target         |

### Production

The production identity is pinned in the contract and needs no configuration:

- project `la-creativo-erp`
- bucket `la-creativo-erp.firebasestorage.app`

A `VERCEL_ENV=production` runtime must resolve to exactly that pair — browser project,
browser bucket, server-side `FIREBASE_STORAGE_BUCKET` override if set, and the
`project_id` of `FIREBASE_ADMIN_KEY`. Anything else fails closed at boot.

### Vercel Preview

A `VERCEL_ENV=preview` runtime must:

- declare its staging identity through `STAGING_FIREBASE_PROJECT_ID` and
  `STAGING_FIREBASE_STORAGE_BUCKET`, neither of which may be a production identifier;
- serve exactly that project and bucket to browsers;
- hold an Admin service account belonging to that same project.

Hard-pinning the production identifiers as forbidden closes the accident that happened.
Requiring an exact match against a declared staging identity closes the general case: a
Preview pointed at some other tenant-bearing project would pass a "not production" test
and still be wrong.

### Everywhere else

`next build`, jest and a developer machine enforce nothing — there is no environment
boundary to enforce, and the repository's intentional "buildable without live
credentials" behaviour is preserved. The two **boot** surfaces honour that exemption
through `isNonRuntimePhase`. The **route handler deliberately does not**: a phase that is
serving an HTTP request is a runtime, and `next build` serves none, so reading
`NEXT_PHASE` there would let a deployed Preview present itself as a harmless build.

A Vercel runtime whose `VERCEL_ENV` cannot be classified — including one where it has been
deleted — is treated as a violation rather than as "no boundary".

## The mutable certification path

`.github/workflows/smoke.yml` is staging-only by construction:

```
target exact Vercel Preview
  -> deployment proves exact Git SHA            (/api/health commit, from PR #1008)
  -> deployment proves staging project/bucket   (/api/health firebase block)
  -> deployment's server and browsers agree     (adminProjectId == browserProjectId)
  -> CI staging credential proves SAME project  (FIREBASE_ADMIN_KEY_STAGING project_id)
  -> golden tenant reset, in staging only
  -> credential preflight (one real sign-in)
  -> Golden Tenant + per-role Playwright
```

Two independent things make a production write impossible rather than discouraged:

1. **The credential.** The gate is given `FIREBASE_ADMIN_KEY_STAGING`, a service account
   with no access to the production project. There is no fall-back to the production
   secret; if the staging secret is absent the run stops before checkout.
2. **The proof.** `node scripts/verify-golden-tenant-signin.mjs --assert-staging-target`
   refuses to name a project unless all four facts above hold, and `set -euo pipefail`
   makes that refusal end the job before anything is written.

Rebuilding the **production** demo fixture is still possible, deliberately and by hand,
through `Actions -> Seed Golden Tenant`, which keeps the production credential and makes
the operator name the project.

---

## Before merging: confirm the production deployment still boots

This change makes a production runtime that does not resolve to the canonical pair refuse
to start, so all four values it checks have to be right on Production before merge. Three
were already established from outside the deployment, and the first Preview of this branch
established the fourth by refusing to boot and naming it.

**What the branch's own Preview reported** (deployment `dpl_B5hWyR2V143h9wG9c3AkEdtPgxEb`,
commit `caca822`, Vercel runtime log, no secret disclosed):

```
Refusing to serve: this preview deployment does not satisfy the Firebase
environment-isolation contract (P0-01).
  - A Vercel Preview deployment must never serve the production Firebase project
    "la-creativo-erp". ...
  - A Vercel Preview deployment must never serve the production Storage bucket
    "la-creativo-erp.firebasestorage.app".
  - FIREBASE_STORAGE_BUCKET names the production bucket
    "la-creativo-erp.firebasestorage.app" on a Vercel Preview deployment.
  - FIREBASE_ADMIN_KEY is a service account for the production Firebase project
    "la-creativo-erp". ...
  - STAGING_FIREBASE_PROJECT_ID must name the isolated staging Firebase project ...
  - STAGING_FIREBASE_STORAGE_BUCKET must name the isolated staging Storage bucket ...
```

That is the blocker restated from the inside: every one of the four production identifiers
is present on a Preview deployment. It also tells us what Production holds, because there
is no separate staging configuration for those variables to have come from.

| Value                     | How it is established                                                                                                                                                                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser project           | `GET https://app.bizosto.com/api/public/firebase-config` returns `la-creativo-erp`                                                                                                                                                                                               |
| Browser bucket            | the same response returns `la-creativo-erp.firebasestorage.app`                                                                                                                                                                                                                  |
| Admin project             | the golden tenant gate seeds through `assertIntendedFirebaseProject`, which aborts unless the Admin key's `project_id` equals the project the deployment serves; its last green run establishes `la-creativo-erp`. The Preview log above says the same of the key Preview holds. |
| `FIREBASE_STORAGE_BUCKET` | set, to `la-creativo-erp.firebasestorage.app`, per the Preview log above                                                                                                                                                                                                         |

**The one thing left to confirm by hand** is the SCOPE of that last variable in Vercel →
Settings → Environment Variables. A Preview only receives a variable scoped to Preview or
to All Environments, so the value above reached Preview from one of those two. If it is
All Environments, Production carries the same production bucket and boots. If it has been
scoped separately and Production's copy names a different bucket, production uploads
already disagree with what browsers are told, and after this change production fails
closed rather than continuing with the disagreement — so fix the value, do not weaken the
contract.

Also confirm neither `STAGING_FIREBASE_PROJECT_ID` nor `STAGING_FIREBASE_STORAGE_BUCKET`
is set on Production. They are ignored there, but a stray value invites the wrong edit
later.

After merge, the deployment says so itself: `GET https://app.bizosto.com/api/health` must
report `firebase.isolation: "ok"` with `browserProjectId` and `adminProjectId` both
`la-creativo-erp`.

---

## OWNER ACTION — required before Preview certification can run

**The staging project now exists**: `bizosto-staging`, with bucket
`bizosto-staging.firebasestorage.app`. Those identifiers are not typed from memory — they
were read from the Preview deployment itself:

```
GET <preview>/api/public/firebase-config
{ "projectId": "bizosto-staging",
  "storageBucket": "bizosto-staging.firebasestorage.app",
  "authDomain": "bizosto-staging.firebaseapp.com" }
```

It is demonstrably a different project from production: different API key, and messaging
sender id `936585406652` against production's `1091518426177`.

**That response is also the agreement proof.** `/api/public/firebase-config` reaches its
200 path only after `evaluateFirebaseEnvironment()` returns zero violations, and the
deployment booted at all only because `assertServerEnv()` applied the same check. So a 200
carrying staging values establishes every clause at once: `VERCEL_ENV=preview`, both
`STAGING_FIREBASE_*` variables declared and non-production, the browser project and bucket
matching them, the server bucket override agreeing, and the Admin service account
belonging to `bizosto-staging` rather than to production.

The contract itself still hardcodes none of this. `bizosto-staging` appears in
documentation and in Vercel configuration only; `lib/firebase/environment.mjs` reads the
staging identity from `STAGING_FIREBASE_PROJECT_ID` and `STAGING_FIREBASE_STORAGE_BUCKET`,
so pointing Preview at a different staging project is a configuration change and not a
code change. The test fixtures deliberately use a made-up `example-staging-project` for
the same reason: the rules must hold for any declared staging project, not just this one.

Steps 1-3 below are therefore done. **Step 4, the GitHub Actions secret, still has to be
confirmed** — it lives outside Vercel and nothing observable from here can establish it.
Until it exists, `.github/workflows/smoke.yml` stops before checkout, which is the correct
fail-closed result.

**If a Preview ever refuses to boot again, that is the contract working.** Before the
Vercel side was configured, every Preview on this branch answered HTTP 500 and served no
Firebase configuration at all; the runtime log named each violation. The same will happen
if a `STAGING_FIREBASE_*` variable is unset, mis-scoped, or pointed at production. It is
the correct fail-closed result rather than a regression to work around, and the repair is
to fix the staging configuration. **Do not point Preview back at `la-creativo-erp` to make
it green** — that is precisely the condition this change exists to prevent, and it would
put a write-capable browser and a destructive golden tenant reset back on the production
project.

### 1. Create the staging Firebase/GCP project

- A **separate** Firebase project, rather than reusing `la-creativo-erp`. **Done:**
  `bizosto-staging`.
- **Firebase Authentication** → enable the **Email/Password** provider. The golden tenant
  gate signs in through Identity Platform; without it every run fails
  `PASSWORD_LOGIN_DISABLED`.
- **Firestore** → create the database. Deploy the same `firestore.rules` and
  `firestore.indexes.json` this repository already holds, so staging enforces the same
  rules production does.
- **Cloud Storage** → create the default bucket. Recorded as `bizosto-staging.firebasestorage.app`. Deploy
  `storage.rules` to it.
- **Web app** → register one and copy its public config (`apiKey`, `authDomain`,
  `projectId`, `storageBucket`, `messagingSenderId`, `appId`).

Do **not** copy production data into staging. The golden tenant seeder builds the fixture
it needs.

### 2. Create a staging Admin service account

- In the **staging** project: IAM → service account with the roles the seeder needs
  (Firebase Admin SDK Administrator Service Agent, or equivalent Firestore + Auth +
  Storage admin roles). Download its JSON key.
- It must have **no** access to `la-creativo-erp`. That separation, not the code, is what
  makes a production write impossible.

### 3. Vercel → Project `nextjs-boilerplate` → Settings → Environment Variables

Add these scoped to **Preview only** (leave Production untouched):

| Variable                                   | Value                                             |
| ------------------------------------------ | ------------------------------------------------- |
| `NEXT_PUBLIC_FIREBASE_API_KEY`             | staging web app `apiKey`                          |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`         | `bizosto-staging.firebaseapp.com`                 |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID`          | `bizosto-staging`                                 |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`      | `bizosto-staging.firebasestorage.app`             |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | staging web app `messagingSenderId`               |
| `NEXT_PUBLIC_FIREBASE_APP_ID`              | staging web app `appId`                           |
| `FIREBASE_ADMIN_KEY`                       | the **staging** service-account JSON, single line |
| `STAGING_FIREBASE_PROJECT_ID`              | `bizosto-staging`                                 |
| `STAGING_FIREBASE_STORAGE_BUCKET`          | `bizosto-staging.firebasestorage.app`             |

Also confirm Production still holds `la-creativo-erp`,
`la-creativo-erp.firebasestorage.app` and the production `FIREBASE_ADMIN_KEY`, and that
neither `STAGING_FIREBASE_*` variable is set on Production. Environment variable changes
take effect on the next deployment, so redeploy the Preview afterwards.

### 4. GitHub → Settings → Secrets and variables → Actions

| Secret                       | Value                                             |
| ---------------------------- | ------------------------------------------------- |
| `FIREBASE_ADMIN_KEY_STAGING` | the **staging** service-account JSON, single line |

Leave the existing `FIREBASE_ADMIN_KEY` as the production account: `Seed Golden Tenant`
still uses it for the deliberate by-hand production reseed. **Never** set
`FIREBASE_ADMIN_KEY_STAGING` to the production key — the preflight rejects a production
credential by `project_id`, so the run would fail rather than silently target production.

### 5. Verify, without touching production

Against the Preview URL for the commit being certified:

```bash
curl -s "$PREVIEW_URL/api/health" | jq '{commit, vercelEnv, firebase}'
```

Expected: `vercelEnv: "preview"`, `firebase.isolation: "ok"`, `firebase.browserProjectId`
and `firebase.adminProjectId` both `bizosto-staging`, and `firebase.violations: []`.
Add `-H "x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET"` while the
deployment is protected.

Then dispatch `Actions -> E2E Smoke (per-role + golden tenant)` with `target_url` set to
that exact Preview URL.
