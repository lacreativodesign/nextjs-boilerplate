# Next.js security upgrade — plan

Two critical advisories affect the version of Next.js this application runs. This is
the plan to resolve them. **It changes no dependency itself**; it exists to be
approved before the upgrade is attempted.

## What is wrong

| Advisory                                                                                                                                       | Affected            | Severity |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------- |
| [GHSA-p293-qw3h-jr36](https://github.com/advisories/GHSA-p293-qw3h-jr36) — unauthenticated RCE on Windows-hosted servers                       | `>=13.4.0 <15.5.24` | critical |
| [GHSA-2xp9-vwfh-vxw4](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4) — unauthenticated RCE in the Image Optimization API when AVIF is used | `>=10.0.0 <15.5.24` | critical |

The application runs `next@14.2.35`, which is inside both ranges. `npm audit --audit-level=critical`
fails as a result, and that check blocks the Quality Gates workflow.

There is a second, separate copy: `@uploadcare/react-uploader` declares
`optionalDependencies: { "next": "^16.0.0" }`, which installs
`node_modules/@uploadcare/react-uploader/node_modules/next@16.2.10`. That copy is
inside the 16.x range of the same two advisories (`>=16.0.0 <16.3.3`).

### Exposure in practice

Neither critical is likely to be reachable in this deployment, and neither of those
reasons is a fix:

- The Windows RCE requires a Windows-hosted server. This application runs on Vercel's
  Linux runtime.
- The Image Optimization RCE requires AVIF handling in `next/image`.

Reachability is an argument about today's hosting, not about the dependency. The
version is vulnerable, the audit gate is correct to fail, and the gate must not be
weakened to make it pass.

## Verified patched versions

Confirmed against the npm registry rather than from memory:

| Line | Patched at                         | Notes                                                                                               |
| ---- | ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| 14.x | **none**                           | `next-14` dist-tag is `14.2.35` — the final 14.x release. Next 14 will not receive this fix.        |
| 15.x | **15.5.24** (published 2026-08-25) | `15.5.25` is the newest 15.x and carries the `backport` dist-tag, so 15.5.x is the maintained line. |
| 16.x | **16.3.3** (published 2026-08-25)  | `16.3.4` is `latest`.                                                                               |

Staying on 14.x is therefore not an option that ends with the advisories resolved.
**The minimum patched upgrade is 15.5.24, and the recommended target is 15.5.25.**

## Recommended target

**`next@15.5.25`** — one major version, the maintained backport line, the smallest
change that clears both criticals.

Not 16.x. It is two majors, a larger behavioural change, and buys nothing the
advisories require.

Alongside it, pin the transitive copy rather than leaving a second vulnerable Next in
the tree:

```jsonc
"overrides": {
  "@uploadcare/react-uploader": { "next": "^16.3.4" }
}
```

This was tested during diagnosis: the root stayed at `14.2.35` and the nested copy
moved to `16.3.4`, so the override scopes correctly. It was reverted rather than
shipped, because on its own it does not clear the gate.

## Migration surface in this repository

Next 15's breaking changes are concentrated in the async request APIs. Measured, not
estimated:

| Change                                               | Call sites                  |
| ---------------------------------------------------- | --------------------------- |
| `cookies()`, `headers()`, `draftMode()` become async | 15 files                    |
| Route handler `params` becomes a Promise             | 104 of 658 `app/api` routes |
| Page `params` / `searchParams` become Promises       | 10 files                    |

Roughly 129 files. Most of it is mechanical and covered by the official codemod:

```bash
npx @next/codemod@canary next-async-request-api .
```

Caching defaults also change: `fetch` requests, `GET` route handlers and client router
navigations are no longer cached by default. That is a behavioural change to review
deliberately — for this application the finance and CRM list endpoints are where a
caching change would be felt first.

## Why this is not part of PR6

PR6 certifies the application through thirteen real browser tests against a deployment.
Changing the framework major underneath it would mean certifying something other than
what was reviewed, and would invalidate every gate result the PR has already produced.
The upgrade needs its own regression pass and its own certification run afterwards.

## Execution plan

Nothing below has been done. Each step is gated on the previous one.

1. **Branch from `main`.** Not from the PR6 branch.
2. **`npm install next@15.5.25 eslint-config-next@15.5.25`**, add the `overrides` entry,
   and commit the lockfile.
3. **Run the codemod**, then review every file it touched by hand. A codemod that
   rewrites 129 files is a starting point, not a result.
4. **Run the full Quality Gates chain locally**: OpenAPI and Firestore schema drift,
   Prettier, lint, `tsc`, `tsc -p tsconfig.e2e.json`, the Jest suite with coverage, the
   same suite under `TZ=Asia/Karachi`, both Firestore emulator suites, the production
   build, bundle size, licence compliance, and `npm audit --audit-level=critical` —
   which must now pass on its own merits.
5. **Confirm the audit is clean for the right reason**: zero critical advisories
   matching an installed version, verified per-copy rather than from the summary count.
   During diagnosis npm reported one affected range at a time, which is how the 14.x
   exposure was initially missed.
6. **Review the bundle delta.** Next 15 changes output; the 210KB budget in
   `scripts/check-bundle-size.mjs` is a real gate and may need discussion if the
   framework moves it. Do not raise the budget silently.
7. **Deploy to a preview** and exercise the application by hand: authentication, the
   finance and CRM lists, file upload (the Uploadcare component whose transitive Next
   is being pinned), and PDF generation.
8. **Run the PR6 Golden Tenant gate against that preview.** Thirteen tests, all
   passing, before this is considered safe. That gate is the regression evidence for
   this upgrade, not just for PR6.
9. **Merge only after** a human review of the codemod diff and a green certification
   run.

## Production deployment plan

The upgrade reaches production through the repository's normal path: merge to `main`,
Vercel builds and promotes. What matters is what happens around it.

- **Order.** The Firestore index remediation goes first and independently. Both PRs
  touch production behaviour and neither should be in flight while the other is being
  validated.
- **Timing.** Deploy during a window where a rollback is acceptable, not before a
  weekend.
- **Rollback.** Vercel keeps the previous production deployment; promoting it back is
  immediate and needs no code change. The only non-reversible element is the lockfile
  in `main`, which a revert commit handles.
- **What to watch after promotion.** Runtime error rate, `/api/health`, authentication
  success rate, and the finance and CRM list endpoints — the surfaces most exposed to
  the caching default change.
- **Do not** combine this with any other change in the same deployment. If something
  regresses, the cause should be unambiguous.

## Owner decisions required

1. Approve `15.5.25` as the target, or choose 16.x and accept the larger migration.
2. Approve the `@uploadcare/react-uploader` override.
3. Approve a deployment window.

No dependency is changed by this document.
