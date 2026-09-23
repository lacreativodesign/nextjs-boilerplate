# P0-06 — GitHub main protection certification

**Status: TECHNICAL PROTECTION VERIFIED — INDEPENDENT REVIEW STILL OPEN**

Current state re-verified on **2026-09-23**.

| Control                             | ERP                             | Website                         |
| ----------------------------------- | ------------------------------- | ------------------------------- |
| **Repository visibility**           | ✅ private                      | ✅ private                      |
| **Ruleset active**                  | ✅ `22866162`                   | ✅ `23581080`                   |
| **Bypass actors**                   | ✅ latest privileged read: `[]` | ✅ latest privileged read: `[]` |
| **User can bypass**                 | ✅ `never`                      | ✅ `never`                      |
| **Required checks**                 | ✅ quality + Sonar + Vercel     | ✅ Vercel + dependency-security |
| **Independent review**              | ⚠️ OPEN — approvals 0           | ⚠️ OPEN — approvals 0           |
| **Automated bypass drift coverage** | ⚠️ privileged read required     | ⚠️ privileged read required     |
| **Defects recorded**                | **7** — see §0                  |                                 |

P0-06 is **NOT FULLY CLOSED** because no genuine independent second human reviewer exists.

This certification was **rejected once by independent review** and has been corrected seven
times in total: two defects rejected by review, three found by self-check, one found by an
independent reviewer in the live pull request bodies, and one found by the control running for
real. All are recorded in §0 rather than quietly fixed, because **a certification that hides its
own corrections is not evidence of anything.**

---

## 0. Every defect found in this certification, and what changed

### Defect 1 — publishing the website was treated as a solution

`lacreativodesign/bizosto-website` holds proprietary Bizosto marketing source and **must remain
private**. On 2026-09-17 it was made public in order to get past a GitHub plan restriction that
blocks rulesets on private repositories, and the first version of this certification then built
on top of that state — recording the trade, but treating the blocker as "resolved".

That was wrong. Publishing proprietary source to obtain a branch-protection setting is a larger
exposure than the control it buys, and P0-06 forbids it in as many words. The API error names
two ways out and only one of them is acceptable:

```
403 "Upgrade to GitHub Pro or make this repository public to enable this feature."
```

**The correct owner action is the plan, not the visibility.** GitHub serves repository rulesets
on public repositories under Free, and on public _and private_ repositories under GitHub Pro,
Team and Enterprise. So the requirement is GitHub Pro or higher.

What changed in the code: repository visibility became a **certified control**. The website is
certified `private`, and a public reading is reported as `repository.visibility` **drift**, with
the plan named as the remedy. A repeat of this cannot read as progress. The owner has since
restored both repositories to private, and the control went green **without the record being
touched** — which is what a ratchet is for.

### Defect 2 — the bypass-actor check could false-pass

The evaluator did this:

```js
const actors = ruleset.bypass_actors ?? [];
if (actors.length > 0) {
  /* fail */
}
```

`GET /repos/{owner}/{repo}/rulesets/{id}` returns `bypass_actors` **only to callers with
sufficient access to the ruleset**. An anonymous or under-scoped read can therefore come back
with the field absent — and `?? []` turned _"I was not allowed to see the bypass list"_ into
_"there is no bypass list"_, which is a **PASS**.

That is a false green on the control everything else rests on: a single bypass actor makes every
other rule advisory. The original mutation battery missed it because every bypass mutation there
_added an actor_ — none removed the ability to look.

**Fixed.** Only an explicitly observable empty array, from a read GitHub actually serves the
bypass list to, satisfies the invariant. Everything else fails as
`ruleset.bypass_actors_unobservable`, with its own diagnostic so it cannot be misread as "an
actor was found":

| Observation                                      | Result                             |
| ------------------------------------------------ | ---------------------------------- |
| property absent from the response                | **FAIL** — unobservable            |
| `undefined`                                      | **FAIL** — unobservable            |
| `null`                                           | **FAIL** — unobservable            |
| any non-array (string, number, object, boolean)  | **FAIL** — unobservable            |
| `[]` from an **anonymous** read                  | **FAIL** — unobservable            |
| `[]` with **no stated provenance** (the default) | **FAIL** — unobservable            |
| one or more actors                               | **FAIL** — `ruleset.bypass_actors` |
| `[]` from a **privileged authenticated** read    | **PASS**                           |

