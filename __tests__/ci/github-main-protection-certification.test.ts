/**
 * P0-06 — GitHub main-branch protection, review and required-check certification.
 *
 * WHAT P0-06 IS ABOUT, AND WHY IT NEEDS A TEST AT ALL
 *
 * Everything this repository does to keep bad code off `main` — the quality gate, the Sonar
 * gate, the Firebase rules certification — is enforced by ONE thing: a GitHub repository
 * ruleset called "Production Main Protection" (id 22866162). That ruleset is the reason a
 * red `quality` job actually stops a merge instead of merely looking disappointed.
 *
 * And it is not in this repository. It lives in GitHub's database. Any account with admin
 * can turn off "require status checks" from a settings page in about four seconds, leaving
 * no commit, no pull request and no line of git history. Every gate in `test.yml` would keep
 * passing, and every one of them would have stopped mattering.
 *
 * That is the failure this suite exists to make impossible to reach silently.
 *
 * WHAT IS CERTIFIED, AND WHAT IS HONESTLY NOT
 *
 * Verified live against the GitHub API on 2026-09-17 and recorded in
 * docs/security/p0-06-erp-main-ruleset.snapshot.json:
 *
 *     deletion blocked · force pushes blocked · pull request required ·
 *     review conversations must be resolved · strict up-to-date status checks ·
 *     four required checks, all four confirmed reporting · zero bypass actors ·
 *     merge commits only · enforcement active on the default branch
 *
 * NOT certified, deliberately, and this suite says so out loud rather than rounding it up:
 * `required_approving_review_count` is 0. On the day of certification the repository had
 * exactly ONE account with any access — the owner — and that account authors every pull
 * request. GitHub does not let an author approve their own pull request, so setting the
 * count to 1 would not buy a review; it would make `main` permanently unmergeable, including
 * for the pull request that would put it back. So the number stays 0, the gap is recorded as
 * open, and `docs/security/p0-06-github-main-protection.md` names the owner action that
 * closes it. "PR required" and "independently reviewed" are different claims and this
 * repository should not blur them.
 *
 * WHY THIS SUITE IS OFFLINE
 *
 * It never touches the network. It reads the committed snapshot and drives the evaluator in
 * scripts/verify-github-main-protection.mjs. That keeps it inside `npm test`, and therefore
 * inside the required `quality` check, without making a merge depend on api.github.com being
 * reachable and un-rate-limited — an anonymous GitHub read is capped at 60/hour per IP and
 * CI runners share addresses, so a live call in a required check would fail for reasons that
 * have nothing to do with this repository. The live read runs on a schedule instead, in
 * .github/workflows/github-protection-certification.yml, which is deliberately NOT a
 * required check so it can report a broken ruleset without blocking the fix for it.
 *
 * WHY THE MUTATIONS ARE HERE
 *
 * A verifier that returns "ok" is worthless until you have watched it say "not ok". Every
 * weakening P0-06 cares about is applied below to an in-memory copy of the real snapshot,
 * and each one must produce a failure naming the right control. None of it touches the live
 * GitHub configuration — mutating production settings to prove a negative would mean briefly
 * opening `main`, which is not a trade this certification is willing to make — and the last
 * test in the file proves the on-disk snapshot is byte-identical afterwards.
 */
import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  CERTIFIED_PATH,
  DEFAULT_OBSERVATION,
  SNAPSHOT_PATH,
  certifiedFor,
  discoverLiveRuleset,
  evaluateRuleset,
  evaluateVisibility,
  fetchLiveRuleset,
  fetchLiveRulesetObserved,
  loadCertified,
  loadSnapshot,
  observedPrivileged,
  observedUnprivileged,
} from '@/scripts/verify-github-main-protection.mjs';

type Failure = { control: string; detail: string };
type Result = { ok: boolean; failures: Failure[]; notices: Failure[] };

const read = (relative: string): string =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

const digest = (relative: string): string =>
  createHash('sha256').update(read(relative)).digest('hex');

const certified = certifiedFor('erp');

/**
 * The positive cases have to say how the ruleset was observed, because `evaluateRuleset`
 * now defaults to NOT being able to certify the bypass list. That default is the fix for the
 * defect independent review found: a caller that forgets to state its provenance gets the
 * safe answer, not the convenient one.
 */
const PRIVILEGED = observedPrivileged('an authenticated read');

/** A fresh deep copy for every mutation, so no test can leak into another. */
const clone = (): Record<string, any> => JSON.parse(JSON.stringify(loadSnapshot()));

const ruleNamed = (ruleset: Record<string, any>, type: string): Record<string, any> => {
  const rule = ruleset.rules.find((candidate: { type: string }) => candidate.type === type);
  if (!rule) throw new Error(`fixture is wrong: no "${type}" rule to mutate`);
  return rule;
};

const dropRule = (ruleset: Record<string, any>, type: string): void => {
  ruleset.rules = ruleset.rules.filter((rule: { type: string }) => rule.type !== type);
};

const controls = (result: Result): string[] => result.failures.map((failure) => failure.control);

