# Golden Tenant E2E Certification

PR6 certifies Bizosto against the dedicated `bizosto-demo` tenant using real browser login and deployment-backed APIs.

## Required secrets

The same rotated demo password must be configured in two secure locations:

- deployed Bizosto environment: `E2E_DEMO_PASSWORD`
- GitHub repository Actions secret: `E2E_DEMO_PASSWORD`

GitHub Actions also requires:

- `E2E_BASE_URL` — the HTTPS deployment URL being certified

Never commit or print the password. The Super Admin demo page intentionally does not display it.

## Prepare the fixture

1. Deploy the PR6 code with `E2E_DEMO_PASSWORD` configured server-side.
2. As Super Admin, use **Demo Environment → Reset Demo Environment**.
3. Confirm the status counts show the canonical fixture, including at least one deal, invoice, project and client.

Reset is tenant-scoped. It deletes only documents belonging to `bizosto-demo` in the demo collections, then re-seeds deterministic IDs and rotates the ten demo Auth accounts to the configured password.

## Run the pre-merge gate

Dispatch the existing `.github/workflows/smoke.yml` workflow against the PR6 branch.

The workflow fails before checkout if either required GitHub secret is missing or if `E2E_BASE_URL` is not HTTPS. It then runs:

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

Record the exact PR head SHA, workflow run ID and Vercel deployment used. The run must correspond to the same SHA being certified.
