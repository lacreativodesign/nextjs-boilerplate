# P0-06 — GitHub main protection certification

**Status: TECHNICAL PROTECTION VERIFIED — INDEPENDENT REVIEW STILL OPEN**

Current state re-verified on **2026-09-23**.

| Control | ERP | Website |
| --- | --- | --- |
| **Repository visibility** | ✅ private | ✅ private |
| **Ruleset active** | ✅ `22866162` | ✅ `23581080` |
| **Bypass actors** | ✅ latest privileged read: `[]` | ✅ latest privileged read: `[]` |
| **User can bypass** | ✅ `never` | ✅ `never` |
| **Required checks** | ✅ quality + Sonar + Vercel | ✅ Vercel + dependency-security |
| **Independent review** | ⚠️ OPEN — approvals 0 | ⚠️ OPEN — approvals 0 |
| **Automated bypass drift coverage** | ⚠️ privileged read required | ⚠️ privileged read required |

P0-06 is **NOT FULLY CLOSED** because no genuine independent second human reviewer exists.

## ERP live protection

Ruleset `22866162` is active on the default branch and currently enforces:

- deletion protection
- non-fast-forward protection
- pull-request-only changes
- unresolved review conversations must be resolved
- merge method `merge` only
- strict required status checks
- `quality` / GitHub Actions integration `15368`
- `SonarCloud Code Analysis` / integration `12526`
- `sonar` / GitHub Actions integration `15368`
- `Vercel` / integration `8329`

The latest privileged owner read confirmed `bypass_actors: []` and
`current_user_can_bypass: never`.

## Website live protection

Ruleset `23581080` is active on the private website repository. It requires:

- `Vercel` / integration `8329`
- `dependency-security` / GitHub Actions integration `15368`

The dependency gate runs `npm audit --audit-level=high`. The website remains at
**0 critical / 0 high** in the certified baseline.

Website PR #60 is merged. Its first post-merge live workflow exposed an automation-observability
issue, not a ruleset regression: GitHub's automatic Actions token authenticated successfully but
GitHub withheld `bypass_actors`. Website follow-up PR #62 corrects that monitoring behavior.

## Actions-token observability correction

An authenticated GitHub API response is **not automatically a privileged ruleset read**.

GitHub may return the ruleset while omitting `bypass_actors` unless the caller has sufficient
access to the ruleset. Therefore:

1. The verifier remains fail-closed when `bypass_actors` is absent.
2. An authenticated response is labelled privileged only when an array-valued
   `bypass_actors` field is actually present.
3. The scheduled workflow fails on every real drift, read failure, or observed bypass actor.
4. If the only remaining failure is `ruleset.bypass_actors_unobservable`, the scheduled job
   emits an explicit automation warning instead of creating a permanent false-red.
5. Full bypass-actor certification continues to require a privileged owner read.

No long-lived administration PAT is stored merely to make the scheduled monitor look fully
privileged.

This does **not** weaken the ruleset evaluator. The evaluator itself still refuses to certify an
unobservable bypass list.

## Why the live drift job is not a required merge check

The live drift job is intentionally separate from the required `quality` gate.

If the live GitHub ruleset is weakened, a repair PR must still be mergeable. A network or API
fault must also not deadlock the repository. The required `quality` job therefore tests the
certified contract and evaluator offline, while the scheduled workflow monitors live state.

## Independent review — remaining configuration gap

Both repositories currently require `0` approving reviews because the same owner account authors
the pull requests and no second independent human collaborator exists.

Do **not** raise the count to `1` yet. GitHub does not let the PR author approve their own PR, so
doing so before adding another real person would deadlock merges.

To close P0-06 later:

1. Grant a genuine second human write access to each repository.
2. Set `required_approving_review_count` to `1` on both live rulesets.
3. Raise each contract's `certifiedFloor` to `1` and set `gapOpen: false`.

An alternate account controlled by the same owner does not satisfy independent review.

## Scope

This PR changes P0-06 governance/certification artifacts only. The earlier
`lib/support/storage.ts` fix is already present on current ERP `main` byte-for-byte and is no
longer part of this PR's diff.

No pricing, plan, tenant, Stripe, finance, onboarding, currency, Firebase Auth, demo credential,
or product UI behavior is changed here.