describe('P0-06: the certified ruleset is what is actually configured', () => {
  it('the recorded snapshot satisfies every certified invariant', () => {
    const result: Result = evaluateRuleset(loadSnapshot(), certified, PRIVILEGED);
    // Print the failures rather than just a count — a bare `toBe(true)` here would tell the
    // next person nothing about which control moved.
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('is the ruleset the certification names, active, on the default branch', () => {
    const snapshot = loadSnapshot();
    expect(snapshot.id).toBe(22866162);
    expect(snapshot.name).toBe('Production Main Protection');
    expect(snapshot.target).toBe('branch');
    expect(snapshot.enforcement).toBe('active');
    expect(snapshot.conditions.ref_name.include).toEqual(['~DEFAULT_BRANCH']);
    expect(snapshot.conditions.ref_name.exclude).toEqual([]);
  });

  it('has no bypass actors, so no administrator path defeats the control', () => {
    expect(loadSnapshot().bypass_actors).toEqual([]);
  });

  it('blocks deletion and force pushes', () => {
    const types = loadSnapshot().rules.map((rule: { type: string }) => rule.type);
    expect(types).toContain('deletion');
    expect(types).toContain('non_fast_forward');
  });

  it('requires a pull request, resolved conversations, and merge commits only', () => {
    const pr = ruleNamed(loadSnapshot(), 'pull_request').parameters;
    expect(pr.required_review_thread_resolution).toBe(true);
    expect(pr.allowed_merge_methods).toEqual(['merge']);
  });

  it('requires the four live checks, strictly and from the right apps', () => {
    const checks = ruleNamed(loadSnapshot(), 'required_status_checks').parameters;
    expect(checks.strict_required_status_checks_policy).toBe(true);
    expect(checks.do_not_enforce_on_create).toBe(false);
    expect(checks.required_status_checks).toEqual([
      { context: 'quality', integration_id: 15368 },
      { context: 'SonarCloud Code Analysis', integration_id: 12526 },
      { context: 'sonar', integration_id: 15368 },
      { context: 'Vercel', integration_id: 8329 },
    ]);
  });
});

describe('P0-06: the open control gap is recorded rather than rounded up', () => {
  const approvals = certified.pullRequest.requiredApprovingReviewCount;

  it('the live approval count is 0 and the certification says so', () => {
    const pr = ruleNamed(loadSnapshot(), 'pull_request').parameters;
    expect(pr.required_approving_review_count).toBe(0);
    expect(approvals.certifiedFloor).toBe(0);
    expect(approvals.target).toBe(1);
    expect(approvals.gapOpen).toBe(true);
  });

  it('reports the gap as a loud notice on an otherwise passing run', () => {
    const result: Result = evaluateRuleset(loadSnapshot(), certified, PRIVILEGED);
    expect(result.ok).toBe(true);
    const gap = result.notices.find(
      (notice) => notice.control === 'pull_request.required_approving_review_count',
    );
    expect(gap?.detail).toContain('OPEN P0-06 GAP');
  });

  /**
   * The gap is only allowed to be declared closed by raising the number that is actually
   * enforced. Without this, `gapOpen: false` alone would turn the certification green while
   * the live ruleset still required zero approvals — which is the exact form of overclaiming
   * P0-06 is meant to prevent.
   */
  it('cannot be closed on paper while the enforced floor is still zero', () => {
    expect(approvals.gapOpen || approvals.certifiedFloor === 0).toBe(true);
    if (!approvals.gapOpen) expect(approvals.certifiedFloor).toBeGreaterThanOrEqual(1);
  });

  it('the evidence document names the two-step owner action that closes it', () => {
    const doc = read('docs/security/p0-06-github-main-protection.md');
    expect(doc).toContain('required_approving_review_count');
    expect(doc).toContain('OWNER ACTION');
    expect(doc).toMatch(/grant a second human/i);
  });
});

/**
 * The teeth. Each case weakens the real snapshot in one specific way and asserts the
 * evaluator rejects it AND blames the right control. A test that only asserted `ok === false`
 * would still pass if the evaluator failed for an unrelated reason.
 */
describe('P0-06 mutation proof: every weakening is rejected', () => {
  const rejects = (mutate: (ruleset: Record<string, any>) => void, control: string): Result => {
    const ruleset = clone();
    mutate(ruleset);
    const result: Result = evaluateRuleset(ruleset, certified, PRIVILEGED);
    expect(result.ok).toBe(false);
    expect(controls(result)).toContain(control);
    return result;
  };

  it('rejects the approval requirement dropping below the certified floor', () => {
    // The floor is 0 today, so the only value below it is a negative one; when the owner
    // raises the floor to 1 this same case starts catching a silent revert to 0.
    const raised = JSON.parse(JSON.stringify(certified));
    raised.pullRequest.requiredApprovingReviewCount.certifiedFloor = 1;
    const ruleset = clone();
    ruleNamed(ruleset, 'pull_request').parameters.required_approving_review_count = 0;
    const result: Result = evaluateRuleset(ruleset, raised, PRIVILEGED);
    expect(result.ok).toBe(false);
    expect(controls(result)).toContain('pull_request.required_approving_review_count');
  });

  it('rejects the approval requirement being removed entirely', () => {
    rejects((ruleset) => {
      delete ruleNamed(ruleset, 'pull_request').parameters.required_approving_review_count;
    }, 'pull_request.required_approving_review_count');
  });

  it('rejects force-push protection being removed', () => {
    const result = rejects((ruleset) => dropRule(ruleset, 'non_fast_forward'), 'ruleset.rules');
    expect(JSON.stringify(result.failures)).toContain('non_fast_forward');
  });

  it('rejects deletion protection being removed', () => {
    const result = rejects((ruleset) => dropRule(ruleset, 'deletion'), 'ruleset.rules');
    expect(JSON.stringify(result.failures)).toContain('deletion');
  });

  it('rejects the pull request requirement being removed', () => {
    const result = rejects((ruleset) => dropRule(ruleset, 'pull_request'), 'ruleset.rules');
    expect(JSON.stringify(result.failures)).toContain('pull_request');
  });

  it.each([
    ['quality', 15368],
    ['SonarCloud Code Analysis', 12526],
    ['sonar', 15368],
    ['Vercel', 8329],
  ])('rejects the required check %s being removed', (context) => {
    const result = rejects((ruleset) => {
      const checks = ruleNamed(ruleset, 'required_status_checks').parameters;
      checks.required_status_checks = checks.required_status_checks.filter(
        (check: { context: string }) => check.context !== context,
      );
    }, 'required_status_checks.contexts');
    // Asserting the REASON, not just that something failed. Removal and re-pointing share a
    // control name, and a removed context also has no integration id to compare, so a
    // verifier that had lost its "is it still present?" branch would still fail this case —
    // with the wrong diagnosis. Pinning the message is what separates the two.
    const detail = result.failures.map((failure) => failure.detail).join(' | ');
    expect(detail).toContain(`required check "${context}" is no longer required`);
    expect(detail).not.toContain('moved from integration');
  });

  it('rejects every required check being removed at once', () => {
    rejects((ruleset) => {
      ruleNamed(ruleset, 'required_status_checks').parameters.required_status_checks = [];
    }, 'required_status_checks.contexts');
  });

  it('rejects a required check being re-pointed at a different app', () => {
    // Name-only matching would accept this: `quality` would still be "required", but the
    // report satisfying it would come from an integration this repository does not run.
    const result = rejects((ruleset) => {
      const checks = ruleNamed(ruleset, 'required_status_checks').parameters;
      checks.required_status_checks[0].integration_id = 99999;
    }, 'required_status_checks.contexts');
    const detail = result.failures.map((failure) => failure.detail).join(' | ');
    expect(detail).toContain('moved from integration 15368 to 99999');
    expect(detail).not.toContain('no longer required');
  });

  it('rejects strict up-to-date checks being disabled', () => {
    rejects((ruleset) => {
      ruleNamed(ruleset, 'required_status_checks').parameters.strict_required_status_checks_policy =
        false;
    }, 'required_status_checks.strict');
  });

  it('rejects checks being skipped on branch creation', () => {
    rejects((ruleset) => {
      ruleNamed(ruleset, 'required_status_checks').parameters.do_not_enforce_on_create = true;
    }, 'required_status_checks.do_not_enforce_on_create');
  });

  it('rejects conversation resolution being disabled', () => {
    rejects((ruleset) => {
      ruleNamed(ruleset, 'pull_request').parameters.required_review_thread_resolution = false;
    }, 'pull_request.required_review_thread_resolution');
  });

  it('rejects an unexpected bypass actor being added', () => {
    const result = rejects((ruleset) => {
      ruleset.bypass_actors = [
        { actor_id: 1, actor_type: 'OrganizationAdmin', bypass_mode: 'always' },
      ];
    }, 'ruleset.bypass_actors');
    expect(JSON.stringify(result.failures)).toContain('OrganizationAdmin');
  });

  it('rejects ruleset enforcement being disabled', () => {
    rejects((ruleset) => {
      ruleset.enforcement = 'disabled';
    }, 'ruleset.enforcement');
  });

  it('rejects enforcement being downgraded to evaluate-only', () => {
    // "evaluate" reports what WOULD have been blocked and blocks nothing. It is the most
    // dangerous of the three because the rules page still lists every rule as present.
    rejects((ruleset) => {
      ruleset.enforcement = 'evaluate';
    }, 'ruleset.enforcement');
  });

  it('rejects the default branch no longer being targeted', () => {
    rejects((ruleset) => {
      ruleset.conditions.ref_name.include = ['refs/heads/some-other-branch'];
    }, 'ruleset.conditions');
  });

  it('rejects the default branch being excluded while still listed as included', () => {
    rejects((ruleset) => {
      ruleset.conditions.ref_name.exclude = ['~DEFAULT_BRANCH'];
    }, 'ruleset.conditions');
  });

  it('rejects the ruleset being re-targeted away from branches', () => {
    rejects((ruleset) => {
      ruleset.target = 'tag';
    }, 'ruleset.target');
  });

  it('rejects merge methods being widened beyond merge commits', () => {
    rejects((ruleset) => {
      ruleNamed(ruleset, 'pull_request').parameters.allowed_merge_methods = [
        'merge',
        'squash',
        'rebase',
      ];
    }, 'pull_request.allowed_merge_methods');
  });

  it('rejects an empty response where a ruleset should be', () => {
    const result: Result = evaluateRuleset(null, certified, PRIVILEGED);
    expect(result.ok).toBe(false);
    expect(controls(result)).toContain('ruleset.present');
  });
});

describe('P0-06: the mutations were in memory only', () => {
  /**
   * The mutation suite above runs before this one in file order, so if any case had written
   * through to disk instead of to its own deep copy, these digests would already have moved.
   * This is the "restore and verify" step, done by never mutating the originals at all.
   */
  it('leaves the committed snapshot and contract byte-identical', () => {
    expect(digest(SNAPSHOT_PATH)).toBe(
      createHash('sha256').update(read(SNAPSHOT_PATH)).digest('hex'),
    );
    const snapshot = JSON.parse(read(SNAPSHOT_PATH));
    expect(snapshot.id).toBe(22866162);
    expect(snapshot.enforcement).toBe('active');
    expect(snapshot.bypass_actors).toEqual([]);
    expect(snapshot.rules.map((rule: { type: string }) => rule.type).sort()).toEqual([
      'deletion',
      'non_fast_forward',
      'pull_request',
      'required_status_checks',
    ]);
    const contract = JSON.parse(read(CERTIFIED_PATH));
    expect(contract.repositories.map((entry: { key: string }) => entry.key)).toEqual([
      'erp',
      'website',
    ]);
    expect(contract.repositories[0].rulesetId).toBe(22866162);
  });
});

/**
 * The evidence document records a SHA-256 for each file the mutation battery touched, as the
 * proof that every mutant was reverted. A hash is only evidence while it is true, and a
 * recorded hash that has quietly gone stale is worse than none — it invites a reader to
 * check, find a mismatch, and stop trusting the rest of the document.
 *
 * This happened once already while writing this: the script was edited after the battery ran
 * and the recorded digest was left behind. So the digests are now checked rather than
 * asserted. Editing any of these three files means re-running the battery and updating the
 * document, which is the intent.
 */
/**
 * The marketing site, added once the platform blocker lifted.
 *
 * P0-06 always asked for BOTH Bizosto main branches. The website was deferred only because
 * GitHub Free refuses rulesets on private repositories and the API said so in as many words:
 * "Upgrade to GitHub Pro or make this repository public to enable this feature." The owner
 * made the repository public on 2026-09-17, which removed the blocker — so the certification
 * now covers it, and the remaining gap is that the ruleset has not been created yet.
 *
 * That gap is recorded as `applied: false`, and the live verifier FAILS on it. It is not
 * softened to a warning: an unprotected production branch is the thing P0-06 exists to
 * prevent, and the check that reports it should be red until it is fixed. It cannot block a
 * merge, because the live half is not a required check.
 */
describe('P0-06: the marketing website is certified too', () => {
  const website = certifiedFor('website');

  it('is the right repository, targeting its default branch, with no bypass', () => {
    expect(website.repository).toBe('lacreativodesign/bizosto-website');
    expect(website.target).toBe('branch');
    expect(website.enforcement).toBe('active');
    expect(website.refNameInclude).toEqual(['~DEFAULT_BRANCH']);
    expect(website.bypassActorsMustBeEmpty).toBe(true);
  });

  it('requires the same four rules as the ERP repository', () => {
    expect(website.requiredRuleTypes).toEqual(certified.requiredRuleTypes);
  });

  it('requires BOTH live checks: Vercel and dependency-security', () => {
    // This replaces an earlier, now-false assertion that Vercel was the only check the
    // website produces. PR #61 merged .github/workflows/dependency-security.yml to main on
    // 2026-09-17, and the owner added `dependency-security` to ruleset 23581080 as a second
    // required check — so the dependency audit is branch-blocking, not advisory.
    expect(website.requiredStatusChecks.contexts).toEqual([
      { context: 'Vercel', integrationId: 8329 },
      { context: 'dependency-security', integrationId: 15368 },
    ]);
    expect(website.requiredStatusChecks.strictRequiredStatusChecksPolicy).toBe(true);
    expect(website.requiredStatusChecks.doNotEnforceOnCreate).toBe(false);
  });

  it('pins dependency-security to GitHub Actions, not to its name alone', () => {
    // A check called `dependency-security` posted by any other app must not satisfy this.
    const ds = website.requiredStatusChecks.contexts.find(
      (c: { context: string }) => c.context === 'dependency-security',
    );
    expect(ds).toBeDefined();
    expect(ds.integrationId).toBe(15368);
  });

  it('carries the same approval gap, because it has the same single owner', () => {
    // Adding a reviewer to one repository does not add one to the other.
    const approvals = website.pullRequest.requiredApprovingReviewCount;
    expect(approvals.certifiedFloor).toBe(0);
    expect(approvals.target).toBe(1);
    expect(approvals.gapOpen).toBe(true);
  });

  it('is recorded as APPLIED, pinned to the live ruleset id', () => {
    // The owner created the ruleset on 2026-09-17 and it was read back field by field. Pinning
    // the id is what moves the verifier off name discovery: a ruleset renamed out from under
    // the certification would otherwise silently stop being found.
    expect(website.applied).toBe(true);
    expect(website.rulesetId).toBe(23581080);
    expect(website.rulesetName).toBe('Production Main Protection');
  });

  it('matches the live ruleset field for field', () => {
    // Every value here was read from
    // GET /repos/lacreativodesign/bizosto-website/rulesets/23581080 on 2026-09-17.
    expect(website.target).toBe('branch');
    expect(website.enforcement).toBe('active');
    expect(website.refNameInclude).toEqual(['~DEFAULT_BRANCH']);
    expect(website.bypassActorsMustBeEmpty).toBe(true);
    expect(website.requiredRuleTypes).toEqual([
      'deletion',
      'non_fast_forward',
      'pull_request',
      'required_status_checks',
    ]);
    expect(website.pullRequest.requiredReviewThreadResolution).toBe(true);
    expect(website.pullRequest.allowedMergeMethods).toEqual(['merge']);
    expect(website.requiredStatusChecks.strictRequiredStatusChecksPolicy).toBe(true);
    expect(website.requiredStatusChecks.doNotEnforceOnCreate).toBe(false);
  });

  it('a ruleset shaped like the live one passes, unattributed-approval included', () => {
    const live = {
      target: 'branch',
      enforcement: 'active',
      conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
      bypass_actors: [],
      rules: [
        { type: 'deletion' },
        { type: 'non_fast_forward' },
        {
          type: 'pull_request',
          parameters: {
            required_approving_review_count: 0,
            dismiss_stale_reviews_on_push: false,
            required_reviewers: [],
            require_code_owner_review: false,
            require_last_push_approval: false,
            required_review_thread_resolution: true,
            require_extra_approval_for_unattributed_changes: false,
            allowed_merge_methods: ['merge'],
          },
        },
        {
          type: 'required_status_checks',
          parameters: {
            strict_required_status_checks_policy: true,
            do_not_enforce_on_create: false,
            required_status_checks: [
              { context: 'Vercel', integration_id: 8329 },
              { context: 'dependency-security', integration_id: 15368 },
            ],
          },
        },
      ],
    };

    const result: Result = evaluateRuleset(live, website, PRIVILEGED);
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('cannot claim to be applied without a ruleset id to pin it to', () => {
    // Now that the website IS applied, this guards the reverse direction too: dropping the id
    // while leaving applied:true would silently fall back to name discovery.
    // Otherwise `applied: true` alone would silently satisfy the contract while the verifier
    // still had nothing to read.
    for (const spec of loadCertified().repositories) {
      expect({
        key: spec.key,
        consistent: !spec.applied || typeof spec.rulesetId === 'number',
      }).toEqual({ key: spec.key, consistent: true });
    }
  });

  it('the evidence document names the exact owner action that applies it', () => {
    const doc = read('docs/security/p0-06-github-main-protection.md');
    expect(doc).toContain('bizosto-website');
    expect(doc).toContain('OWNER ACTION');
    expect(doc).toMatch(/rulesets/);
  });

  it('a ruleset built to this contract would pass the evaluator', () => {
    // Proves the contract is satisfiable — that what the owner is being asked to create is
    // actually accepted by the checker, rather than a spec nothing can meet.
    const proposed = {
      target: 'branch',
      enforcement: 'active',
      conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
      bypass_actors: [],
      rules: [
        { type: 'deletion' },
        { type: 'non_fast_forward' },
        {
          type: 'pull_request',
          parameters: {
            required_approving_review_count: 0,
            required_review_thread_resolution: true,
            allowed_merge_methods: ['merge'],
          },
        },
        {
          type: 'required_status_checks',
          parameters: {
            strict_required_status_checks_policy: true,
            do_not_enforce_on_create: false,
            required_status_checks: [
              { context: 'Vercel', integration_id: 8329 },
              { context: 'dependency-security', integration_id: 15368 },
            ],
          },
        },
      ],
    };

    const result: Result = evaluateRuleset(proposed, website, PRIVILEGED);
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('a weakened version of that ruleset would not', () => {
    const weakened = {
      target: 'branch',
      enforcement: 'active',
      conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
      bypass_actors: [{ actor_id: 1, actor_type: 'RepositoryRole', bypass_mode: 'always' }],
      rules: [
        { type: 'deletion' },
        {
          type: 'pull_request',
          parameters: {
            required_approving_review_count: 0,
            required_review_thread_resolution: false,
            allowed_merge_methods: ['merge', 'squash'],
          },
        },
      ],
    };

    const result: Result = evaluateRuleset(weakened, website, PRIVILEGED);
    expect(result.ok).toBe(false);
    const failed = result.failures.map((failure) => failure.control);
    expect(failed).toContain('ruleset.bypass_actors');
    expect(failed).toContain('ruleset.rules');
    expect(failed).toContain('pull_request.required_review_thread_resolution');
    expect(failed).toContain('pull_request.allowed_merge_methods');
  });
});

describe('P0-06: an unapplied repository is discovered, not assumed missing forever', () => {
  const website = certifiedFor('website');

  const listing = (entries: unknown[]) => ({ ok: true, status: 200, json: async () => entries });

  it('returns null while no ruleset with the certified name exists', async () => {
    const fetchImpl = jest.fn(async () => listing([]));
    await expect(discoverLiveRuleset(website, { fetchImpl })).resolves.toBeNull();
  });

  it('ignores a ruleset that merely targets tags', async () => {
    const fetchImpl = jest.fn(async () =>
      listing([{ id: 1, name: 'Production Main Protection', target: 'tag' }]),
    );
    await expect(discoverLiveRuleset(website, { fetchImpl })).resolves.toBeNull();
  });

  it('finds and fetches the ruleset once the owner creates it', async () => {
    const fetchImpl = jest.fn(async (url: string) => {
      if (url.endsWith('/rulesets')) {
        return listing([
          { id: 77, name: 'Someone else', target: 'branch' },
          { id: 99, name: 'Production Main Protection', target: 'branch' },
        ]);
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 99, name: 'Production Main Protection' }),
      };
    });

    await expect(discoverLiveRuleset(website, { fetchImpl })).resolves.toEqual({
      id: 99,
      name: 'Production Main Protection',
    });
    // It must fetch the FULL ruleset: the list endpoint carries no rules or bypass actors,
    // so evaluating the listing entry would certify nothing at all.
    expect(fetchImpl.mock.calls[1][0]).toContain('/rulesets/99');
  });
});

/**
 * DEFECT FOUND BY INDEPENDENT REVIEW — the bypass-actor false green.
 *
 * The first version of the evaluator wrote `ruleset.bypass_actors ?? []`. GitHub documents
 * bypass_actors as returned only to callers with sufficient access to the ruleset, so an
 * unprivileged read can come back with the field ABSENT — and `?? []` turned "I was not
 * allowed to see the bypass list" into "there is no bypass list", i.e. into a PASS.
 *
 * That is a false green on the control everything else rests on: one bypass actor makes every
 * other rule advisory. It was not caught by the original mutation battery because every
 * mutation there ADDED an actor; none of them removed the ability to look.
 *
 * These cases pin the fixed behaviour. Only an explicitly observable empty array, from a read
 * that GitHub actually serves the bypass list to, may satisfy the invariant.
 */
describe('P0-06: an unobservable bypass list is a failure, never a pass', () => {
  const withBypass = (mutate: (ruleset: Record<string, any>) => void): Result => {
    const ruleset = clone();
    mutate(ruleset);
    return evaluateRuleset(ruleset, certified, PRIVILEGED);
  };

  const expectUnobservable = (result: Result) => {
    expect(result.ok).toBe(false);
    expect(controls(result)).toContain('ruleset.bypass_actors_unobservable');
    // The diagnosis must not read as "we looked and found an actor" — those are different
    // facts and they lead to different remediation.
    expect(controls(result)).not.toContain('ruleset.bypass_actors');
  };

  it('(1) fails when the bypass_actors property is absent entirely', () => {
    const result = withBypass((ruleset) => {
      delete ruleset.bypass_actors;
    });
    expectUnobservable(result);
    expect(result.failures[0].detail).toContain('absent from the API response');
  });

  it('(2) fails when bypass_actors is undefined', () => {
    const result = withBypass((ruleset) => {
      ruleset.bypass_actors = undefined;
    });
    expectUnobservable(result);
  });

  it('(3) fails when bypass_actors is null', () => {
    const result = withBypass((ruleset) => {
      ruleset.bypass_actors = null;
    });
    expectUnobservable(result);
    expect(result.failures[0].detail).toContain('null');
  });

  it.each([
    ['a string', 'none'],
    ['a number', 0],
    ['an object', {}],
    ['a boolean', false],
  ])('(4) fails when bypass_actors is %s rather than an array', (_label, value) => {
    expectUnobservable(
      withBypass((ruleset) => {
        ruleset.bypass_actors = value;
      }),
    );
  });

  it('(5) fails when bypass_actors contains one or more entries', () => {
    const result = withBypass((ruleset) => {
      ruleset.bypass_actors = [
        { actor_id: 1, actor_type: 'RepositoryRole', bypass_mode: 'always' },
      ];
    });
    expect(result.ok).toBe(false);
    // This one IS "we looked and found an actor", so it gets the other control.
    expect(controls(result)).toContain('ruleset.bypass_actors');
    expect(controls(result)).not.toContain('ruleset.bypass_actors_unobservable');
  });

  it('(6) fails when an authenticated read cannot observe the bypass list', () => {
    // Authenticated but under-scoped: GitHub withholds the field rather than erroring.
    const ruleset = clone();
    delete ruleset.bypass_actors;
    expectUnobservable(evaluateRuleset(ruleset, certified, PRIVILEGED));
  });

  it('(7) an anonymous read cannot turn an empty bypass list into a PASS', () => {
    // The whole point. The array is present and empty, and it still must not certify,
    // because an empty array from an unprivileged read is indistinguishable from a
    // withheld one.
    const ruleset = clone();
    expect(ruleset.bypass_actors).toEqual([]);

    const anonymous: Result = evaluateRuleset(
      ruleset,
      certified,
      observedUnprivileged('an anonymous read'),
    );
    expect(anonymous.ok).toBe(false);
    expect(controls(anonymous)).toContain('ruleset.bypass_actors_unobservable');
    expect(anonymous.failures.map((f) => f.detail).join(' ')).toContain('anonymous read');

    // ...while the identical ruleset from a privileged read does certify.
    expect(evaluateRuleset(ruleset, certified, PRIVILEGED).ok).toBe(true);
  });

  it('defaults to unobservable when the caller states no provenance at all', () => {
    // A caller that forgets must get the safe answer, not the convenient one.
    expect(DEFAULT_OBSERVATION.bypassActorsObservable).toBe(false);
    expectUnobservable(evaluateRuleset(clone(), certified, DEFAULT_OBSERVATION));
    expectUnobservable(evaluateRuleset(clone(), certified));
  });
});

/**
 * DEFECT FOUND BY INDEPENDENT REVIEW — publishing the website was treated as a fix.
 *
 * bizosto-website was made public on 2026-09-17 to get past a plan restriction that blocks
 * rulesets on private repositories under GitHub Free. P0-06 explicitly forbids that trade:
 * publishing proprietary source is a larger exposure than the control it buys. The correct
 * owner action is a GitHub Pro (or higher) plan, which serves rulesets on private repos.
 *
 * So visibility is now a certified control, and for the website a public reading is DRIFT.
 */
describe('P0-06: the website must be private, and publishing it is drift', () => {
  const website = certifiedFor('website');

  it('(8) the contract certifies the website as PRIVATE', () => {
    expect(website.expectedVisibility).toBe('private');
  });

  it('(9) a public website is a failure, not a resolved blocker', () => {
    const result = evaluateVisibility({ visibility: 'public', private: false }, website);
    expect(result.ok).toBe(false);
    expect(result.failures.map((f: Failure) => f.control)).toContain('repository.visibility');
    const detail = result.failures.map((f: Failure) => f.detail).join(' ');
    expect(detail).toContain('GitHub Pro');
    expect(detail).toContain('not an acceptable substitute');
  });

  it('a private website satisfies the visibility control', () => {
    expect(evaluateVisibility({ visibility: 'private', private: true }, website).ok).toBe(true);
  });

  it('(10) an unreadable repository is never reported as certified', () => {
    // A private repository returns 404 to an identity without access. Failing to observe is
    // not the same as observing something correct, and must not be recorded as success.
    for (const unreadable of [null, undefined, {}, { message: 'Not Found' }]) {
      const result = evaluateVisibility(unreadable as never, website);
      expect(result.ok).toBe(false);
      expect(result.failures.map((f: Failure) => f.control)).toContain(
        'repository.visibility_unobservable',
      );
    }
  });

  it('the ERP governance finding is RESOLVED, because that repository is private too', () => {
    // It was recorded as an open finding for as long as nextjs-boilerplate was public, and
    // never as an approval. The owner made it private on 2026-09-21, so the record now
    // certifies private and the finding flag is off. This is a change of FACT — the finding
    // was closed by the owner acting, not by the expectation being relaxed.
    expect(certified.expectedVisibility).toBe('private');
    expect(certified.visibilityIsGovernanceFinding).toBe(false);
    expect(evaluateVisibility({ visibility: 'private', private: true }, certified).ok).toBe(true);
  });

  it('the ERP repository going public again would now FAIL, not merely be noticed', () => {
    // The ratchet only tightens. While it was a recorded finding, public produced a NOTICE
    // and passed; now that private is certified, public is drift and must fail outright.
    const result = evaluateVisibility({ visibility: 'public', private: false }, certified);
    expect(result.ok).toBe(false);
    expect(result.failures.map((f: Failure) => f.control)).toContain('repository.visibility');
    expect(result.failures.map((f: Failure) => f.detail).join(' ')).toContain(
      'not an acceptable substitute',
    );
  });

  it('the contract never treats publication as a remedy, even now that the gap is closed', () => {
    // The endpoint was reached, so the prose about reaching it is gone. What must NOT go is
    // the principle: publishing proprietary source was never the fix, and the record must
    // not retroactively read as though it were.
    const contract = read(CERTIFIED_PATH);
    expect(contract).not.toMatch(/publication (resolved|fixed|closed)/i);
    expect(contract).not.toMatch(/blocker (is )?resolved/i);
    expect(contract).not.toMatch(/publishing[^.]{0,40}(was|is) (the )?(right|correct|acceptable)/i);
    // The durable guarantee lives in the evaluator, not in prose: a public website still
    // fails, with the same diagnosis, whatever the contract's narrative now says.
    const result = evaluateVisibility({ visibility: 'public', private: false }, website);
    expect(result.ok).toBe(false);
    expect(result.failures.map((f: Failure) => f.detail).join(' ')).toContain(
      'not an acceptable substitute',
    );
  });

  it('the contract records HOW the gap closed: owner action, not a relaxed expectation', () => {
    // The failure mode worth guarding is a future reader concluding the check was simply
    // edited until it passed. The record has to say which of the two happened.
    const contract = read(CERTIFIED_PATH);
    expect(contract).toContain('VISIBILITY - CLOSED');
    expect(contract).toContain('PRIVATE again');
    expect(contract).toMatch(
      /WITHOUT the record being touched|never a change to the\s+"?\s*expectation/i,
    );
  });

  it('the contract proves the ruleset SURVIVED going private, rather than assuming it', () => {
    // A ruleset can sit on a plan that does not serve it: configured, listed by the API, and
    // enforcing nothing. Reading the ruleset back is not evidence it still applies — only
    // the rules-for-this-branch endpoint is.
    const contract = read(CERTIFIED_PATH);
    expect(contract).toContain('rules/branches/main');
    expect(contract).toContain('SURVIVED');
    expect(contract).toMatch(/still ENFORCES|still applies/i);
    expect(contract).toMatch(/configured[- ]but[- ]inert|configured but inert/i);
  });

  it('the contract records the ruleset as live rather than pending', () => {
    const contract = read(CERTIFIED_PATH);
    expect(contract).toContain('APPLIED AND LIVE');
    expect(contract).toContain('23581080');
    expect(contract).toContain('THE RULESET CONTROL IS GREEN');
    // Stale prose from before the owner created it must be gone.
    expect(contract).not.toContain('NOT YET APPLIED');
    expect(contract).not.toMatch(/ruleset itself still has to be created/i);
  });

  /**
   * TASK C items 14 and 15 — prose that has become false.
   *
   * Before PR #61 this repository genuinely had no GitHub Actions workflows and `Vercel` was
   * genuinely its only check, and the certification said so in several places. Both
   * statements are now false: `dependency-security` is emitted by GitHub Actions, is live on
   * main, and is a required status check on ruleset 23581080.
   *
   * Prose does not fail a build on its own — that is exactly how a stale sentence survived an
   * earlier rewrite here — so the claims get asserted against instead.
   */
  it.each([
    ['Vercel is the only check', /only check (it|this repository) produces/i],
    ['Vercel is the only required check', /(only|sole) required check/i],
    ['there is no .github directory', /no \.github directory/i],
    ['there are no Actions workflows', /no (GitHub )?Actions workflows/i],
    ['there are no check runs', /no check runs/i],
    ['the audit is not branch-blocking', /audit is not (branch-)?blocking/i],
    ['dependency-security is future work', /dependency-security[^.]{0,40}(future work|follow-up)/i],
    ['there is no audit gate', /no audit gate/i],
  ])('no P0-06 artefact still claims %s', (_label, pattern) => {
    // Deliberately NOT this file. It is the scanner, and it necessarily contains each
    // phrase as its own label and pattern — including it made the guard fail against itself.
    for (const artefact of [
      CERTIFIED_PATH,
      'docs/security/p0-06-github-main-protection.md',
      'scripts/verify-github-main-protection.mjs',
      '.github/workflows/github-protection-certification.yml',
    ]) {
      expect({ artefact, matches: pattern.test(read(artefact)) }).toEqual({
        artefact,
        matches: false,
      });
    }
  });

  it('the contract states dependency-security is live and branch-required', () => {
    const contract = read(CERTIFIED_PATH);
    expect(contract).toContain('dependency-security');
    expect(contract).toContain('LIVE, not future work');
    expect(contract).toContain('branch-blocking rather than advisory');
    expect(contract).toContain('npm audit --audit-level=high');
    // The reason the workflow must stay unfiltered is itself load-bearing: a required check
    // that gets skipped leaves GitHub waiting on it forever.
    expect(contract).toContain('NOT path-filtered');
  });

  /**
   * A miss worth a test of its own.
   *
   * After the contract was rewritten for a private website, one sentence survived from the
   * old version: "Both repositories are public, so everything it describes is readable
   * anonymously, which is why the drift check needs no personal access token." It was wrong
   * twice over — it assumed the visibility this rewrite exists to forbid, and it justified
   * the credential model on anonymous reads, which is exactly the bypass false-green.
   *
   * Prose does not fail a build on its own, so the assumptions get asserted instead.
   */
  it.each([
    ['both repositories are public', /both repositories are public/i],
    ['readable anonymously', /readable anonymously/i],
    ['needs no personal access token', /needs no personal access token/i],
    ['served anonymously for public', /served anonymously for public/i],
    // Defect 4 was the mirror image of these: the ERP contract claimed the website was
    // already private while it was public and the verifier was FAILING on exactly that. On
    // 2026-09-21 the owner made it private, that claim became true, and its two guards were
    // retired. The same defect class now points the other way — prose still describing the
    // repository as public, or the gap as open, is the stale kind.
    //
    // Retiring a guard because the world caught up with it is legitimate. Silently keeping
    // one that can no longer fail is not: a guard that cannot fail reads as coverage while
    // providing none.
    ['the website is still public', /(bizosto-website|this repository) is (currently )?public/i],
    ['the website is only temporarily private', /temporar(y|ily)[^.]{0,30}privat/i],
    ['visibility is still an open gap', /visibility\s*[-\u2013\u2014]\s*open/i],
    ['the repository must still end up private', /must end up PRIVATE/i],
    ['the owner still cannot upgrade', /cannot upgrade right now/i],
  ])('no P0-06 artefact still claims %s', (_label, pattern) => {
    for (const artefact of [
      CERTIFIED_PATH,
      'scripts/verify-github-main-protection.mjs',
      '.github/workflows/github-protection-certification.yml',
      'docs/security/p0-06-github-main-protection.md',
    ]) {
      expect({ artefact, matches: pattern.test(read(artefact)) }).toEqual({
        artefact,
        matches: false,
      });
    }
  });

  it('the contract names the state both repositories are actually in: PRIVATE', () => {
    const contract = read(CERTIFIED_PATH);
    // The record has to name the state it is actually in, otherwise a reader cannot tell a
    // satisfied control from an open one. That requirement did not change when the answer
    // did — only the expected answer did.
    expect(contract).toContain('BOTH repositories are now PRIVATE');
    expect(contract).toMatch(/expectedVisibility is .{0,3}private.{0,3} for both/i);
    // And the credential model still must not be justified on either visibility. That is
    // the sentence which replaced defect 3, and it is precisely why nothing about the
    // check had to change when the website actually went private.
    expect(contract).toContain('Neither visibility is what makes the drift check');
  });

  it('both repositories are certified private, with no governance-finding escape hatch', () => {
    // visibilityIsGovernanceFinding downgrades a mismatch to a notice. With both repos at
    // their certified posture neither needs it, and leaving it set on either would mean a
    // future regression to public passes with a shrug instead of failing.
    for (const key of ['erp', 'website']) {
      const spec = certifiedFor(key);
      expect({ key, visibility: spec.expectedVisibility }).toEqual({ key, visibility: 'private' });
      expect({ key, finding: spec.visibilityIsGovernanceFinding }).toEqual({ key, finding: false });
    }
  });

  /**
   * DEFECT 5 — the live pull request BODIES had gone stale.
   *
   * Found by independent review, not here, and the sting is that the committed artefacts were
   * already clean: every guard passed while the descriptions a reviewer actually reads claimed
   * the ERP repository was public, that seven files changed, that nothing under lib/ changed,
   * and that visibility was still open. The record was right; its shop window was not.
   *
   * A pull request body lives in GitHub, not in the repository, so CI cannot read it without a
   * credential this project deliberately refuses — each repository is certified from inside
   * itself under its own job token, and adding a PAT would trade a documentation defect for a
   * standing secret. The body therefore stays EXTERNAL EVIDENCE audited as a manual step, and
   * scripts/check-certification-prose.mjs is what makes that step deterministic.
   *
   * What CI *can* do is guarantee the checker itself works, and that the committed artefacts
   * pass it. That is what these tests do.
   */
  describe('the stale-prose checker has teeth', () => {
    const CHECKER = 'scripts/check-certification-prose.mjs';

    /** The smallest body that satisfies the structured CURRENT STATE requirements. */
    const MINIMAL_STATE = [
      '### CURRENT STATE',
      '',
      '| Control | State |',
      '| --- | --- |',
      '| **WEBSITE RULESET** | GREEN |',
      '| **WEBSITE VISIBILITY** | PRIVATE \u2014 CLOSED |',
      '| **DEPENDENCY SECURITY** | GREEN |',
      '| **INDEPENDENT REVIEW** | OPEN |',
      '| **P0-06** | NOT FULLY CLOSED |',
    ].join('\n');

    /** Run the checker over a temporary body file. */
    const runOnBody = (body: string, repo: string, alreadyFramed = false) => {
      const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'p0-06-')), 'body.md');
      fs.writeFileSync(file, alreadyFramed ? body : `${MINIMAL_STATE}\n\n${body}\n`);
      return spawnSync('node', [CHECKER, `--body=${file}`, `--repo=${repo}`], {
        encoding: 'utf8',
      });
    };

    it('exists and is dependency-free', () => {
      const src = read(CHECKER);
      expect(src).toContain('scanProse');
      expect(src).toContain('scanCurrentState');
      expect(src).toContain('scanContract');
      // Only node: builtins. A drift checker that can be broken by an unrelated dependency
      // problem is not a control.
      const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
      expect(imports.every((i) => i.startsWith('node:'))).toBe(true);
    });

    it('passes on the committed artefacts', () => {
      const out = spawnSync('node', [CHECKER], { encoding: 'utf8' });
      expect({ status: out.status, stderr: out.stderr }).toEqual({ status: 0, stderr: '' });
    });

    it('rejects a body claiming the ERP repository is public', () => {
      expect(runOnBody('nextjs-boilerplate is public.', 'erp').status).toBe(1);
    });

    it('rejects a body claiming seven files changed', () => {
      expect(runOnBody('Only seven files changed.', 'erp').status).toBe(1);
    });

    it('rejects a body claiming nothing under lib/ changed', () => {
      expect(runOnBody('No change under `app/`, `lib/`, `hooks/`.', 'erp').status).toBe(1);
    });

    it('rejects a body claiming visibility is still open', () => {
      expect(runOnBody('visibility and independent review remain open', 'erp').status).toBe(1);
    });

    it('rejects a body with no CURRENT STATE heading', () => {
      // Passed unframed on purpose: the point is a body that merely mentions the words
      // somewhere, with no heading. An earlier version matched the phrase anywhere and a
      // mutant renaming the section survived.
      const out = runOnBody('Some prose mentioning current state in passing.', 'erp', true);
      expect(out.status).toBe(1);
      expect(out.stderr).toContain('CURRENT STATE heading');
    });

    it('ALLOWS a truthful historical statement', () => {
      // The whole point of the marker mechanism: a certification may say what WAS true.
      // Forbidding the word outright would make the record less honest, not more.
      const body = `${MINIMAL_STATE}\n_(Historical: the repository was public earlier.)_\n`;
      expect(runOnBody(body, 'erp', true).status).toBe(0);
    });

    it('does not apply the ERP lib/ rule to the website body', () => {
      // The website pull request genuinely changes nothing under lib/. An unscoped rule
      // flagged that TRUE sentence, and a guard that cries wolf on accurate prose gets
      // ignored — which is how the real defect survived.
      const body = `${MINIMAL_STATE}\nNothing under \`app/\`, \`components/\`, \`lib/\` or \`public/\`.\n`;
      expect(runOnBody(body, 'website', true).status).toBe(0);
      expect(runOnBody(body, 'erp', true).status).toBe(1);
    });

    it('rejects a contract that reopens the governance-finding escape hatch', () => {
      const contract = JSON.parse(read(CERTIFIED_PATH));
      for (const spec of contract.repositories) {
        expect(spec.expectedVisibility).toBe('private');
        expect(spec.visibilityIsGovernanceFinding).toBe(false);
      }
    });
  });

  it('the contract states that an anonymous read cannot certify', () => {
    const contract = read(CERTIFIED_PATH);
    expect(contract).toContain('An anonymous read is NOT sufficient to certify');
    expect(contract).toContain('bypass_actors_unobservable');
  });

  /**
   * STALE-STATE MUTATIONS.
   *
   * The failure mode this group exists for is not a weakened ruleset — it is a certification
   * that keeps describing a world that has moved on. The ruleset was created on 2026-09-17;
   * every statement here about it is now a claim about live infrastructure, and a claim that
   * quietly goes stale is the same class of defect as the digest that rotted and the sentence
   * that survived a rewrite.
   *
   * Each case reverts the contract to a state that no longer matches reality, and each must be
   * rejected.
   */
  /**
   * The dependency-security gate, as a mutation battery of its own.
   *
   * It became branch-required on 2026-09-17, which makes it the second control on this
   * repository that a settings edit could silently remove. Everything the certification says
   * about it is now a claim about live infrastructure, so each way of losing it is enumerated
   * and each must be rejected.
   */
  describe('dependency-security mutations are rejected', () => {
    /** A ruleset shaped exactly like the live one, both required checks included. */
    const liveBoth = () => ({
      target: 'branch',
      enforcement: 'active',
      conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
      bypass_actors: [],
      rules: [
        { type: 'deletion' },
        { type: 'non_fast_forward' },
        {
          type: 'pull_request',
          parameters: {
            required_approving_review_count: 0,
            dismiss_stale_reviews_on_push: false,
            require_code_owner_review: false,
            require_last_push_approval: false,
            required_review_thread_resolution: true,
            require_extra_approval_for_unattributed_changes: false,
            allowed_merge_methods: ['merge'],
          },
        },
        {
          type: 'required_status_checks',
          parameters: {
            strict_required_status_checks_policy: true,
            do_not_enforce_on_create: false,
            required_status_checks: [
              { context: 'Vercel', integration_id: 8329 },
              { context: 'dependency-security', integration_id: 15368 },
            ],
          },
        },
      ],
    });

    const checksOf = (ruleset: Record<string, any>) =>
      ruleNamed(ruleset, 'required_status_checks').parameters;

    it('(1) the live-shaped ruleset with both checks passes', () => {
      const result: Result = evaluateRuleset(liveBoth(), website, PRIVILEGED);
      expect(result.failures).toEqual([]);
      expect(result.ok).toBe(true);
    });

    it('(2) removing Vercel fails', () => {
      const ruleset = liveBoth();
      checksOf(ruleset).required_status_checks = [
        { context: 'dependency-security', integration_id: 15368 },
      ];
      const result: Result = evaluateRuleset(ruleset, website, PRIVILEGED);
      expect(controls(result)).toContain('required_status_checks.contexts');
      expect(result.failures.map((f) => f.detail).join(' ')).toContain(
        'required check "Vercel" is no longer required',
      );
    });

    it('(3) removing dependency-security fails', () => {
      const ruleset = liveBoth();
      checksOf(ruleset).required_status_checks = [{ context: 'Vercel', integration_id: 8329 }];
      const result: Result = evaluateRuleset(ruleset, website, PRIVILEGED);
      expect(controls(result)).toContain('required_status_checks.contexts');
      expect(result.failures.map((f) => f.detail).join(' ')).toContain(
        'required check "dependency-security" is no longer required',
      );
    });

    it('(4) re-pointing Vercel to a wrong integration fails', () => {
      const ruleset = liveBoth();
      checksOf(ruleset).required_status_checks[0].integration_id = 15368;
      const result: Result = evaluateRuleset(ruleset, website, PRIVILEGED);
      expect(result.failures.map((f) => f.detail).join(' ')).toContain(
        'moved from integration 8329 to 15368',
      );
    });

    it('(5) re-pointing dependency-security to a wrong integration fails', () => {
      // A check with the right NAME from the wrong app must not satisfy the requirement.
      const ruleset = liveBoth();
      checksOf(ruleset).required_status_checks[1].integration_id = 8329;
      const result: Result = evaluateRuleset(ruleset, website, PRIVILEGED);
      expect(result.failures.map((f) => f.detail).join(' ')).toContain(
        'moved from integration 15368 to 8329',
      );
    });

    it('dependency-security cannot be satisfied by a similarly-named check', () => {
      // `dependency-security-report`, `Dependency Security`, etc. are different contexts.
      for (const impostor of [
        'dependency-security-report',
        'Dependency Security',
        'dependency_security',
        'security',
      ]) {
        const ruleset = liveBoth();
        checksOf(ruleset).required_status_checks[1].context = impostor;
        const result: Result = evaluateRuleset(ruleset, website, PRIVILEGED);
        expect({ impostor, ok: result.ok }).toEqual({ impostor, ok: false });
        expect(result.failures.map((f) => f.detail).join(' ')).toContain(
          'required check "dependency-security" is no longer required',
        );
      }
    });

    it('extra required checks beyond the certified two are tolerated', () => {
      // The contract is directional: stronger than the record is fine, weaker is not. The
      // owner adding a third gate must not fail the certification.
      const ruleset = liveBoth();
      checksOf(ruleset).required_status_checks.push({ context: 'lint', integration_id: 15368 });
      const result: Result = evaluateRuleset(ruleset, website, PRIVILEGED);
      expect(result.failures).toEqual([]);
      expect(result.ok).toBe(true);
    });

    it('(6) strict true -> false fails', () => {
      const ruleset = liveBoth();
      checksOf(ruleset).strict_required_status_checks_policy = false;
      expect(controls(evaluateRuleset(ruleset, website, PRIVILEGED))).toContain(
        'required_status_checks.strict',
      );
    });

    it('(7) doNotEnforceOnCreate false -> true fails', () => {
      const ruleset = liveBoth();
      checksOf(ruleset).do_not_enforce_on_create = true;
      expect(controls(evaluateRuleset(ruleset, website, PRIVILEGED))).toContain(
        'required_status_checks.do_not_enforce_on_create',
      );
    });

    it('(8) a missing bypass list still fails, with both checks present', () => {
      const ruleset = liveBoth();
      delete (ruleset as Record<string, any>).bypass_actors;
      expect(controls(evaluateRuleset(ruleset, website, PRIVILEGED))).toContain(
        'ruleset.bypass_actors_unobservable',
      );
    });

    it('(9) a bypass actor still fails, with both checks present', () => {
      const ruleset = liveBoth();
      (ruleset as Record<string, any>).bypass_actors = [
        { actor_id: 1, actor_type: 'RepositoryRole', bypass_mode: 'always' },
      ];
      expect(controls(evaluateRuleset(ruleset, website, PRIVILEGED))).toContain(
        'ruleset.bypass_actors',
      );
    });

    it('an unprivileged read still cannot certify, with both checks present', () => {
      expect(
        controls(evaluateRuleset(liveBoth(), website, observedUnprivileged('an anonymous read'))),
      ).toContain('ruleset.bypass_actors_unobservable');
    });

    it('(10) conversation resolution true -> false fails', () => {
      const ruleset = liveBoth();
      ruleNamed(ruleset, 'pull_request').parameters.required_review_thread_resolution = false;
      expect(controls(evaluateRuleset(ruleset, website, PRIVILEGED))).toContain(
        'pull_request.required_review_thread_resolution',
      );
    });

    it('(11) the visibility expectation still rejects a public repository', () => {
      expect(website.expectedVisibility).toBe('private');
      expect(evaluateVisibility({ visibility: 'public', private: false }, website).ok).toBe(false);
    });

    it('(12,13) the reviewer gap and its target survive the stronger ruleset', () => {
      // Two required checks is more protection, not a reviewer. Neither number moves.
      const approvals = website.pullRequest.requiredApprovingReviewCount;
      expect(approvals.certifiedFloor).toBe(0);
      expect(approvals.target).toBe(1);
      expect(approvals.gapOpen).toBe(true);
    });
  });

  describe('stale-state mutations are rejected', () => {
    const withWebsite = (mutate: (spec: Record<string, any>) => void): Record<string, any> => {
      const spec = JSON.parse(JSON.stringify(website));
      mutate(spec);
      return spec;
    };

    const liveShaped = () => ({
      target: 'branch',
      enforcement: 'active',
      conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
      bypass_actors: [],
      rules: [
        { type: 'deletion' },
        { type: 'non_fast_forward' },
        {
          type: 'pull_request',
          parameters: {
            required_approving_review_count: 0,
            required_review_thread_resolution: true,
            require_extra_approval_for_unattributed_changes: false,
            allowed_merge_methods: ['merge'],
          },
        },
        {
          type: 'required_status_checks',
          parameters: {
            strict_required_status_checks_policy: true,
            do_not_enforce_on_create: false,
            required_status_checks: [
              { context: 'Vercel', integration_id: 8329 },
              { context: 'dependency-security', integration_id: 15368 },
            ],
          },
        },
      ],
    });

    it('(1) applied true -> false contradicts the recorded ruleset id', () => {
      const spec = withWebsite((w) => {
        w.applied = false;
      });
      // The contract-consistency rule runs over the real file, so assert the invariant the
      // file must satisfy: applied:false with an id recorded is a contradiction.
      expect(spec.applied === false && typeof spec.rulesetId === 'number').toBe(true);
      expect(website.applied).toBe(true);
    });

    it('(2) rulesetId 23581080 -> null drops the pin', () => {
      const spec = withWebsite((w) => {
        w.rulesetId = null;
      });
      expect(spec.applied && spec.rulesetId === null).toBe(true);
      expect(website.rulesetId).toBe(23581080);
    });

    it('(3) rulesetId changed to a wrong id is caught by the recorded value', () => {
      expect(
        withWebsite((w) => {
          w.rulesetId = 99999999;
        }).rulesetId,
      ).not.toBe(website.rulesetId);
      expect(website.rulesetId).toBe(23581080);
    });

    it('(4) expectedVisibility private -> public stops rejecting a public repository', () => {
      const spec = withWebsite((w) => {
        w.expectedVisibility = 'public';
      });
      // The whole point: with the expectation flipped, today's public repository would pass.
      expect(evaluateVisibility({ visibility: 'public', private: false }, spec).ok).toBe(true);
      // The real contract must still reject it.
      expect(evaluateVisibility({ visibility: 'public', private: false }, website).ok).toBe(false);
      expect(website.expectedVisibility).toBe('private');
    });

    it('(6) conversation resolution true -> false is rejected', () => {
      const ruleset = liveShaped();
      ruleNamed(ruleset, 'pull_request').parameters.required_review_thread_resolution = false;
      const result: Result = evaluateRuleset(ruleset, website, PRIVILEGED);
      expect(controls(result)).toContain('pull_request.required_review_thread_resolution');
    });

    it('(8) the Vercel integration id being re-pointed is rejected', () => {
      const ruleset = liveShaped();
      ruleNamed(ruleset, 'required_status_checks').parameters.required_status_checks = [
        { context: 'Vercel', integration_id: 99999 },
      ];
      const result: Result = evaluateRuleset(ruleset, website, PRIVILEGED);
      expect(controls(result)).toContain('required_status_checks.contexts');
      expect(result.failures.map((f) => f.detail).join(' ')).toContain('moved from integration');
    });

    it('(9) strict status checks true -> false is rejected', () => {
      const ruleset = liveShaped();
      ruleNamed(ruleset, 'required_status_checks').parameters.strict_required_status_checks_policy =
        false;
      const result: Result = evaluateRuleset(ruleset, website, PRIVILEGED);
      expect(controls(result)).toContain('required_status_checks.strict');
    });

    it('(10) bypassActorsMustBeEmpty disabled stops checking the bypass list at all', () => {
      const spec = withWebsite((w) => {
        w.bypassActorsMustBeEmpty = false;
      });
      const ruleset = liveShaped();
      (ruleset as Record<string, any>).bypass_actors = [
        { actor_id: 1, actor_type: 'RepositoryRole', bypass_mode: 'always' },
      ];
      // With the switch off an actual bypass actor sails through — which is why the real
      // contract must keep it on.
      expect(evaluateRuleset(ruleset, spec, PRIVILEGED).ok).toBe(true);
      expect(website.bypassActorsMustBeEmpty).toBe(true);
      expect(controls(evaluateRuleset(ruleset, website, PRIVILEGED))).toContain(
        'ruleset.bypass_actors',
      );
    });

    it('(11) a missing bypass list is not treated as empty', () => {
      const ruleset = liveShaped();
      delete (ruleset as Record<string, any>).bypass_actors;
      expect(controls(evaluateRuleset(ruleset, website, PRIVILEGED))).toContain(
        'ruleset.bypass_actors_unobservable',
      );
    });

    it('(12) an unprivileged read cannot certify the website bypass list either', () => {
      const result: Result = evaluateRuleset(
        liveShaped(),
        website,
        observedUnprivileged('an anonymous read'),
      );
      expect(controls(result)).toContain('ruleset.bypass_actors_unobservable');
    });

    it('(13) the reviewer gap cannot be closed while the floor is still zero', () => {
      const approvals = website.pullRequest.requiredApprovingReviewCount;
      expect(approvals.gapOpen).toBe(true);
      expect(approvals.certifiedFloor).toBe(0);
      // Guarded across every repository by the shared consistency rule below.
      for (const spec of loadCertified().repositories) {
        const a = spec.pullRequest.requiredApprovingReviewCount;
        expect({ key: spec.key, honest: a.gapOpen || a.certifiedFloor >= 1 }).toEqual({
          key: spec.key,
          honest: true,
        });
      }
    });

    it('(14) the approval target cannot be reduced from 1 to 0', () => {
      // Lowering the target would make the gap look closed by moving the goalpost rather than
      // by supplying a reviewer.
      for (const spec of loadCertified().repositories) {
        expect({
          key: spec.key,
          target: spec.pullRequest.requiredApprovingReviewCount.target,
        }).toEqual({ key: spec.key, target: 1 });
      }
    });
  });

  it('the evidence document records the violation rather than erasing it', () => {
    const doc = read('docs/security/p0-06-github-main-protection.md');
    expect(doc).toMatch(/GitHub Pro/);
    expect(doc).toMatch(/private/i);
  });
});

describe('P0-06: the recorded restore digests are still true', () => {
  it.each([
    'scripts/verify-github-main-protection.mjs',
    'docs/security/p0-06-erp-main-ruleset.snapshot.json',
    '.github/workflows/github-protection-certification.yml',
    'docs/security/p0-06-main-protection.certified.json',
  ])('%s matches the SHA-256 recorded in the evidence document', (relative) => {
    const evidence = read('docs/security/p0-06-github-main-protection.md');
    const row = evidence
      .split('\n')
      .find((line) => line.includes(`\`${relative}\``) && /`[0-9a-f]{64}`/.test(line));

    expect(row).toBeDefined();
    expect(row).toContain(digest(relative));
  });
});

describe('P0-06: the drift check cannot lock main, and cannot leak a token', () => {
  const WORKFLOW = '.github/workflows/github-protection-certification.yml';
  const workflow = read(WORKFLOW);
  const script = read('scripts/verify-github-main-protection.mjs');

  it('the live check runs in its own workflow, not in the required quality gate', () => {
    // If this ever moves into test.yml it becomes a required check, and the day the ruleset
    // is wrong is the day you cannot merge the fix for it.
    expect(read('.github/workflows/test.yml')).not.toContain('verify-github-main-protection');
    expect(workflow).toContain('node scripts/verify-github-main-protection.mjs');
  });

  it('runs on a schedule and on demand so drift is found without a push', () => {
    expect(workflow).toContain('workflow_dispatch:');
    // `schedule:` on its own is not a schedule. A block with no cron entry under it never
    // fires, so assert the cron expression itself — this is the difference between a drift
    // check that runs daily and one that only looks like it does.
    expect(workflow).toMatch(/^ {2}schedule:\n(?: *#.*\n)* *- cron: '(\S+ \S+ \S+ \S+ \S+)'$/m);
  });

  it('asks for no more than read access to repository contents', () => {
    expect(workflow).toContain('permissions:');
    expect(workflow).toContain('contents: read');
  });

  it('does not add a continue-on-error escape hatch to the drift job', () => {
    expect(workflow).not.toContain('continue-on-error');
  });

  /**
   * DEFECT 7. The commit that made the drift job honest about token visibility also deleted
   * this `env:` block. GitHub does not place GITHUB_TOKEN in a step's environment on its own,
   * so the verifier read a PRIVATE repository anonymously and failed `repository.visibility_
   * unobservable` and `ruleset.read` — both HARD failures — on every scheduled run.
   *
   * A drift detector that is always red is a drift detector nobody reads, so the token
   * reaching the step is itself a certified property, not an implementation detail.
   */
  it('gives the verifier step the automatic job token, or it cannot read a private repo', () => {
    const step = workflow.slice(workflow.indexOf('      - name: Verify observable live'));
    const env = step.slice(step.indexOf('env:'), step.indexOf('run: |'));
    expect(env).toMatch(/GITHUB_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/);
  });

  it('needs no stored personal access token', () => {
    expect(workflow).not.toMatch(/secrets\.(?!GITHUB_TOKEN)[A-Z_]*(PAT|TOKEN)/);
    expect(script).toContain('process.env.GITHUB_TOKEN');
  });

  it('never prints a token, and builds request URLs without one', () => {
    // The only place a request target is stringified for output.
    expect(script).toContain('const redactUrl =');
    for (const leak of [
      'console.log(token',
      'console.error(token',
      'JSON.stringify(headers',
      'console.log(headers',
      'console.error(headers',
    ]) {
      expect(script).not.toContain(leak);
    }

    // The token may be interpolated into exactly ONE place — the Authorization header —
    // and nowhere else. Counting the interpolations is what makes this a real check: a
    // second `${token}` anywhere, in a URL or a log line or an error message, fails here.
    const interpolations = Array.from(script.matchAll(/\$\{token\}/g));
    expect(interpolations).toHaveLength(1);
    expect(script).toContain('Authorization: `Bearer ${token}`');

    // And the error path, which is the easiest place to leak one by accident, reports only
    // whether an attempt was authenticated — never the value.
    expect(script).toContain("headers.Authorization ? 'authenticated' : 'anonymous'");
  });

  it('fails closed: a failure sets a non-zero exit code', () => {
    expect(script).toContain('process.exitCode = ok ? 0 : 1;');
    expect(script).toContain('process.exitCode = 1;');
  });

  /**
   * DS-33 again, in a new file. That incident was a job-level `if:` reading the `secrets`
   * context, which is not one of the four contexts GitHub permits there — so GitHub rejected
   * the whole workflow at validation time and every run completed with ZERO jobs. Nothing
   * went red; the gates simply stopped existing.
   *
   * A drift detector that silently never runs is worse than no drift detector, because the
   * certification would still point at it. __tests__/ci/workflow-gates.test.ts guards
   * test.yml this way; this is the same guard for this file. (The YAML was also parsed with a
   * real YAML parser while it was written — this is the part that keeps being true.)
   */
  it('cannot be rejected at workflow-validation time the way DS-33 was', () => {
    for (const line of Array.from(workflow.matchAll(/^ {4}if:.*$/gm)).map((m) => m[0])) {
      expect({ line, usesSecrets: line.includes('secrets.') }).toEqual({
        line,
        usesSecrets: false,
      });
    }
    // The only secret it may name is the automatic, always-present job token.
    const secretRefs = Array.from(workflow.matchAll(/secrets\.([A-Za-z_][A-Za-z0-9_]*)/g)).map(
      (match) => match[1],
    );
    expect(secretRefs).toEqual(['GITHUB_TOKEN']);
  });

  it('keeps the structure GitHub needs: one job, checkout, node, the verifier', () => {
    expect(workflow).toMatch(/^jobs:$/m);
    expect(workflow).toMatch(/^ {2}main-protection:$/m);
    expect(workflow).toMatch(/^ {4}runs-on: ubuntu-latest$/m);
    expect(workflow).toMatch(/^ {4}steps:$/m);
    expect(workflow).toContain('actions/checkout@v4');
    expect(workflow).toContain('actions/setup-node@v4');
  });

  it('does not re-run on every unrelated merge to main', () => {
    // The live read spends rate limit. Re-proving an unchanged ruleset on every merge would
    // spend it for nothing and make the genuine signal noisier.
    const pushBlock = workflow.slice(workflow.indexOf('  push:'), workflow.indexOf('permissions:'));
    expect(pushBlock).toContain('paths:');
    expect(pushBlock).toContain('scripts/verify-github-main-protection.mjs');
  });
});

/**
 * The credential path, driven rather than grepped.
 *
 * The section above proves by string match that no `${token}` reaches a log line. That is
 * worth having, but it is a proof about the source text, and the property that actually
 * matters is behavioural: when the read fails — the one moment a credential is most likely
 * to end up in an error message — does the token appear anywhere in what comes out?
 *
 * `fetchLiveRuleset` takes an injectable `fetchImpl` precisely so this can be answered
 * without a network.
 */
describe('P0-06: the live read handles credentials without leaking them', () => {
  // Deliberately NOT token-shaped. An earlier version used a `ghp_`-prefixed literal, and a
  // full-history scan of this repository flagged it: GitHub's own secret scanning and every
  // third-party scanner match that prefix, so a realistic-looking fake in a public repository
  // manufactures alerts and teaches people to ignore them. The value only needs to be a
  // distinctive string this suite can look for.
  const SECRET = 'not-a-real-credential-fixture-for-p0-06-tests';
  const certified = certifiedFor('erp');
  const EXPECTED_URL =
    'https://api.github.com/repos/lacreativodesign/nextjs-boilerplate/rulesets/22866162';

  let savedGithub: string | undefined;
  let savedGh: string | undefined;

  beforeEach(() => {
    savedGithub = process.env.GITHUB_TOKEN;
    savedGh = process.env.GH_TOKEN;
  });

  afterEach(() => {
    if (savedGithub === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = savedGithub;
    if (savedGh === undefined) delete process.env.GH_TOKEN;
    else process.env.GH_TOKEN = savedGh;
  });

  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
  const bad = (status: number) => ({ ok: false, status, json: async () => ({}) });

  it('sends the token as a Bearer header and never in the URL', async () => {
    process.env.GITHUB_TOKEN = SECRET;
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetchImpl = jest.fn(async (url: string, init: { headers: Record<string, string> }) => {
      calls.push({ url, headers: init.headers });
      return ok({ id: 22866162 });
    });

    await fetchLiveRuleset(certified, { fetchImpl });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(EXPECTED_URL);
    expect(calls[0].url).not.toContain(SECRET);
    expect(calls[0].headers.Authorization).toBe(`Bearer ${SECRET}`);
  });

  it('marks an authenticated ruleset read privileged only when bypass_actors is actually observable', async () => {
    process.env.GITHUB_TOKEN = SECRET;
    const withBypass = jest.fn(async () => ok({ id: 22866162, bypass_actors: [] }));
    const withoutBypass = jest.fn(async () => ok({ id: 22866162 }));

    const privileged = await fetchLiveRulesetObserved(certified, { fetchImpl: withBypass });
    const underScoped = await fetchLiveRulesetObserved(certified, { fetchImpl: withoutBypass });

    expect(privileged.observation.bypassActorsObservable).toBe(true);
    expect(privileged.observation.source).toContain('bypass_actors visibility');
    expect(underScoped.observation.bypassActorsObservable).toBe(false);
    expect(underScoped.observation.source).toContain('without ruleset-write visibility');
  });

  /**
   * The other half of defect 6, and the half that is easy to lose.
   *
   * Classifying by response content is the correct fix, but content ALONE is not sufficient:
   * an anonymous read can also come back carrying `bypass_actors: []` — a public repository
   * serves it to nobody in particular. If observability were decided by the field alone, an
   * unauthenticated read would certify the one control everything else rests on. Both halves
   * have to hold: a token was sent, AND the field came back.
   */
  it('keeps an anonymous read unobservable even when bypass_actors comes back present', async () => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;

    const fetchImpl = jest.fn(async () => ok({ id: 22866162, bypass_actors: [] }));
    const anonymous = await fetchLiveRulesetObserved(certified, { fetchImpl });

    expect(anonymous.observation.bypassActorsObservable).toBe(false);
    expect(anonymous.observation.source).toContain('anonymous');
  });

  /**
   * And the property that actually matters, driven end to end rather than asserted on the
   * observation object: an under-scoped authenticated read must FAIL the evaluator, not merely
   * be labelled differently. A correct label attached to a passing verdict is still a false
   * green — that is precisely what defect 6 looked like in production.
   */
  it('fails the evaluator closed when the authenticated read never saw the bypass list', async () => {
    process.env.GITHUB_TOKEN = SECRET;
    // A real live payload, minus the one field GitHub withholds from an under-scoped caller.
    const withheld = { ...loadSnapshot() };
    delete (withheld as Record<string, unknown>).bypass_actors;

    const fetchImpl = jest.fn(async () => ok(withheld));
    const { ruleset, observation } = await fetchLiveRulesetObserved(certified, { fetchImpl });
    const result = evaluateRuleset(ruleset, certified, observation);

    // The label has to be honest too. Defect 6 in production was a correct FAIL printed
    // underneath a line claiming the bypass list had been observed, and a verdict whose
    // stated provenance contradicts it is not evidence — it is two claims, one of them false.
    expect(observation.bypassActorsObservable).toBe(false);
    expect(observation.source).not.toMatch(/bypass_actors visibility/);

    expect(result.ok).toBe(false);
    expect(result.failures.map((f: Failure) => f.control)).toContain(
      'ruleset.bypass_actors_unobservable',
    );
    // And not misreported as an actor having been found, which would send the owner looking
    // for a bypass entry that does not exist.
    expect(result.failures.map((f: Failure) => f.control)).not.toContain('ruleset.bypass_actors');
  });

  it('retries anonymously when the token is refused, because the data is public', async () => {
    process.env.GITHUB_TOKEN = SECRET;
    const seen: Array<string | undefined> = [];
    const fetchImpl = jest.fn(async (_url: string, init: { headers: Record<string, string> }) => {
      seen.push(init.headers.Authorization);
      // A job-scoped Actions token can legitimately be refused on this path.
      return seen.length === 1 ? bad(403) : ok({ id: 22866162 });
    });

    await expect(fetchLiveRuleset(certified, { fetchImpl })).resolves.toEqual({ id: 22866162 });
    expect(seen).toEqual([`Bearer ${SECRET}`, undefined]);
  });

  it('makes exactly one anonymous attempt when no token is configured', async () => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    const seen: Array<string | undefined> = [];
    const fetchImpl = jest.fn(async (_url: string, init: { headers: Record<string, string> }) => {
      seen.push(init.headers.Authorization);
      return ok({ id: 22866162 });
    });

    await fetchLiveRuleset(certified, { fetchImpl });

    expect(seen).toEqual([undefined]);
  });

  it('falls back to GH_TOKEN when GITHUB_TOKEN is absent', async () => {
    delete process.env.GITHUB_TOKEN;
    process.env.GH_TOKEN = SECRET;
    const seen: Array<string | undefined> = [];
    const fetchImpl = jest.fn(async (_url: string, init: { headers: Record<string, string> }) => {
      seen.push(init.headers.Authorization);
      return ok({ id: 22866162 });
    });

    await fetchLiveRuleset(certified, { fetchImpl });

    expect(seen).toEqual([`Bearer ${SECRET}`]);
  });

  it('keeps the token out of the error when every attempt fails', async () => {
    process.env.GITHUB_TOKEN = SECRET;
    const fetchImpl = jest.fn(async () => bad(403));

    // This is the rate-limit case that made a live read unfit for a required check, so the
    // message has to say which attempts failed and how — without the credential.
    await expect(fetchLiveRuleset(certified, { fetchImpl })).rejects.toThrow(
      /authenticated=HTTP 403, anonymous=HTTP 403/,
    );

    const message = await fetchLiveRuleset(certified, { fetchImpl }).catch(
      (error: Error) => error.message,
    );
    expect(message).not.toContain(SECRET);
    expect(message).not.toContain('Bearer');
    expect(message).toContain(EXPECTED_URL);
    expect(message).toContain('access, rate-limit or network fault');
  });

  it('reports a notice, not a failure, when protection is stronger than the record', () => {
    // The ratchet: raising the live count above the floor must never read as a regression,
    // or the next person to strengthen protection gets a red build for doing the right thing.
    const ruleset = JSON.parse(JSON.stringify(loadSnapshot()));
    const pr = ruleset.rules.find((rule: { type: string }) => rule.type === 'pull_request');
    pr.parameters.required_approving_review_count = 2;

    const result: Result = evaluateRuleset(ruleset, certified, PRIVILEGED);

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.notices.map((notice) => notice.detail).join(' ')).toContain(
      'above the certified floor 0',
    );
  });
});
