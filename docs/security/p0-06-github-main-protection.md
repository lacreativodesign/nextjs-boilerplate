# P0-06 — GitHub main branch protection, review and required-check certification

**Status: TECHNICALLY CERTIFIED — OWNER PLATFORM ACTION REMAINS**

Two things are true at once and this document keeps them apart on purpose:

- every protection that can be enforced on `lacreativodesign/nextjs-boilerplate` today **is**
  enforced, verified live rather than assumed, and is now guarded against silent drift;
- **independent human review is not enforceable on either repository yet**, and the Bizosto
  marketing site cannot be protected at all on the current GitHub plan.

"A pull request is required" and "somebody other than the author reviewed it" are different
claims. P0-06 asks for both. Only the first is currently true, and nothing in this repository
should be read as saying otherwise.

Certified against `main` at `70a5403990fdeabe70bb2cd5e1700e60eb683b71` (the merge of PR #1010,
P0-04 Firebase Security Rules behavioural certification), which was confirmed as the live
`origin/main` before any of this work began.

---

## 1. What is actually configured on the ERP repository

`lacreativodesign/nextjs-boilerplate` is **public**, owner `lacreativodesign` (a user account,
not an organisation), default branch `main`.

Protection comes from one repository ruleset, read live from
`GET /repos/lacreativodesign/nextjs-boilerplate/rulesets/22866162` and committed verbatim to
[`p0-06-erp-main-ruleset.snapshot.json`](./p0-06-erp-main-ruleset.snapshot.json):

| Control                         | Live state                                                      | P0-06 requirement        | Verdict      |
| ------------------------------- | --------------------------------------------------------------- | ------------------------ | ------------ |
| Ruleset enforcement             | `active`                                                        | active                   | **PASS**     |
| Target                          | `branch`, `ref_name.include = ["~DEFAULT_BRANCH"]`, no excludes | default branch           | **PASS**     |
| Changes reach main by PR        | `pull_request` rule present                                     | required                 | **PASS**     |
| Branch deletion                 | `deletion` rule present                                         | blocked                  | **PASS**     |
| Force push / history rewrite    | `non_fast_forward` rule present                                 | blocked                  | **PASS**     |
| Unresolved review conversations | `required_review_thread_resolution: true`                       | cannot be bypassed       | **PASS**     |
| Required status checks          | 4 contexts, all confirmed reporting                             | current checks must pass | **PASS**     |
| Up-to-date branch before merge  | `strict_required_status_checks_policy: true`                    | required                 | **PASS**     |
| Checks on branch creation       | `do_not_enforce_on_create: false`                               | enforced                 | **PASS**     |
| Merge methods                   | `["merge"]` only                                                | controlled               | **PASS**     |
| Administrator / bypass path     | `bypass_actors: []`, `current_user_can_bypass: "never"`         | none undocumented        | **PASS**     |
| Second overlapping ruleset      | none — the rulesets list returns exactly one                    | no weakening overlap     | **PASS**     |
| **Approving reviews required**  | **`required_approving_review_count: 0`**                        | at least 1               | **OPEN GAP** |

`current_user_can_bypass` was `never` when read with the repository owner's own credential.
It is recorded here rather than in the snapshot because it is a property of whoever performs
the read, not of the ruleset.

### The required checks are live, not stale

A required check that no longer reports blocks every merge forever, so each context was
confirmed actually reporting and green on `70a5403` before being certified:

| Context                    | Reports as        | App              | Integration id | State at `70a5403` |
| -------------------------- | ----------------- | ---------------- | -------------- | ------------------ |
| `quality`                  | check run         | `github-actions` | 15368          | success            |
| `SonarCloud Code Analysis` | check run         | `sonarqubecloud` | 12526          | success            |
| `sonar`                    | check run         | `github-actions` | 15368          | success            |
| `Vercel`                   | commit **status** | Vercel           | 8329           | success            |

Integration ids are certified alongside the names. A context can be re-pointed at a different
app while keeping its name, which would satisfy a name-only check with a report this
repository never produces.

---

## 2. The open gap: no independent reviewer exists

`required_approving_review_count` is `0`. It was left at `0` deliberately.