**Proven on production data, not only on fixtures.** Both live rulesets were fetched and the
exported `evaluateRuleset` was run over the real bytes, varying only the stated provenance:

| Repository           | Read as                       | Result                                  |
| -------------------- | ----------------------------- | --------------------------------------- |
| `nextjs-boilerplate` | privileged authenticated      | **PASS**                                |
| `nextjs-boilerplate` | **same bytes**, anonymous     | **FAIL** — `bypass_actors_unobservable` |
| `nextjs-boilerplate` | **same bytes**, no provenance | **FAIL** — `bypass_actors_unobservable` |
| `bizosto-website`    | privileged authenticated      | **PASS**                                |
| `bizosto-website`    | **same bytes**, anonymous     | **FAIL** — `bypass_actors_unobservable` |

Identical bytes, opposite verdicts. The invariant is therefore about the **read**, not about the
payload — which is the whole correction, and it is not provable from a fixture that was written
to pass.

### Defects 3 and 4 — the same class, found twice more, by self-check rather than review

Neither was reported by independent review. Both are prose in a certification artefact that
asserted a state contrary to live fact, and both are recorded because the pattern matters more
than either instance: **prose does not fail a build, so a sentence can outlive the world it
described.**

**Defect 3.** After the contract was rewritten for a private website, one sentence survived from
an earlier revision. It stated that _both repositories were public_, that everything the contract
describes was therefore readable without authentication, and that this was _the reason no
personal access token was required_. Wrong three times over: it asserted the visibility the
rewrite exists to forbid, it justified the credential model on unauthenticated reads — precisely
the bypass false-green of Defect 2 — and it attributed the credential-light design to the wrong
cause entirely.

**Defect 4.** Found by diffing this repository's contract against the website's own copy — the
two are deliberately separate files, and only one had been corrected. The ERP contract asserted
that the website was already private and merely had to remain so. At the time, the website was
public; `expectedVisibility` is `private` specifically so the verifier **fails** on that, and the
record was simultaneously claiming the gap was already closed. The guard added for Defect 3 did
not catch it because none of its patterns covered this phrasing — a guard is only as wide as its
worst-case phrasing.

**Fixed.** The contract names the state it is actually in, and the credential model is explicitly
justified on the run-inside-the-repository design rather than on either repository's visibility —
so it survived the website going private, which is the whole point. Six asserted-absent patterns
and one positive assertion cover the class, and three mutants confirm each fires by name.

Both are **described rather than quoted** above, deliberately. The guard scans this document too,
and reproducing either sentence verbatim makes it fail — which is the guard working, not an
inconvenience. Excluding this document from its own scan was the alternative and was rejected:
prose is exactly where stale claims survive.

### Defect 5 — the live pull request bodies had gone stale

Found by **independent review**, and it is the most instructive of the seven.

Every committed artefact passed every guard. The contract was right, the evidence document was
right, the verifier was right, the prose guards were green in both repositories. And the
descriptions a reviewer actually opens still described the ERP repository with an earlier
visibility, understated the changed-file count, denied a change that had been made under `lib/`,
and presented the visibility control as outstanding. One of them contradicted itself outright —
its file-list section and its scope section gave different counts.

Those claims are **described rather than reproduced**, deliberately: this document is scanned
too, and writing them out verbatim fails the build.

**The record was correct. Its shop window was not.** Every guard built to that point scanned
files in the repository, and a pull request body is not one.

There is also a reason the bodies rotted while the files did not: the bodies were **patched
incrementally**, revision after revision, while the committed artefacts were rewritten whole
whenever the facts moved. Incremental patching preserves whatever you forget to look at. The
correction rewrote both bodies from live facts rather than patching them again, and
`scripts/check-certification-prose.mjs` now makes that audit deterministic rather than a careful
read — see §6.

### Defect 6 — an authenticated read was labelled privileged before the response was inspected

Found by **the control running for real**. After website PR #60 merged, the first post-merge run
of the drift workflow failed `ruleset.bypass_actors_unobservable` while printing that it had read
the ruleset _via an authenticated read with the bypass list observable_. The verdict was right
and the label was lying.

The cause: provenance was decided by **whether a token had been sent**, not by **what came back**.
The automatic Actions `GITHUB_TOKEN` authenticates a ruleset read perfectly well and still does
not receive `bypass_actors`, because GitHub serves that field only to callers with sufficient
access to the ruleset — and GitHub Actions `permissions:` has no scope that grants it. So the
response was HTTP 200, authenticated, and missing exactly the field the certification rests on.

