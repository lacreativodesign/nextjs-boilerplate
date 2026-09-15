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
to start. That is the invariant, and it means **one** value has to be confirmed in Vercel
before merge, because it is the only part of the contract not visible from outside a
deployment:

- **`FIREBASE_STORAGE_BUCKET` on the Production environment** must be either unset or
  exactly `la-creativo-erp.firebasestorage.app`. It is an optional server-side override
  read by `lib/storage/bucket.ts` and it decides where Admin SDK writes land, which is why
  it is inside the boundary. If it names a different bucket today, production uploads
  already disagree with what browsers are told — and after this change production fails
  closed rather than continuing with the disagreement.

Also confirm neither `STAGING_FIREBASE_PROJECT_ID` nor `STAGING_FIREBASE_STORAGE_BUCKET`
is set on Production. They are ignored there, but a stray value invites the wrong edit
later.

The other three production values are already established from outside the deployment:

- **Browser project and bucket** — `GET https://app.bizosto.com/api/public/firebase-config`
  returns `la-creativo-erp` and `la-creativo-erp.firebasestorage.app`.
- **Admin project** — the golden tenant gate seeds through `assertIntendedFirebaseProject`,
  which aborts unless the Admin key's `project_id` equals the project the deployment
  serves. Its last green run therefore establishes the production key is `la-creativo-erp`.

After merge, the deployment says so itself: `GET https://app.bizosto.com/api/health` must
report `firebase.isolation: "ok"` with `browserProjectId` and `adminProjectId` both
`la-creativo-erp`.

---

## OWNER ACTION — required before Preview certification can run

**No isolated staging Firebase project existed when this was written.** No project id or
bucket name is invented anywhere in this change: the contract requires the owner to
declare them, and fails closed until they are declared. Every `<placeholder>` below must
be replaced with the real value once the project exists.

Until this is done, Vercel Preview deployments of this branch will **refuse to boot**, and
`.github/workflows/smoke.yml` will **refuse to run**. That is the correct fail-closed
result, not a regression to work around. Do not point Preview back at
`la-creativo-erp` to make it green.

### 1. Create the staging Firebase/GCP project

- A **separate** Firebase project, e.g. named for staging rather than reusing
  `la-creativo-erp`. Record its project id as `<staging-project-id>`.
- **Firebase Authentication** → enable the **Email/Password** provider. The golden tenant
  gate signs in through Identity Platform; without it every run fails
  `PASSWORD_LOGIN_DISABLED`.
- **Firestore** → create the database. Deploy the same `firestore.rules` and
  `firestore.indexes.json` this repository already holds, so staging enforces the same
  rules production does.
- **Cloud Storage** → create the default bucket. Record it as `<staging-bucket>`; for a
  current project this is `<staging-project-id>.firebasestorage.app`. Deploy
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
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`         | `<staging-project-id>.firebaseapp.com`            |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID`          | `<staging-project-id>`                            |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`      | `<staging-bucket>`                                |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | staging web app `messagingSenderId`               |
| `NEXT_PUBLIC_FIREBASE_APP_ID`              | staging web app `appId`                           |
| `FIREBASE_ADMIN_KEY`                       | the **staging** service-account JSON, single line |
| `STAGING_FIREBASE_PROJECT_ID`              | `<staging-project-id>`                            |
| `STAGING_FIREBASE_STORAGE_BUCKET`          | `<staging-bucket>`                                |

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
and `firebase.adminProjectId` both `<staging-project-id>`, and `firebase.violations: []`.
Add `-H "x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET"` while the
deployment is protected.

Then dispatch `Actions -> E2E Smoke (per-role + golden tenant)` with `target_url` set to
that exact Preview URL.