`GET /repos/lacreativodesign/nextjs-boilerplate/collaborators` returns exactly one account:

```
lacreativodesign — role_name: admin — id 240409176
```

That is the repository owner, and it is the author of every pull request. GitHub does not
permit a pull request author to approve their own pull request.

So raising the count to `1` today would not add a review. It would make `main` **permanently
unmergeable** — including for the pull request that would put the setting back. The control
would have locked out its own repair, which is a worse outcome than the gap it was meant to
close.

The three things that were **not** done instead, and why:

- **no bot approval** — a bot approving to satisfy a counter is a number, not a review, and it
  would make the certification say something false;
- **no automated self-approval path** — same objection, plus it would be a durable hole;
- **no relaxation elsewhere to compensate** — nothing else was weakened to make this look
  better.

### OWNER ACTION — closing the review gap

Two steps, **in this order**. The second alone produces the lockout described above.

1. **Grant a second human write access** to `lacreativodesign/nextjs-boilerplate`
   (Settings → Collaborators → Add people; `write` is sufficient, `admin` is not required).
   This must be an account that does not author the pull requests it will review.
2. Then set **`required_approving_review_count: 1`** on ruleset 22866162, **and** set
   `pullRequest.requiredApprovingReviewCount.certifiedFloor` to `1` and `gapOpen` to `false`
   in [`p0-06-main-protection.certified.json`](./p0-06-main-protection.certified.json).

Step 2 is guarded: `__tests__/ci/github-main-protection-certification.test.ts` fails if
`gapOpen` is set to `false` while the enforced floor is still `0`, so the gap cannot be closed
on paper while the live ruleset still requires zero approvals.

Worth doing at the same time, once a reviewer exists — both are pointless before then, and
both would cause the same lockout if set early:

- `dismiss_stale_reviews_on_push: true`, so an approval does not survive a later push;
- `require_last_push_approval: true`, so the final push is reviewed by someone who did not
  make it.

---

## 3. The marketing website cannot be protected on the current plan

`lacreativodesign/bizosto-website` is **private**, default branch `main`, head `83ae0648`.

Read live, twice, on two different endpoints:

```
GET /repos/lacreativodesign/bizosto-website/rulesets
→ HTTP 403
  "Upgrade to GitHub Pro or make this repository public to enable this feature."

GET /repos/lacreativodesign/bizosto-website/branches/main
→ "protected": false
```

This is a **platform/billing limitation, not a code defect and not a misconfiguration.**
GitHub Free supports rulesets and protected branches on _public_ repositories only, which is
exactly why the ERP repository can be protected and this one cannot. Nothing in either
repository can change that.

**Making the repository public is rejected as a workaround.** Bizosto's marketing site source
is proprietary, and trading source confidentiality for a branch protection setting is not a
trade this certification will make. Repository visibility was not altered.

### OWNER ACTION — website protection

1. **Upgrade the `lacreativodesign` GitHub account to GitHub Pro or higher.** This is an
   account-level billing change and only the account owner can make it. It was not attempted.
2. Once upgraded, protect `bizosto-website` `main` equivalently to its real CI:
   - pull request required;
   - deletion blocked;
   - force pushes blocked;
   - review conversation resolution required;
   - required status check: **`Vercel`** — that is the _only_ check that reports on this
     repository. It has no `.github` directory and therefore no GitHub Actions workflows at
     all; `Vercel` posts as a commit status and was `success` on `main` at `83ae0648`. Do not
     require a check this repository does not produce;
   - approving reviews: `1` **only once an independent reviewer exists**, for the same reason
     as section 2 — the same single account owns both repositories;
   - no bypass actors.

Until step 1 happens, **P0-06 cannot be fully closed**, and this document should not be edited
to say otherwise.

---

## 4. How this stops drifting silently

The protection is not in this repository. It is a setting in GitHub's database that any admin
can weaken from a settings page in about four seconds, with no commit and no history. Every
gate in `test.yml` would keep passing and none of them would still matter.

Three pieces, split so that detection can never block repair:

