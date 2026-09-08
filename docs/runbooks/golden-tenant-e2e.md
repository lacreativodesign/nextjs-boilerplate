# Golden Tenant E2E Certification

PR6 certifies Bizosto against the dedicated `bizosto-demo` tenant using real browser login and deployment-backed APIs.

## Required secrets

All of these live in GitHub repository Actions secrets, and the demo password is seeded
from the same one the browser suite types — see "Prepare the fixture" for why that
matters:

- `E2E_DEMO_PASSWORD` — shared password for the ten `demo_*` accounts (16 characters minimum)
- `E2E_BASE_URL` — the HTTPS deployment URL being certified
- `VERCEL_AUTOMATION_BYPASS_SECRET` — only while the target is a protected preview
- `FIREBASE_ADMIN_KEY` — the same service account JSON the deployment uses, so the seed
  job can rotate the demo Auth accounts

Never commit or print the password. The Super Admin demo page intentionally does not display it.

## Getting past Vercel Deployment Protection

The Vercel project protects every deployment except custom domains, so a preview URL
serves Vercel's SSO wall instead of the Bizosto login page. That wall has an email
field and no password field, which is why the first certification run failed all
thirteen tests waiting for `input[type="password"]`.

Configure Vercel's supported bypass:

1. Vercel → Project → Settings → Deployment Protection → **Protection Bypass for
   Automation** → generate the secret.
2. Add it as the GitHub Actions secret `VERCEL_AUTOMATION_BYPASS_SECRET`.

The suite sends that secret once, to the deployment origin only, and exchanges it for
a scoped bypass cookie. It is never sent as a blanket request header, which would leak
it to the app's cross-origin calls (Firebase, Google, Stripe). Playwright traces are
disabled whenever the bypass is in use, because the report artifact is publicly
downloadable on a public repository.

A target on a custom domain is exempt from the protection and needs no bypass secret.

## Prepare the fixture

**The gate does this for itself.** With `FIREBASE_ADMIN_KEY` configured, dispatching the
gate resolves the Firebase project from the deployment under test, rebuilds the
`bizosto-demo` fixture into that project, and rotates the ten demo accounts to the same
`E2E_DEMO_PASSWORD` the browser is about to type. Neither copy of the secret nor the
project can be the odd one out, so the drift below has nowhere to happen. Skip to
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

Reset is tenant-scoped: it deletes only documents belonging to `bizosto-demo` in the demo
collections. Note that `bizosto-demo` currently shares its Firebase project with real
tenants, so that tenant filter is the isolation boundary.

## Run the pre-merge gate

Dispatch the existing `.github/workflows/smoke.yml` workflow against the PR6 branch. It is
the only golden tenant gate: PR6 briefly carried a second, identical `golden-e2e.yml`, and
two dispatchable copies meant every guard had to be added twice.

The workflow fails before checkout if either required GitHub secret is missing or if
`E2E_BASE_URL` is not HTTPS. It then rebuilds the fixture (see above) and signs one demo
account in against the deployment before the browser suite starts:

```bash
node scripts/verify-golden-tenant-signin.mjs
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
