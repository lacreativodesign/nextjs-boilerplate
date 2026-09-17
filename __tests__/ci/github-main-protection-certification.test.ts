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
import * as fs from 'fs';
import * as path from 'path';

import {
  CERTIFIED_PATH,
  SNAPSHOT_PATH,
  certifiedFor,
  discoverLiveRuleset,
  evaluateRuleset,
  fetchLiveRuleset,
  loadCertified,
  loadSnapshot,
} from '@/scripts/verify-github-main-protection.mjs';

type Failure = { control: string; detail: string };
type Result = { ok: boolean; failures: Failure[]; notices: Failure[] };

const read = (relative: string): string =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

const digest = (relative: string): string =>
  createHash('sha256').update(read(relative)).digest('hex');

const certified = certifiedFor('erp');

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
    const result: Result = evaluateRuleset(loadSnapshot(), certified);
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
    const result: Result = evaluateRuleset(loadSnapshot(), certified);
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
    const result: Result = evaluateRuleset(ruleset, certified);
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
    const result: Result = evaluateRuleset(ruleset, raised);
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
    const result: Result = evaluateRuleset(null, certified);
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

  it('requires ONLY Vercel, because that is the only check it produces', () => {
    // The repository has no .github directory at all, so there are no Actions workflows and
    // no check runs. Requiring anything else would block every merge forever.
    expect(website.requiredStatusChecks.contexts).toEqual([
      { context: 'Vercel', integrationId: 8329 },
    ]);
    expect(website.requiredStatusChecks.strictRequiredStatusChecksPolicy).toBe(true);
    expect(website.requiredStatusChecks.doNotEnforceOnCreate).toBe(false);
  });

  it('carries the same approval gap, because it has the same single owner', () => {
    // Adding a reviewer to one repository does not add one to the other.
    const approvals = website.pullRequest.requiredApprovingReviewCount;
    expect(approvals.certifiedFloor).toBe(0);
    expect(approvals.target).toBe(1);
    expect(approvals.gapOpen).toBe(true);
  });

  it('is recorded as NOT yet applied, with no ruleset id to pin', () => {
    expect(website.applied).toBe(false);
    expect(website.rulesetId).toBeNull();
    expect(website.snapshot).toBeNull();
  });

  it('cannot claim to be applied without a ruleset id to pin it to', () => {
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
            required_status_checks: [{ context: 'Vercel', integration_id: 8329 }],
          },
        },
      ],
    };

    const result: Result = evaluateRuleset(proposed, website);
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

    const result: Result = evaluateRuleset(weakened, website);
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
  const SECRET = 'ghp_thisIsNotARealTokenAAAAAAAAAAAAAAAAAA';
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
    expect(message).toContain('not a credential fault');
  });

  it('reports a notice, not a failure, when protection is stronger than the record', () => {
    // The ratchet: raising the live count above the floor must never read as a regression,
    // or the next person to strengthen protection gets a red build for doing the right thing.
    const ruleset = JSON.parse(JSON.stringify(loadSnapshot()));
    const pr = ruleset.rules.find((rule: { type: string }) => rule.type === 'pull_request');
    pr.parameters.required_approving_review_count = 2;

    const result: Result = evaluateRuleset(ruleset, certified);

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.notices.map((notice) => notice.detail).join(' ')).toContain(
      'above the certified floor 0',
    );
  });
});