| Piece                                                                                          | Runs                   | Blocking?       | What it proves                                     |
| ---------------------------------------------------------------------------------------------- | ---------------------- | --------------- | -------------------------------------------------- |
| [`p0-06-main-protection.certified.json`](./p0-06-main-protection.certified.json)               | —                      | —               | the contract: what must remain true, as data       |
| [`scripts/verify-github-main-protection.mjs`](../../scripts/verify-github-main-protection.mjs) | live + offline         | exit 1 on drift | the live ruleset still satisfies the contract      |
| `__tests__/ci/github-main-protection-certification.test.ts`                                    | `npm test` → `quality` | **yes**         | the evaluator rejects every weakening, by mutation |
| `.github/workflows/github-protection-certification.yml`                                        | daily + on demand      | no, by design   | the _live_ ruleset, re-read on a schedule          |

**Why the live read is not in the `quality` gate.** `quality` is a required check. A live
GitHub API read inside a required check is a circular lockout: the day the ruleset is wrong is
the day you need to merge a fix, and that is exactly the day the check would refuse. The
dependency is also not reliable enough — anonymous GitHub reads are capped at 60/hour _per IP_
and CI runners share addresses. That is not theoretical: while building this, an
unauthenticated read returned `HTTP 403 "API rate limit exceeded"` from a shared address. A
required check must not be able to fail that way.

So the blocking half is offline and deterministic, and the live half reports without gating.

**No stored credential.** The ERP repository is public and GitHub serves the full ruleset —
rule parameters and bypass actor list included — to anonymous callers, which was verified
before the script was written. The workflow uses only the automatic job-scoped `GITHUB_TOKEN`,
for its higher rate limit, and the script retries anonymously if that token is refused. No
personal access token is created, stored or required; a long-lived PAT with
`administration: read` would be a worse posture than the drift it detects. The token is never
printed, never interpolated into a URL and never included in an error message, and the
certification suite asserts all three.

### The mutations that prove it has teeth

Each case weakens an in-memory copy of the real snapshot and must produce a failure naming the
right control — a test that only checked "failed somehow" would pass for the wrong reason.

Approval floor breached · approval parameter deleted · force-push protection removed ·
deletion protection removed · pull request rule removed · each of the four required checks
removed individually · all required checks removed · a required check re-pointed at another
app · strict up-to-date checks disabled · checks skipped on branch creation · conversation
resolution disabled · a bypass actor added · enforcement set to `disabled` · enforcement
downgraded to `evaluate` · default branch no longer targeted · default branch excluded while
still listed as included · ruleset re-targeted to tags · merge methods widened to squash and
rebase · empty response where a ruleset should be.

**Nothing was mutated on live GitHub.** Proving a negative by briefly weakening production
protection would mean briefly opening `main`, which is not a trade worth making for a test.
The mutations are applied to deep copies, and the suite ends by asserting the committed
snapshot and contract are byte-identical afterwards.

### And the tests themselves were mutation-tested

Fixture mutations prove the _evaluator_ rejects bad input. They do not prove the _suite_
would notice if the evaluator stopped checking. So each guard in
`verify-github-main-protection.mjs` was separately disabled — replaced with `if (false)` —
and the suite re-run. Every one must turn it red:

| Disabled guard              | Result       |     | Disabled guard             | Result        |
| --------------------------- | ------------ | --- | -------------------------- | ------------- |
| bypass actors               | 1 failed     |     | integration id comparison  | 1 failed      |
| enforcement                 | 2 failed     |     | `do_not_enforce_on_create` | 1 failed      |
| required rule types         | 3 failed     |     | merge methods              | 1 failed      |
| **required check presence** | **4 failed** |     | approval floor             | 2 failed      |
| strict up-to-date checks    | 1 failed     |     | `ref_name.exclude`         | 1 failed      |
| conversation resolution     | 1 failed     |     | ruleset target             | 1 failed      |
| `ref_name.include`          | 1 failed     |     | null-ruleset guard         | 1 failed      |
| `ok` forced to `true`       | 21 failed    |     | snapshot weakened (×3)     | 4 failed each |

