# P0-06 — GitHub main branch protection, review and required-check certification

**Status: TECHNICALLY CERTIFIED (BOTH REPOSITORIES) — ONE OWNER ACTION REMAINS**

Live state re-verified with privileged owner reads on **2026-09-23**.

This document was rewritten after independent review **rejected** the first version of this
certification for two P0 defects. **Two more of the same class were then found by self-check**,
one of them after CI had already gone green, **a fifth was found by a later independent review
in the live pull request bodies** — a surface no committed guard could reach — **a sixth was
found by the control running for real**, and **a seventh was found by running the suite against
the fix for the sixth**. All seven are recorded here rather than quietly fixed, because a
certification that hides its own corrections is not evidence of anything.

|                             |                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------- |
| ERP `main` protection       | verified live, drift-guarded, **certified**                                         |
| ERP approving reviews       | `0` — **open gap**, no independent reviewer exists                                  |
| Website `main` protection   | ✅ **applied and live** — ruleset `23581080`, **two** required checks               |
| Website dependency gate     | ✅ **`dependency-security` live and branch-required** (PR #61 merged)               |
| Repository visibility       | ✅ **CLOSED** — both repositories PRIVATE, rulesets verified surviving              |
| ERP visibility finding      | ✅ **RESOLVED** — was public, now private; finding flag off                         |
| Bypass-actor observability  | **was a false green**; now fails closed, and labelled by what came back             |
| Scheduled drift coverage    | ⚠️ `bypass_actors` needs a **privileged owner read** — see §0 defect 6              |
| Website history secret scan | complete — **no credential exposed**                                                |
| Defects recorded            | **7** — 2 rejected by review, 3 by self-check, 1 by review, 1 by the control itself |
| Stale-prose guards          | asserted in both repositories, mutation-proven                                      |

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
on public repositories under Free, and on public _and private_ repositories under Pro, Team and
Enterprise. So the requirement is GitHub Pro or higher — see §3.

What changed in the code: repository visibility is now a **certified control**. The website is
certified `private`, and a public reading is reported as `repository.visibility` **drift**, with
the plan named as the remedy. A repeat of this cannot read as progress. See §6 and the tests
under "the website must be private, and publishing it is drift".

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
the old version. It stated that _both repositories were public_, that everything the contract
describes was therefore _readable without authentication_, and that this was _the reason no
personal access token was required_. Wrong three times over: it asserted the visibility the
rewrite exists to forbid, it justified the credential model on unauthenticated reads — precisely
the bypass false-green of Defect 2 — and it attributed the credential-light design to the wrong
cause entirely.

**Defect 4.** Found by diffing this repository's contract against the website's own copy — the
two are deliberately separate files, and only one had been corrected. The ERP contract still
asserted that the website **was already private** and merely had to remain so. The website is
**public today**; `expectedVisibility` is `private` specifically so the verifier **fails** on
that, and the record was simultaneously claiming the gap was already closed. The guard added for
Defect 3 did not catch it because none of its patterns covered this phrasing — a guard is only as
wide as its worst-case phrasing.

**Fixed.** The contract now names the state it is actually in (`CURRENTLY PUBLIC`, with
`certified target is PRIVATE`), and the credential model is explicitly justified on the
run-inside-the-repository design rather than on either repository's visibility — so it survives
the website going private, which is the whole point. Six asserted-absent patterns and one
positive assertion now cover the class, and three mutants confirm each fires by name.

Both are **described rather than quoted** above, deliberately. The guard scans this document
too, and reproducing either sentence verbatim makes it fail — which is the guard working, not an
inconvenience. Excluding this document from its own scan was the alternative and was rejected:
prose is exactly where stale claims survive.

### Defect 5 — the live pull request bodies had gone stale

Found by **independent review**, and it is the most instructive of the five.

Every committed artefact passed every guard. The contract was right, the evidence document was
right, the verifier was right, the prose guards were green in both repositories. And the
descriptions a reviewer actually opens still described the ERP repository with its old
visibility, understated the changed-file count, denied a change that had been made under
`lib/`, and presented the visibility control as outstanding. One of them contradicted itself
outright — its file-list section and its scope section gave different counts.

Those claims are **described rather than reproduced**, deliberately: this document is scanned
too, and writing them out verbatim fails the build. That is the same constraint the defect-3 and
defect-4 records operate under, and it is a feature.

**The record was correct. Its shop window was not.** Every guard built so far scanned files in
the repository, and a pull request body is not one.

There is also a reason the bodies rotted while the files did not: the bodies were **patched
incrementally**, revision after revision, while the committed artefacts were rewritten whole
whenever the facts moved. Incremental patching preserves whatever you forget to look at. The
correction rewrote both bodies from live facts rather than patching them again.

**Fixed**, and the surface is now covered as far as it honestly can be — see §5a.

### Defect 6 — an authenticated read was labelled privileged before the response was inspected

Found by **the control running for real** — the first defect here that no reviewer and no
self-check caught, and the first that the certification found on its own.

After website PR #60 merged, the first post-merge run of that repository's drift workflow failed
`ruleset.bypass_actors_unobservable` while printing that it had read the ruleset _via an
authenticated read with the bypass list observable_. The verdict was right. The label was lying.

The cause: provenance was decided by **whether a token had been sent**, not by **what came back**.
The automatic Actions `GITHUB_TOKEN` authenticates a ruleset read perfectly well and still does
not receive `bypass_actors`, because GitHub serves that field only to callers with sufficient
access to the ruleset — and GitHub Actions `permissions:` has **no scope that grants it**. Reading
it needs a GitHub App or a personal access token. So the response was HTTP 200, authenticated, and
missing exactly the field this certification rests on.

**Fixed.** A read is classified by the fields it actually returned:

```js
const bypassActorsObservable =
  privileged &&
  Object.prototype.hasOwnProperty.call(body, 'bypass_actors') &&
  Array.isArray(body.bypass_actors);
```

Both halves are load-bearing. Dropping `privileged` would let an **anonymous** read — which can
also come back carrying `bypass_actors: []` — certify the control, which is defect 2 again by a
different route; a mutation asserting exactly that is in the battery.

The evaluator is unchanged and still refuses to certify an unobservable bypass list. What changed
is that the drift job now says what it actually saw, and treats **only**
`ruleset.bypass_actors_unobservable` as an explicit automation warning — every other live drift,
read failure or observed bypass actor is still a hard failure — so a scheduled monitor does not
become a permanent false red over a limitation of its own token. Full bypass-actor certification
remains a **privileged owner read**, and no long-lived administration token is stored to make a
monitor look privileged.

**Demonstrated in production, not only in tests.** The website repository's drift workflow has
three recorded runs against `main`: the post-merge run at `3007b970` and the one after it both
concluded **failure**; the run after the correction landed concluded **success**. (The run logs
themselves are served from a storage host this environment cannot reach, so the conclusions are
quoted from the Actions API and the log text is deliberately not paraphrased here.)

### Defect 7 — the fix for defect 6 removed the drift job's token

Found by **running the suite against the fix**. The commit that made the drift job honest about
token visibility also deleted the verify step's

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

GitHub does not place that token in a step's environment on its own. Without it the verifier read
a **private** repository anonymously, so it never reached the bypass question at all: it failed
`repository.visibility_unobservable` and `ruleset.read`, both of which are **hard** failures. The
scheduled drift check would have gone red on every single run, for a reason that has nothing to do
with drift — and a detector that is always red is a detector nobody reads. Reproduced locally by
running the verifier with both token variables unset.

It never actually ran that way: this workflow does not exist on ERP `main` yet — this pull request
is what introduces it — so the defect was caught in the pull request rather than in production. The
website repository's copy of the workflow was checked for the same regression and **does not have
it**; its `env:` block is intact.

This is the mirror image of defect 2. That one made an unreadable control look green; this one
made a readable control look broken. Both come from the same place: **the certification talking
about a read it did not actually perform.**

**Fixed.** The `env:` block is restored, with a comment saying why it cannot be dropped, and a
test reads the verify step's own `env:` rather than the file at large — so mentioning the token
in a comment somewhere else in the file does not satisfy it.

**Why this keeps happening, and what actually stops it.** Every artefact here makes claims about
live infrastructure, and live infrastructure moves. The only durable answer found in this work is
to assert the prose: a claim worth making in a certification is a claim worth failing a build
over. Where a statement could not be asserted, it was deleted instead.

---

## 1. What is actually configured on the ERP repository

`lacreativodesign/nextjs-boilerplate` is **private** as of 2026-09-21, owner `lacreativodesign`
(a user account, not an organisation), default branch `main`.

> **The repository-visibility governance finding is RESOLVED.** This repository was public, which
> predated P0-06 and was **not** changed by this work — it was recorded for owner review and
> explicitly not endorsed, because "certified" describes what _is_, not what anyone approved. The
> owner has since made it private. The record now certifies `private` and the finding flag is
> **off**, so a regression to public fails outright instead of being downgraded to a notice.

Protection comes from one repository ruleset, read live from
`GET /repos/lacreativodesign/nextjs-boilerplate/rulesets/22866162` and committed verbatim to
[`p0-06-erp-main-ruleset.snapshot.json`](./p0-06-erp-main-ruleset.snapshot.json):

| Control                         | Live state                                                      | Verdict      |
| ------------------------------- | --------------------------------------------------------------- | ------------ |
| Ruleset enforcement             | `active`                                                        | **PASS**     |
| Target                          | `branch`, `ref_name.include = ["~DEFAULT_BRANCH"]`, no excludes | **PASS**     |
| Changes reach main by PR        | `pull_request` rule present                                     | **PASS**     |
| Branch deletion                 | `deletion` rule present                                         | **PASS**     |
| Force push / history rewrite    | `non_fast_forward` rule present                                 | **PASS**     |
| Unresolved review conversations | `required_review_thread_resolution: true`                       | **PASS**     |
| Required status checks          | 4 contexts, all confirmed reporting                             | **PASS**     |
| Up-to-date branch before merge  | `strict_required_status_checks_policy: true`                    | **PASS**     |
| Checks on branch creation       | `do_not_enforce_on_create: false`                               | **PASS**     |
| Merge methods                   | `["merge"]` only                                                | **PASS**     |
| Bypass actors                   | `[]`, **observed under an authenticated read**                  | **PASS**     |
| Second overlapping ruleset      | none — the rulesets list returns exactly one                    | **PASS**     |
| **Approving reviews required**  | **`required_approving_review_count: 0`**                        | **OPEN GAP** |

### The required checks are live, not stale

A required check that no longer reports blocks every merge forever, so each context was
confirmed actually reporting and green on `70a5403` before being certified:

| Context                    | Reports as        | App              | Integration id |
| -------------------------- | ----------------- | ---------------- | -------------- |
| `quality`                  | check run         | `github-actions` | 15368          |
| `SonarCloud Code Analysis` | check run         | `sonarqubecloud` | 12526          |
| `sonar`                    | check run         | `github-actions` | 15368          |
| `Vercel`                   | commit **status** | Vercel           | 8329           |

Integration ids are certified alongside the names: a context can be re-pointed at a different
app while keeping its name, which would satisfy a name-only check with a report this repository
never produces.

---

## 2. The open gap: no independent reviewer exists

`required_approving_review_count` is `0` on **both** repositories, deliberately.

`GET /collaborators` returns exactly one account on each:

```
lacreativodesign — role_name: admin — id 240409176
```

That account is the author of every pull request, and GitHub does not permit a pull request
author to approve their own. Raising the count to `1` would not add a review — it would stop
anything merging, including the pull request that would put the setting back.

Explicitly **not** done: no bot approval, no second account controlled by the author presented
as independent review, no automated self-approval path, and nothing else weakened to compensate.

The gap is machine-recorded as `{ certifiedFloor: 0, target: 1, gapOpen: true }`, and the suite
**fails if `gapOpen` is set to `false` while the floor is still `0`** — it cannot be closed on
paper.

> ### OWNER ACTION 1 — closing the review gap (once per repository)
>
> Two steps, **in this order**. The second alone stops merges.
>
> 1. **Grant a second human write access.** The repositories share one owner, so each needs its
>    own collaborator — adding one to the ERP repository does not cover the website.
> 2. **Then** set `required_approving_review_count: 1`, **and** set `certifiedFloor: 1` /
>    `gapOpen: false` for that entry in
>    [`p0-06-main-protection.certified.json`](./p0-06-main-protection.certified.json).
>
> Worth doing at the same time, and only then: `dismiss_stale_reviews_on_push: true` and
> `require_last_push_approval: true`.

---

## 3. The marketing website — ruleset LIVE, visibility and review still open

`lacreativodesign/bizosto-website`, default branch `main`.

### The ruleset is applied and correct

The owner created it on 2026-09-17. Read back directly from
`GET /repos/lacreativodesign/bizosto-website/rulesets/23581080`, authenticated, and verified
field by field — it is the **only** ruleset on the repository:

| Field                                                    | Live value                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------ |
| `id` / `name`                                            | `23581080` / `Production Main Protection`                                |
| `target` / `enforcement`                                 | `branch` / `active`                                                      |
| `ref_name.include` / `.exclude`                          | `["~DEFAULT_BRANCH"]` / `[]`                                             |
| `bypass_actors`                                          | **present and `[]`**                                                     |
| `current_user_can_bypass`                                | `never`                                                                  |
| rules                                                    | `deletion`, `non_fast_forward`, `pull_request`, `required_status_checks` |
| conversation resolution                                  | `true`                                                                   |
| merge methods                                            | `["merge"]`                                                              |
| code-owner review / last-push approval / stale dismissal | `false` / `false` / `false`                                              |
| extra approval for unattributed changes                  | `false`                                                                  |
| strict checks / on-create                                | `true` / `false`                                                         |
| required check                                           | `Vercel`, integration `8329`                                             |
| approving reviews                                        | **`0` — open gap**                                                       |

`GET /branches/main` reports `"protected": true`. The contract records `applied: true` and
`rulesetId: 23581080`, so the verifier **pins its read to that id** rather than discovering the
ruleset by name.

### Two required checks, not one

| Context               | Emitted by                    | Integration | Live on main                                    |
| --------------------- | ----------------------------- | ----------- | ----------------------------------------------- |
| `Vercel`              | Vercel app, commit **status** | `8329`      | success                                         |
| `dependency-security` | **GitHub Actions** check run  | `15368`     | success — run `35264726041`, job `105348912555` |

`dependency-security` arrived with **PR #61**, merged to main on 2026-09-17 at
`632f5daf6e5981dd610b59199c7230f38b8cd2c0`. It runs `npm ci` then `npm run security:audit`
(`npm audit --audit-level=high`), so it fails on **any** high or critical advisory across the
whole lockfile, dev dependencies included. PR #61 brought the repository to **0 critical, 0
high**. The owner then added the check to ruleset 23581080, which makes the dependency audit
**branch-blocking rather than advisory**.

The workflow is deliberately **not** path-filtered. A required check that gets skipped for pull
requests touching unrelated files leaves GitHub waiting on it forever — the same
dead-required-check failure mode this certification checks for elsewhere.

Both integration ids are pinned. Losing either context, or re-pointing either at a different
app, is P0-06 drift. The contract is directional, so further required checks may be added
without failing the record — but these two may never disappear.

**The ruleset control for the website is GREEN, and the dependency-security gate is GREEN and
branch-required.** As of 2026-09-21 the visibility control is green too. One control is not.

### Visibility — CLOSED on 2026-09-21

**Both repositories are now PRIVATE.** `bizosto-website` had been temporarily published so
ruleset `23581080` could exist at all, and `nextjs-boilerplate` being public was a separate,
older governance finding. The owner closed both.

What matters for reading this document years from now is _how_ it closed. The record never
accepted the public state: `expectedVisibility` stayed `private` throughout and the verifier
**failed** on `repository.visibility` for the entire time the repository was public. Nobody
edited the expectation to make the red go away. The owner acted, and the control went green on
its own.

That is the whole point of writing the record as a ratchet rather than a snapshot of whatever
is currently true.

Both contracts now certify `private` for both repositories, and `visibilityIsGovernanceFinding`
is `false` on both — so a future regression to public **fails** rather than being downgraded to
a notice. The suite asserts that, because a finding flag left switched on is exactly how a
closed gap quietly reopens.

#### The ruleset survived, and that was checked rather than assumed

A ruleset can sit on a plan that does not serve it: still listed by the rulesets API, still
reading back field-for-field, and enforcing nothing. Reading the ruleset back is therefore
**not** evidence that it still applies. The authoritative question is a different endpoint —
`GET /repos/{owner}/{repo}/rules/branches/main`, which returns the rules actually in force on
the branch:

| Repository           | Rules in force on `main`       | Enforced parameters                                                     |
| -------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| `nextjs-boilerplate` | 4, all from ruleset `22866162` | strict checks; `quality`, `SonarCloud Code Analysis`, `sonar`, `Vercel` |
| `bizosto-website`    | 4, all from ruleset `23581080` | strict checks; `Vercel`/8329, `dependency-security`/15368               |

Both came back complete. The protection survived the visibility change on both repositories.

> **Provenance of this endpoint read, stated exactly.** Both reads were performed by Claude under
> an authenticated privileged session against the live GitHub API, and that is the evidence this
> row rests on. An independent reviewer attempting to reproduce them through a connected GitHub
> tool **could not**: that tool rejects this specific REST route. So this finding is **evidenced
> by Claude's authenticated API read** and has **not** been independently reverified by a second
> party — which is a different and weaker claim than the rest of §4, and is recorded as such
> rather than rounded up.

### Independent review — OPEN

Approving reviews remain `0` on the website too, for the same reason as §2: one collaborator,
who authors every pull request. The two repositories share an owner but not an access list —
**each needs its own second collaborator** before its count can go to `1`.

### Cross-repository access is not assumed

A job token issued to this repository cannot read a private `bizosto-website` — GitHub answers
404 — and a read that fails must never be reported as a certification. Each repository verifies
**itself**, from a workflow running inside it under its own job token: this one runs
`--repo=erp`, the companion in `bizosto-website` runs `--repo=website`. Neither holds a
credential for the other.

## 4. Public-exposure security audit

Because the website was public between 2026-09-17 and its restoration, its **entire git history**
was readable, not just `HEAD`. A full-history scan was run across every reachable commit.

**Scope.** All 60 local branches (every remote branch materialised locally), 0 tags, **131
reachable commits** — 75 with diffs plus 56 merge commits, which carry no diff of their own.
History begins 2026-01-07.

**Tools.** `gitleaks 8.21.2` (`--log-opts=--all`), `trufflehog 3.82.13` (git mode, full history,
verification enabled), plus a targeted pattern sweep over every non-merge commit for Stripe
secret/restricted/webhook keys, Google API keys, GCP service-account material, private-key
blocks, GitHub tokens, Slack tokens, AWS access keys, Vercel tokens, SendGrid keys, Firebase FCM
legacy keys, database and SMTP URLs carrying passwords, and OAuth client secrets.

| #   | Type                                 | Path                        | Commit     | Real or false positive       | Rotation required |
| --- | ------------------------------------ | --------------------------- | ---------- | ---------------------------- | ----------------- |
| 1–5 | gitleaks `generic-api-key` ×5        | `tests/lead-intake.test.ts` | `10c9b902` | **False positive**           | **No**            |
| —   | trufflehog, all detectors            | —                           | —          | **0 detections, 0 verified** | —                 |
| —   | targeted high-risk sweep, 75 commits | —                           | —          | **0 hits**                   | —                 |

**Finding 1–5 adjudication.** All five are the same literal on five lines of one test file:
`BIZOSTO_INGEST_API_KEY: "test-key-with-at-least-24-characters"` — a self-describing fixture
whose only job is to be long enough to pass a length check. It is not a credential, was never a
credential, and grants nothing.

**`.env` files.** No `.env` file was ever committed on any branch. Only `.env.example` exists,
and every credential-bearing key in it is **empty**; the three non-empty values are non-secret
configuration (an allowed-hostname list, a score threshold, a boolean).

**No private keys, service-account JSON, `.pem`/`.key`/`.p12` files, or credential-shaped
filenames** appear anywhere in the reachable history.

**Result: no genuine credential was exposed by the period of public visibility. No rotation or
revocation is required.**

> Two notes recorded for completeness rather than because they change the result:
>
> - **Verify GitHub's own scanner too.** GitHub enables secret scanning on public repositories
>   automatically. The Security tab should be checked directly by the owner; that API is not
>   reachable from the environment this audit ran in. Anything it reports must be **rotated**,
>   not merely deleted — removing a secret in a later commit does not remove it from history.
> - **An artefact of the audit environment.** `trufflehog` reported one _verified_ GitHub token
>   in the ERP repository, in this certification's own test file. It is a false positive caused
>   by the sandbox: the egress proxy answers HTTP 200 to _any_ bearer token, including
>   deliberately-garbage ones, so trufflehog's live verification cannot fail. The literal was
>   nevertheless replaced, because a realistic `ghp_`-prefixed fake in a public repository trips
>   every scanner and trains people to ignore alerts.

---

## 5. How this stops drifting silently

The protection is not in this repository. It is a setting in GitHub's database that any admin can
weaken from a settings page in about four seconds, with no commit and no history.

| Piece                                                                                          | Runs                   | Blocking?       | What it proves                                     |
| ---------------------------------------------------------------------------------------------- | ---------------------- | --------------- | -------------------------------------------------- |
| [`p0-06-main-protection.certified.json`](./p0-06-main-protection.certified.json)               | —                      | —               | the contract for **both** repositories, as data    |
| [`scripts/verify-github-main-protection.mjs`](../../scripts/verify-github-main-protection.mjs) | live + offline         | exit 1 on drift | the live ruleset still satisfies the contract      |
| `__tests__/ci/github-main-protection-certification.test.ts`                                    | `npm test` → `quality` | **yes**         | the evaluator rejects every weakening, by mutation |
| `.github/workflows/github-protection-certification.yml`                                        | daily + on demand      | no, by design   | the **live** ERP ruleset, re-read on a schedule    |

**Why the live read is not in the `quality` gate.** `quality` is a required check. A live GitHub
API read inside it is a circular lockout: the day the ruleset is wrong is the day you need to
merge a fix, and that is exactly the day the check would refuse. It is also not reliable enough —
anonymous GitHub reads are capped at 60/hour _per IP_ and CI runners share addresses; an
unauthenticated read returned `HTTP 403 "API rate limit exceeded"` while this was being built.

So the blocking half is offline and deterministic, and the live half reports without gating.

### What the automated check can and cannot certify

Stated separately, because conflating them is how the first version went wrong:

| Control                             | Automated, in the scheduled workflow                      | Requires an owner-privileged read |
| ----------------------------------- | --------------------------------------------------------- | --------------------------------- |
| enforcement, target, ref conditions | ✅                                                        | —                                 |
| deletion, force-push, PR required   | ✅                                                        | —                                 |
| conversation resolution             | ✅                                                        | —                                 |
| required checks, strict, on-create  | ✅                                                        | —                                 |
| merge methods, approval floor       | ✅                                                        | —                                 |
| repository visibility               | ✅                                                        | —                                 |
| **bypass actors**                   | ⚠️ **only if the job token is actually served the field** | ⚠️ **in practice, yes**           |

**This row was overstated until defect 6.** It read as though the job token observes
`bypass_actors` for the repository it runs inside. It does not reliably: GitHub Actions
`permissions:` has no scope that grants ruleset access, so the field can be withheld from an
otherwise perfectly authenticated read — which is what the live website run demonstrated.

Where the field is not served, the verifier **fails the control** rather than passing it, the
scheduled job raises an explicit automation warning naming that one field, and the contract
records the **owner attestation** instead. This certification does not claim continuous automated
coverage of a field the workflow cannot see, and it does not store a long-lived administration
token to manufacture that coverage.

### The mutations that prove it has teeth

Each case weakens an in-memory copy of the real snapshot and must produce a failure naming the
right control. **Nothing was mutated on live GitHub** — proving a negative that way would mean
briefly opening `main`.

**Evaluator guards** (15, each disabled in turn) · **snapshot weakenings** (4) · **credential
path** (4) · **workflow** (4, including the DS-33 defect, a stored PAT, `continue-on-error` and
`permissions: write`) · **contract** (6) · **bypass observability** (the defect above, in every
form: absent, undefined, null, four non-array types, populated, anonymous, and no stated
provenance) · **visibility** (public website, unreadable repository) ·
**`dependency-security`** (15).

That last group is this pass's addition and exists because the check only became branch-blocking
after PR #61. Each case removes or weakens the second required website check and must be caught:
the context dropped entirely, re-pointed from integration `15368` to another app, renamed to a
plausible impostor (`dependency-security-report`, `Dependency Security`, `dependency_security`,
`security`), reordered, reduced to a single required check, and the contract's own record of it
deleted. A removal and a re-pointing must produce **different** diagnoses — asserting only that
"something failed" let an earlier mutant live, because a removed context has no integration id
left to compare and failed under the next guard's name instead.

The contract is **directional**, so a mutant adding a _third_ required check must NOT fail: the
live configuration is allowed to be stronger than the record, never weaker. That case is
asserted too, otherwise the ratchet would be a snapshot.

**Visibility transition** (10), added on 2026-09-21 when both repositories went private. Three
here — reopening the closed finding by setting the ERP expectation back to `public`, and turning
the `visibilityIsGovernanceFinding` escape hatch back on for each repository, which would
downgrade a future regression to public from a failure to a shrug. Seven against the website's
workflow guard: flipping the record's visibility heading back to the open state, citing the
ruleset endpoint instead of the rules-in-force one, deleting the statement that the repository
is private again, reintroducing a stale claim that it is still public — once in the contract and
once in the verifier — resurfacing the demand that it be made private, and weakening the
recorded audit gate.

Those mutants are **described rather than quoted**, for the same reason as the defect record
above: this document is scanned too, and reproducing the phrases verbatim fails the build.

One of those ten earned its place immediately. The mutant that injected a stale public claim into
the _verifier_ SURVIVED — and the cause was not a weak guard but a **half-applied edit**: the
script rewriting the workflow had asserted on a second anchor and aborted _after_ editing in
memory, so it never wrote. The guard was correct; the new phrases simply were not in the file
yet. Without that mutant the flip would have shipped looking complete and scanning for the old,
now-unreachable phrases. A guard that cannot fail reads as coverage while providing none.

**Prose guards** (3), added with Defect 4 and each killed by name rather than by the digest test
alone: reinstating the claim that the website is already private, deleting the statement that
private is the _target_, and re-justifying the credential model on repository visibility. All
three also trip the digest check, so each was confirmed against the guard's own test name — the
lesson from the mutant that once survived by failing under a neighbouring control's name.

Three mutants survived earlier passes and the suite was strengthened rather than the result
reported: required-check removal was indistinguishable from re-pointing; deleting the cron line
left `schedule:` bare; and a recorded digest had already gone stale. Digests are now _checked_
by the suite rather than asserted.

Files restored after the battery and verified by SHA-256:

| File                                                    | SHA-256                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `scripts/verify-github-main-protection.mjs`             | `dcc1d1d0a8c22a0415853b34245538e1f8e78b9d25ea56c195e82bee20445515` |
| `docs/security/p0-06-erp-main-ruleset.snapshot.json`    | `d5f7ba2e1d3d8ec2c4434f3b8af1506c298786bd041e5420e3e77a990b9ae182` |
| `.github/workflows/github-protection-certification.yml` | `baebb70268edf9de1c28d1b441a4379c7afc205d1210bdaa012de633998175fe` |
| `docs/security/p0-06-main-protection.certified.json`    | `ff998adbe68c9f0d1c3e31d0903d99ebef03ea48a32a73218ddaf8b0642229b1` |

## 5a. The pull request body is external evidence, audited manually

A pull request body lives in GitHub, not in this repository, so no workflow here can read it
without an API call — and reading the _other_ repository's pull request would need a credential
this design deliberately refuses. Each repository is certified by a workflow running inside it
under its own automatic job token, precisely so that neither holds a credential for the other.
**Adding a personal access token to close this gap would trade a documentation defect for a
standing secret, and that trade is refused.**

So the body stays **external evidence**, audited as a **manual certification step**. What makes
that step deterministic rather than a careful read is `scripts/check-certification-prose.mjs`:

```bash
# committed artefacts only (this runs in CI, inside the required `quality` check)
node scripts/check-certification-prose.mjs

# plus a supplied pull request body, for the manual step
gh pr view 1011 --json body -q .body > /tmp/pr.md   # or paste it by hand
node scripts/check-certification-prose.mjs --body=/tmp/pr.md --repo=erp \
  --expect-head=<current head sha>
```

It enforces three things: forbidden **current-state** claims are absent, a structured
`CURRENT STATE` heading and table assert what the contract asserts, and the reference table
names the current head with no superseded 40-hex SHA presented as current.

**It is built not to cry wolf.** A certification should be able to say _"the repository was
public earlier"_ — forbidding the word outright would make the record less honest, not more. So
a forbidden phrase is only a violation on a line carrying no historical marker, and a few rules
are scoped per repository because the website pull request genuinely changes nothing under
`lib/`. An unscoped version of that rule flagged a **true** sentence, which is how guards get
ignored.

Two rules were tried and removed for the same reason: matching the words _"governance finding"_
flagged both a finding correctly described as closed and the verifier's own conditional notice
string. That invariant now lives where it belongs — as an assertion on the structured field
`visibilityIsGovernanceFinding`, which is the actual control.

**Mutation-proven: 11 body mutants and 4 contract mutants, all killed.** Four survived the first
pass and each exposed a real flaw — historical markers too broad to catch a false closing
sentence, a head check satisfied by the SHA appearing anywhere, a section check satisfied by the
phrase appearing anywhere, and a superseded SHA smuggled into a line that merely _discussed_
historical marking. A control test confirms properly-marked history is still allowed.

---

## 6. Scope

No application behaviour was touched. Nothing here changes pricing, plans, role vocabulary,
tenant architecture, Firebase security semantics, Stripe behaviour, finance or payment logic,
onboarding, currency handling, application UI or public product functionality. `app/`,
`components/`, `lib/`, `hooks/`, `middleware.ts`, `firestore.rules` and `storage.rules` are
untouched.

## 7. Re-running the certification

```bash
node scripts/verify-github-main-protection.mjs --repo=erp      # live, this repository
node scripts/verify-github-main-protection.mjs --snapshot      # offline, against the record
node scripts/verify-github-main-protection.mjs --json          # machine-readable
npx jest __tests__/ci/github-main-protection-certification.test.ts
```

To re-record the snapshot after a _deliberate, reviewed_ protection change — **authenticated, so
that `bypass_actors` is actually observable**:

```bash
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' \
  https://api.github.com/repos/lacreativodesign/nextjs-boilerplate/rulesets/22866162 \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); [d.pop(k,None) for k in ("_links","current_user_can_bypass")]; print(json.dumps(d,indent=2,sort_keys=True))' \
  > docs/security/p0-06-erp-main-ruleset.snapshot.json
# Required: Python and Prettier disagree about short arrays, and `format:check` is a blocking
# gate. Without this the re-recorded snapshot turns `quality` red.
npx prettier --write docs/security/p0-06-erp-main-ruleset.snapshot.json
```

An **unauthenticated** re-record would produce a snapshot whose bypass list cannot certify
anything; `snapshotCapturedBy` in the contract is what states the identity that captured it.

`_links` and `current_user_can_bypass` are dropped because neither is a property of the ruleset —
the first is navigation, the second depends on which credential performed the read.

Update the contract in the same commit, or the suite will fail — which is the intent.