**Fixed.** A read is classified by the fields it actually returned:

```js
const bypassActorsObservable =
  privileged &&
  Object.prototype.hasOwnProperty.call(body, 'bypass_actors') &&
  Array.isArray(body.bypass_actors);
```

The evaluator is unchanged and still refuses to certify an unobservable bypass list. What changed
is that the drift job now says what it actually saw. It treats **only**
`ruleset.bypass_actors_unobservable` as an explicit automation warning — every other live drift,
read failure or observed bypass actor is still a hard failure — so the scheduled monitor does not
become a permanent false red for a limitation of its own token. Full bypass-actor certification
remains a **privileged owner read**, and no long-lived administration token is stored to make a
monitor look privileged. See §3.

### Defect 7 — the fix for defect 6 removed the drift job's token

Found by **running the suite against the fix**. The commit that made the drift job honest about
token visibility also deleted the step's

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

GitHub does not place that token in a step's environment on its own. Without it the verifier read
a **private** repository anonymously, so it did not reach the bypass question at all: it failed
`repository.visibility_unobservable` and `ruleset.read`, both of which are **hard** failures. The
scheduled drift check would have gone red on every single run, for a reason that has nothing to
do with drift — and a detector that is always red is a detector nobody reads.

This is the mirror image of Defect 2. That one made an unreadable control look green; this one
made a readable control look broken. Both come from the same place: **the certification talking
about a read it did not actually perform.**

**Fixed.** The `env:` block is restored, with a comment saying why it cannot be dropped, and
`__tests__/ci/github-main-protection-certification.test.ts` asserts that the workflow names
exactly one secret and that it is the automatic job token.

**Why this keeps happening, and what actually stops it.** Every artefact here makes claims about
live infrastructure, and live infrastructure moves. The only durable answer found in this work is
to assert the prose: a claim worth making in a certification is a claim worth failing a build
over. Where a statement could not be asserted, it was deleted instead.

---

## 1. ERP live protection

`lacreativodesign/nextjs-boilerplate` is **private**, owner `lacreativodesign` (a user account,
not an organisation), default branch `main`.

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

**The ruleset SURVIVED this repository going private and still ENFORCES.** That was verified
against `GET /repos/lacreativodesign/nextjs-boilerplate/rules/branches/main` — the rules that
actually apply to the branch, not merely the rules that are configured — which returns all four
rule types from ruleset `22866162` with the full required-context list. The distinction is
load-bearing: a ruleset can sit on a plan that does not serve it, which is a **configured-but-inert**
control and exactly the false green this certification exists to catch.

> **Provenance of that endpoint read.** It was performed by Claude under an authenticated
> privileged session against the live GitHub API. An independent reviewer using a connected
> GitHub tool was **unable to reproduce this specific REST route**, because that tool rejects it.
> That is a limitation of the reviewer's tooling, not a retraction: the finding is
> **evidenced by Claude's authenticated API read** and has **not** been independently reverified
> by a second party. It is recorded that way deliberately.

> **The repository-visibility governance finding is RESOLVED.** This repository was public; it is
> now private, so the finding is resolved rather than waived, and
> `visibilityIsGovernanceFinding` is `false`.

## 2. Website live protection

`lacreativodesign/bizosto-website`, default branch `main`, **private**.

Ruleset `23581080` is active and requires:

- `Vercel` / integration `8329`
- `dependency-security` / GitHub Actions integration `15368`

The dependency gate runs `npm audit --audit-level=high`, arrived with PR #61 (merged to main on
2026-09-17, `632f5daf6e5981dd610b59199c7230f38b8cd2c0`), and is **branch-blocking rather than
advisory** because the owner added it to the ruleset. The website remains at **0 critical /
0 high** in the certified baseline.

That ruleset also **SURVIVED** the repository going private and still applies, verified against
`GET /repos/lacreativodesign/bizosto-website/rules/branches/main` — same caveat on provenance as
§1, and the same four rule types, strict checks on, both required contexts.

Website PR #60 is merged. Its first post-merge live workflow exposed an automation-observability
issue, not a ruleset regression — that is Defect 6 above. Website follow-up PR #62 corrects that
monitoring behaviour in that repository.