**One mutant initially survived, and the suite was fixed rather than the result reported.**
Disabling the "is this required check still present?" branch left the whole suite passing:
a removed context has no integration id to compare, so the _next_ branch failed instead,
under the same control name and mentioning the same context. The test could not tell
"check removed" from "check re-pointed at another app". Both cases now assert their exact
diagnosis (`is no longer required` vs `moved from integration 15368 to 99999`) and
explicitly assert the _other_ message is absent, which kills the mutant.

A sixth group covers the credential path, which is where a token is most likely to escape.
`fetchLiveRuleset` takes an injectable `fetchImpl` so this is driven rather than grepped:

| Mutation                                                    | Result   |
| ----------------------------------------------------------- | -------- |
| token appended to the request URL                           | 2 failed |
| token interpolated into the failure message                 | 1 failed |
| anonymous retry removed                                     | 2 failed |
| `GH_TOKEN` fallback removed                                 | 1 failed |
| empty `Bearer` header sent when no token is configured      | 1 failed |
| "stronger than certified" downgraded from notice to silence | 1 failed |

A seventh group covers the workflow itself, because a drift detector that silently never
runs is worse than none — the certification would still point at it. DS-33 in this repository
was exactly that: a job-level `if:` reading `secrets` made GitHub reject the whole file at
validation time and every run completed with **zero jobs**, with nothing going red.

| Mutation                                                   | Result   |
| ---------------------------------------------------------- | -------- |
| job-level `if:` reads `secrets` (the DS-33 defect)         | 2 failed |
| a stored PAT secret introduced                             | 2 failed |
| `continue-on-error` escape hatch added                     | 1 failed |
| `permissions` widened to `contents: write`                 | 1 failed |
| schedule trigger removed                                   | 1 failed |
| path filter removed (would burn rate limit on every merge) | 1 failed |
| the verifier step replaced with a no-op                    | 1 failed |

**32 mutants applied, 32 killed, 0 survivors.** Both files were restored afterwards and
verified by SHA-256, identical before and after:

| File                                                    | SHA-256                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `scripts/verify-github-main-protection.mjs`             | `dde29e608e61b1d808c86e0713c5a8269ab1516a6752a57d2f0c7e41ae522eed` |
| `docs/security/p0-06-erp-main-ruleset.snapshot.json`    | `d5f7ba2e1d3d8ec2c4434f3b8af1506c298786bd041e5420e3e77a990b9ae182` |
| `.github/workflows/github-protection-certification.yml` | `171b85cf026d9806df45a39dce5287218fa0ec28b02bcd90f7ce97b1de82970d` |

---

## 5. Scope

No application behaviour was touched. Nothing in this tranche changes pricing, plans, role
vocabulary, tenant architecture, Firebase security semantics, Stripe behaviour, finance or
payment logic, onboarding, currency handling, application UI or public product functionality.
The change adds one dependency-free script, one test suite, one non-blocking workflow and this
evidence; `app/`, `components/`, `lib/`, `hooks/`, `middleware.ts`, `firestore.rules` and
`storage.rules` are untouched.

## 6. Re-running the certification

```bash
node scripts/verify-github-main-protection.mjs             # live read, exits 1 on drift
node scripts/verify-github-main-protection.mjs --snapshot  # offline, against the record
node scripts/verify-github-main-protection.mjs --json      # machine-readable
npx jest __tests__/ci/github-main-protection-certification.test.ts
```

To re-record the snapshot after a _deliberate, reviewed_ protection change:

```bash
curl -s -H 'Accept: application/vnd.github+json' \
  https://api.github.com/repos/lacreativodesign/nextjs-boilerplate/rulesets/22866162 \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); [d.pop(k,None) for k in ("_links","current_user_can_bypass")]; print(json.dumps(d,indent=2,sort_keys=True))' \
  > docs/security/p0-06-erp-main-ruleset.snapshot.json
# Required: Python and Prettier disagree about short arrays, and `format:check` is a
# blocking gate. Without this the re-recorded snapshot turns `quality` red.
npx prettier --write docs/security/p0-06-erp-main-ruleset.snapshot.json
```

`_links` and `current_user_can_bypass` are dropped because neither is a property of the
ruleset — the first is navigation, the second depends on which credential performed the read,
and leaving it in would make the snapshot disagree with itself between readers.

Update the contract in the same commit, or the suite will fail — which is the intent.
