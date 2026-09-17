# P0-06 — GitHub main branch protection, review and required-check certification

**Status: TECHNICALLY CERTIFIED (ERP) — OWNER ACTION REMAINS**

This document was rewritten after independent review **rejected** the first version of this
certification for two P0 defects. Both are recorded here rather than quietly fixed, because a
certification that hides its own corrections is not evidence of anything.

|                             |                                                                        |
| --------------------------- | ---------------------------------------------------------------------- |
| ERP `main` protection       | verified live, drift-guarded, **certified**                            |
| ERP approving reviews       | `0` — **open gap**, no independent reviewer exists                     |
| Website `main` protection   | **not applied**, and cannot be until the account plan changes          |
| Website visibility          | **must be private** — it was briefly made public; that was a violation |
| Bypass-actor observability  | **was a false green**; now fails closed                                |
| Website history secret scan | complete — **no credential exposed**                                   |

---

## 0. What independent review rejected, and what changed

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

---

## 1. What is actually configured on the ERP repository

`lacreativodesign/nextjs-boilerplate` is **public**, owner `lacreativodesign` (a user account,
not an organisation), default branch `main`.

> **Repository-visibility governance finding.** This repository being public predates P0-06 and
> **was not changed by this work**. It is recorded for owner review, not endorsed: "certified"
> here describes what _is_, not what anyone approved. No visibility change was made to it, and
> none should be made without explicit owner authorisation.

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

## 3. The marketing website — private, unprotected, and blocked on the plan

`lacreativodesign/bizosto-website` **must remain private**. It is certified `private`, and the
verifier fails on any other reading.

While private, the API refuses rulesets outright:

```
GET /repos/lacreativodesign/bizosto-website/rulesets
→ 403 "Upgrade to GitHub Pro or make this repository public to enable this feature."
```

This is a **platform/billing limitation, not a code defect and not a misconfiguration.** GitHub
documents repository rulesets as available on public repositories under Free, and on public and
private repositories under Pro, Team and Enterprise.

**Making the repository public is rejected as the workaround** — see §0. It was done on
2026-09-17 and is being reverted.

> ### OWNER ACTION 2 — upgrade the plan, then protect the branch
>
> 1. **Upgrade the `lacreativodesign` account to GitHub Pro or higher.** Account-level billing;
>    only the owner can do it. It was not attempted here.
> 2. **Confirm the repository is private**, then create the ruleset (the companion PR in
>    `bizosto-website` carries the exact payload and a workflow that verifies it):
>    - enforcement `active`, target `~DEFAULT_BRANCH`, no exclusions;
>    - deletion blocked; non-fast-forward blocked;
>    - pull request required; review conversation resolution required;
>    - strict required status checks;
>    - required check: **`Vercel` only, and only while that is still the live check this
>      repository produces** — it has no `.github` directory, so no Actions workflows and no
>      check runs. Re-confirm before pinning; never require a check it does not emit;
>    - merge-only unless live evidence justifies another method;
>    - **no bypass actors**;
>    - approving reviews stay at `0` until OWNER ACTION 1 is done for this repository.

**Cross-repository access is not assumed.** A job token issued to the ERP repository cannot read
a private `bizosto-website` — GitHub answers 404 — and a read that fails must never be reported
as a certification. Each repository therefore verifies **itself**, from a workflow running inside
it under its own job token: the ERP workflow runs `--repo=erp`, the companion workflow runs
`--repo=website`. Neither holds a credential for the other, and neither can vouch for the other.

---

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

| Control                             | Automated, in the scheduled workflow             | Requires an owner-privileged read |
| ----------------------------------- | ------------------------------------------------ | --------------------------------- |
| enforcement, target, ref conditions | ✅                                               | —                                 |
| deletion, force-push, PR required   | ✅                                               | —                                 |
| conversation resolution             | ✅                                               | —                                 |
| required checks, strict, on-create  | ✅                                               | —                                 |
| merge methods, approval floor       | ✅                                               | —                                 |
| repository visibility               | ✅                                               | —                                 |
| **bypass actors**                   | ✅ **only while the job token can observe them** | ⚠️ otherwise                      |

For the ERP repository the job token observes `bypass_actors` and the control is automated. Where
it cannot — any repository the workflow does not run inside — the verifier **fails the control**
rather than passing it, and the contract records the owner attestation instead. This
certification does not claim continuous automated coverage of a field the workflow cannot see.

### The mutations that prove it has teeth

Each case weakens an in-memory copy of the real snapshot and must produce a failure naming the
right control. **Nothing was mutated on live GitHub** — proving a negative that way would mean
briefly opening `main`.

**Evaluator guards** (15, each disabled in turn) · **snapshot weakenings** (4) · **credential
path** (4) · **workflow** (4, including the DS-33 defect, a stored PAT, `continue-on-error` and
`permissions: write`) · **contract** (6) · **bypass observability** (the defect above, in every
form: absent, undefined, null, four non-array types, populated, anonymous, and no stated
provenance) · **visibility** (public website, unreadable repository).

Three mutants survived earlier passes and the suite was strengthened rather than the result
reported: required-check removal was indistinguishable from re-pointing; deleting the cron line
left `schedule:` bare; and a recorded digest had already gone stale. Digests are now _checked_
by the suite rather than asserted.

Files restored after the battery and verified by SHA-256:

| File                                                    | SHA-256                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `scripts/verify-github-main-protection.mjs`             | `d88ad89868ee8bd9e6948fc9e5710d6b7f6423beded8804128b3a0dd63cdc4f9` |
| `docs/security/p0-06-erp-main-ruleset.snapshot.json`    | `d5f7ba2e1d3d8ec2c4434f3b8af1506c298786bd041e5420e3e77a990b9ae182` |
| `.github/workflows/github-protection-certification.yml` | `f23d4e0a5aaca450d0d27f5cb7ee7d70cb41837ab834fbde57194416d6efec52` |
| `docs/security/p0-06-main-protection.certified.json`    | `c6766f283d11fb364f9adb1431d3e45483a821df9377f52fe5db21c9a8bd5979` |

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