> ### OWNER ACTION — the website ruleset, for the record
>
> The owner created ruleset `23581080` directly, under
> `Settings → Rules → Rulesets` on `lacreativodesign/bizosto-website`. Nothing in this repository
> can create it: each repository is certified by a workflow running **inside** it under its own
> automatic job token, so neither holds a credential for the other, and the certification reads
> rulesets rather than writing them.

## 3. Actions-token observability correction

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

## 4. Why the live drift job is not a required merge check

The live drift job is intentionally separate from the required `quality` gate.

If the live GitHub ruleset is weakened, a repair PR must still be mergeable. A network or API
fault must also not deadlock the repository. The required `quality` job therefore tests the
certified contract and evaluator offline, while the scheduled workflow monitors live state.

The drift job still needs the automatic job token in its `env:` to read a private repository at
all — see Defect 7.

## 5. Independent review — remaining configuration gap

Both repositories currently require `0` approving reviews because the same owner account authors
the pull requests and no second independent human collaborator exists.

That account is the author of every pull request, and GitHub does not permit a pull request
author to approve their own. Raising the count to `1` today would not add a review — it would
stop anything merging, including the pull request that would put the setting back.

Explicitly **not** done: no bot approval, no second account controlled by the author presented as
independent review, no automated self-approval path, and nothing else weakened to compensate. An
alternate account controlled by the same owner does not satisfy independent review.

The gap is machine-recorded as `{ certifiedFloor: 0, target: 1, gapOpen: true }`, and the suite
**fails if `gapOpen` is set to `false` while the floor is still `0`** — it cannot be closed on
paper.

> ### OWNER ACTION 1 — closing the review gap (once per repository)
>
> Two steps, **in this order**. The second alone stops merges.
>
> 1. **Grant a second human write access.** The repositories share one owner, so each needs its
>    own collaborator — adding one to the ERP repository does not cover
>    `lacreativodesign/bizosto-website`.
> 2. **Then** set `required_approving_review_count: 1` on both live rulesets, **and** set
>    `certifiedFloor: 1` / `gapOpen: false` for that entry in
>    [`p0-06-main-protection.certified.json`](./p0-06-main-protection.certified.json).
>
> Worth doing at the same time, and only then: `dismiss_stale_reviews_on_push: true` and
> `require_last_push_approval: true`.

## 6. The pull request body is external evidence, audited manually

A pull request body lives in GitHub, not in this repository, so no workflow here can read it
without an API call — and reading the _other_ repository's pull request would need a credential
this design deliberately refuses.

`scripts/check-certification-prose.mjs` is what makes that audit deterministic. It scans the
committed artefacts on every drift run, and it is pointed at a pull request body by hand:

```
node scripts/check-certification-prose.mjs --body=/tmp/pr.md --repo=erp     --expect-head=<sha>
node scripts/check-certification-prose.mjs --body=/tmp/pr.md --repo=website --expect-head=<sha>
```

A forbidden phrase is only a violation on a line with **no historical marker**, so the record can
still say what was true earlier — §0 depends on that. Current state is asserted against a
structured `CURRENT STATE` table rather than against prose.

## 7. Restore digests

Files restored after the mutation battery and verified by SHA-256:

| File                                                    | SHA-256                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `scripts/verify-github-main-protection.mjs`             | `dcc1d1d0a8c22a0415853b34245538e1f8e78b9d25ea56c195e82bee20445515` |
| `docs/security/p0-06-erp-main-ruleset.snapshot.json`    | `d5f7ba2e1d3d8ec2c4434f3b8af1506c298786bd041e5420e3e77a990b9ae182` |
| `.github/workflows/github-protection-certification.yml` | `baebb70268edf9de1c28d1b441a4379c7afc205d1210bdaa012de633998175fe` |
| `docs/security/p0-06-main-protection.certified.json`    | `ff998adbe68c9f0d1c3e31d0903d99ebef03ea48a32a73218ddaf8b0642229b1` |

These are checked by the suite rather than asserted: a stale digest fails the build.

## 8. Scope

This PR changes P0-06 governance/certification artifacts only. The earlier
`lib/support/storage.ts` fix is already present on current ERP `main` byte-for-byte and is no
longer part of this PR's diff.

No pricing, plan, tenant, Stripe, finance, onboarding, currency, Firebase Auth, demo credential,
or product UI behavior is changed here.
