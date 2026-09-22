# Golden Tenant E2E Certification

PR6 certifies Bizosto against the dedicated `bizosto-demo` tenant using real browser login and deployment-backed APIs.

## Required secrets, and exactly where each one lives

**Scope is the control here, so "Actions secret" is never used on its own below.** P0-02
moved this gate's credentials out of repository-level Actions secrets and into the GitHub
**`firebase-staging` Environment**, whose deployment branches are restricted to `main`.
GitHub refuses to start the job on any other ref, before a step runs. See
[the P0-02 environment contract](../security/p0-02-demo-auth-certification.md#github-environment-branch-boundary-contract).

**OWNER CONFIGURATION — MUST BE VERIFIED LIVE.** No file in this repository can create that
environment, and no test can prove it exists.

### In the GitHub `firebase-staging` Environment

- `FIREBASE_ADMIN_KEY_STAGING` — the **staging** service account JSON, so the gate can
  rotate the demo Auth accounts to the password it is about to type. Required: without it
  the run stops before checkout. There is no fall-back to the production
  `FIREBASE_ADMIN_KEY`, and supplying the production account here is rejected by the
  preflight rather than silently used.
- `E2E_DEMO_PASSWORD` — shared password for the ten `demo_*` accounts (16 characters
  minimum). The demo password is seeded from the same value the browser suite types — see
  "Prepare the fixture" for why that matters. The same value also belongs in
  `firebase-production`, for the certification and seed workflows.
- `VERCEL_AUTOMATION_BYPASS_SECRET` — only while the target is a protected preview. This
  gate is its only consumer.

### At GitHub repository scope

- `E2E_BASE_URL` — the HTTPS deployment URL being certified. It must be the deployment
  built from the commit under test, not a pinned older preview and not the production
  alias. The gate checks this rather than trusting it, and stops before sending any
  credential if the URL is serving a different commit. It is a URL, not credential
  material, which is why it may stay at repository scope; a job that declares an
  `environment:` reads repository secrets too, so nothing breaks either way.

### Not here at all

The Vercel **Preview environment variables** the deployed app itself reads are a separate
store with separate values. A GitHub job never reads them, and they are not what this
section configures.

Never commit or print the password. The Super Admin demo page intentionally does not display it.

## This gate is staging-only (P0-01)

It rebuilds the golden tenant with `--reset`, which deletes every `bizosto-demo` document
in nine collections. Until P0-01 it did that with the production service account, against
Preview deployments that served the production Firebase project — measured on main
(`da41e8d`), the PR #1008 Preview answered `/api/public/firebase-config` with
`la-creativo-erp` and `la-creativo-erp.firebasestorage.app`.

So the gate now runs only against a Vercel Preview backed by the isolated staging Firebase
project, and only with that project's own service account. Before anything is written it
establishes four facts from the deployment itself: that it is a Preview serving the exact
commit under test, that the project and bucket it serves are not the production ones and
it reports its own isolation as satisfied, that its server writes where its browsers read,
and that this job's credential belongs to that same project.

**A run dispatched at the production URL fails, and that is the intended behaviour.** So
does a run against a Preview whose staging Firebase configuration is missing. Setting up
that configuration is an owner action, documented in full in
[`firebase-environment-isolation.md`](./firebase-environment-isolation.md); do not point
Preview back at the production project to get a green run.

Rebuilding the **production** demo fixture is still available, deliberately and by hand,
through `Actions -> Seed Golden Tenant`, which keeps the production credential and makes
the operator name the project.

## Getting past Vercel Deployment Protection

The Vercel project protects every deployment except custom domains, so a preview URL
serves Vercel's SSO wall instead of the Bizosto login page. That wall has an email
field and no password field, which is why the first certification run failed all
thirteen tests waiting for `input[type="password"]`.

Configure Vercel's supported bypass:

1. Vercel → Project → Settings → Deployment Protection → **Protection Bypass for
   Automation** → generate the secret.
2. Add it as `VERCEL_AUTOMATION_BYPASS_SECRET` in the GitHub **`firebase-staging`
   Environment** — not as a repository-level Actions secret. It is a real credential, and a
   repository-level secret is readable by workflow code on any ref someone selects.

The suite sends that secret once, to the deployment origin only, and exchanges it for
a scoped bypass cookie. It is never sent as a blanket request header, which would leak
it to the app's cross-origin calls (Firebase, Google, Stripe). Playwright traces are
disabled whenever the bypass is in use, because the report artifact is publicly
downloadable on a public repository.

A target on a custom domain is exempt from the protection and needs no bypass secret.

## Prepare the fixture

**The gate does this for itself.** With `FIREBASE_ADMIN_KEY_STAGING` configured,
dispatching the gate proves the deployment under test is the isolated staging environment,
rebuilds the `bizosto-demo` fixture into that project, and rotates the ten demo accounts to
the same `E2E_DEMO_PASSWORD` the browser is about to type. Neither copy of the secret nor
the project can be the odd one out, so the drift below has nowhere to happen. Skip to
"Run the pre-merge gate".

To rebuild the fixture on its own — refreshing demo data, or repairing it outside a
certification run — dispatch **Actions → Seed Golden Tenant** against the PR branch:

- `firebase_project_id` — the Firebase project the deployment serves. Read it from the
  deployment itself rather than from memory: `GET <deployment>/api/public/firebase-config`
  returns the public browser config, and its `projectId` is the one that matters.
- `reset` — leave enabled to rebuild the fixture from scratch.

The job rotates the ten demo Auth accounts to the repository's `E2E_DEMO_PASSWORD` and
re-seeds deterministic fixture IDs. Confirm the printed counts include at least one deal,
invoice, project and client.

**Why not the Super Admin button.** The button seeds from the deployment's own server-side
`E2E_DEMO_PASSWORD`, which is a second copy of the secret kept in step with this
repository's copy by hand. Nothing checked they agreed. When they drifted the gate failed
all thirteen tests with "Incorrect password" — which, with Firebase Email Enumeration
Protection enabled, is also exactly what a missing account looks like, so the message
could not tell an operator which of the two it was. Seeding from the secret the suite
itself types means only one copy decides the outcome. The button still works and remains
the right tool for refreshing demo data by hand.

Two bounds apply to the rebuild and both fail closed:

- the tenant is fixed to `bizosto-demo` inside `lib/demo/seed.ts`, not passed in, so no
  argument can point the delete at another tenant;
- the run aborts before touching anything if `FIREBASE_ADMIN_KEY` targets a project other
  than the one named in the dispatch.

For the automated gate a third bound applies, which is the one that matters most: its
credential is the staging service account, which has no access to the production project
at all.

Reset is tenant-scoped: it deletes only documents belonging to `bizosto-demo` in the demo
collections. In the **production** project, where `Seed Golden Tenant` runs, `bizosto-demo`
shares the project with real tenants, so that tenant filter is the only isolation boundary
— which is why that workflow stays a deliberate, by-hand dispatch. The automated gate does
not rely on it: it runs in a separate Firebase project with a credential that cannot reach
production.

## Run the gate — from `main` only

Dispatch `.github/workflows/smoke.yml`. It is the only golden tenant gate: PR6 briefly
carried a second, identical `golden-e2e.yml`, and two dispatchable copies meant every guard
had to be added twice.

**This is no longer a pre-merge gate, and that is deliberate.** It used to be dispatched at
a PR ref to certify that PR's Preview. Dispatching a secret-bearing workflow at a chosen ref
runs the workflow file _from that ref_, which is how branch-selected code reached a staging
Admin credential — Defect 4 of the P0-02 audit. The `firebase-staging` environment now
restricts this job to `main`, and `EXPECTED_COMMIT_SHA` is `main`'s commit, so a Preview
built from an unmerged branch cannot satisfy the exact-SHA proof.

To certify a change: merge it, then dispatch from `main` with `target_url` set to the
staging Preview for that commit.

The workflow fails before checkout if the dispatch is not from `main`, if either required
credential is missing from the environment, or if `E2E_BASE_URL` is not HTTPS. It then rebuilds the fixture (see above) and signs one demo
account in against the deployment before the browser suite starts:

```bash
node scripts/verify-golden-tenant-signin.mjs --assert-staging-target   # before any write
node scripts/verify-golden-tenant-signin.mjs                           # before the suite
```

That check asks the deployment which Firebase project it serves and signs in through the
same Identity Platform endpoint the browser SDK uses, so a fixture seeded into a different
project than the deployment reads is a ten-second failure with the real reason instead of
twenty minutes of ambiguous ones. It is a precondition, never a substitute: the suite
still performs all thirteen real browser logins itself. It then runs:

```bash
npx playwright test e2e/golden e2e/smoke
```

Certification requires:

- real login for all ten seeded roles;
- representative pages for each role load without 4xx/5xx or application error banners;
- the admin can see real lead → deal → invoice → project → client fixture data;
- the linked client can see its delivery project;
- the client cannot enter internal finance;
- finance can read invoices but cannot enter Admin client management.

A skipped authenticated suite is not a pass.

## Evidence

Record the exact PR head SHA, workflow run ID and Vercel deployment used. The run must
correspond to the same SHA being certified — the gate now enforces this itself rather than
trusting it: `EXPECTED_COMMIT_SHA` is the dispatched commit, `/api/health` reports the
commit the deployment was built from, and the run stops before sending any credential if
they differ. A pass therefore names the SHA it certified.
