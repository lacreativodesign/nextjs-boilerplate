#!/usr/bin/env node
/**
 * P0-06 — main-branch protection drift verifier.
 *
 * WHAT THIS EXISTS TO CATCH
 *
 * The protection on `main` is not in this repository. It is a GitHub repository ruleset
 * ("Production Main Protection", id 22866162) that lives in GitHub's database, and any
 * account with admin on the repository can weaken it in about four seconds from a settings
 * page, with no commit, no review and no trace in git history. Nothing in a normal CI run
 * would notice. A P0-06 certification that only asserted "the setting looked correct on the
 * day we checked" would therefore be worth nothing a week later.
 *
 * So this script re-reads the LIVE ruleset and fails closed when it no longer guarantees
 * what docs/security/p0-06-main-protection.certified.json records.
 *
 * WHY IT NEEDS NO TOKEN
 *
 * lacreativodesign/nextjs-boilerplate is public, and GitHub serves
 * `GET /repos/{owner}/{repo}/rulesets/{id}` — including every rule parameter and the bypass
 * actor list — to anonymous callers on public repositories. That was verified against the
 * live API before this script was written. It matters because the alternative was a stored
 * personal access token with `administration: read`, which is precisely the long-lived,
 * over-scoped credential this repository has been removing everywhere else.
 *
 * A token is used only if one happens to be in the environment, and then only to buy the
 * higher authenticated rate limit. If an authenticated read fails for any reason the script
 * retries anonymously, because the data is public either way.
 *
 * The token is never printed, never interpolated into a URL, never included in an error
 * message, and never echoed back on failure. `redactUrl` below is the only place a request
 * target is stringified for output, and it carries no credential to begin with.
 *
 * WHY THIS IS NOT PART OF THE `quality` JOB
 *
 * `quality` is a REQUIRED status check on `main`. Putting a live GitHub API read inside a
 * required check would create a circular lockout: the day the ruleset is wrong - which is
 * exactly the day you need to merge a fix - the required check fails, so the fix cannot be
 * merged. An API blip or a rate limit would have the same effect for no reason at all.
 *
 * The split is therefore deliberate:
 *
 *   - the OFFLINE half runs inside `quality`, via
 *     __tests__/ci/github-main-protection-certification.test.ts. It is pure, deterministic
 *     and network-free: it checks the recorded snapshot against the certified contract and
 *     proves, by mutation, that the evaluator actually rejects weakened configurations.
 *   - the LIVE half runs in .github/workflows/github-protection-certification.yml, on a
 *     schedule and on demand, and is deliberately NOT a required check. It detects drift
 *     without ever being able to block the repair.
 *
 * Usage:
 *   node scripts/verify-github-main-protection.mjs            # live read, fails closed
 *   node scripts/verify-github-main-protection.mjs --snapshot # offline, uses the snapshot
 *   node scripts/verify-github-main-protection.mjs --json     # machine-readable result
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');

export const CERTIFIED_PATH = 'docs/security/p0-06-main-protection.certified.json';
export const SNAPSHOT_PATH = 'docs/security/p0-06-erp-main-ruleset.snapshot.json';

/** Strip the `$comment` keys the contract uses for prose so comparisons stay on data. */
const stripComments = (value) => {
  if (Array.isArray(value)) return value.map(stripComments);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== '$comment')
        .map(([key, inner]) => [key, stripComments(inner)]),
    );
  }
  return value;
};

export const readJson = (relative, root = REPO_ROOT) =>
  stripComments(JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')));

export const loadCertified = (root = REPO_ROOT) => readJson(CERTIFIED_PATH, root);
export const loadSnapshot = (root = REPO_ROOT) => readJson(SNAPSHOT_PATH, root);

const ruleOfType = (ruleset, type) =>
  (Array.isArray(ruleset?.rules) ? ruleset.rules : []).find((rule) => rule?.type === type);

/**
 * The whole judgement, as a pure function, so the mutation tests can drive it without a
 * network and without a process exit.
 *
 * Returns `{ ok, failures, notices }`. `failures` is non-empty exactly when the live
 * ruleset no longer guarantees a certified invariant — that is the fail-closed condition.
 * `notices` carries findings that are informational rather than a regression, so that a
 * configuration which is STRONGER than the record is reported without being treated as a
 * fault.
 */
export function evaluateRuleset(ruleset, certified) {
  const failures = [];
  const notices = [];
  const fail = (control, detail) => failures.push({ control, detail });

  if (!ruleset || typeof ruleset !== 'object') {
    fail('ruleset.present', 'no ruleset was returned at all');
    return { ok: false, failures, notices };
  }

  // --- the ruleset itself is switched on and aimed at the right branch ----------------
  if (ruleset.enforcement !== certified.enforcement) {
    fail(
      'ruleset.enforcement',
      `expected "${certified.enforcement}", found "${ruleset.enforcement}"`,
    );
  }
  if (ruleset.target !== certified.target) {
    fail('ruleset.target', `expected "${certified.target}", found "${ruleset.target}"`);
  }

  const include = ruleset?.conditions?.ref_name?.include ?? [];
  for (const ref of certified.refNameInclude) {
    if (!include.includes(ref)) {
      fail(
        'ruleset.conditions',
        `"${ref}" is no longer a targeted ref (found ${JSON.stringify(include)})`,
      );
    }
  }

  // An exclusion on the default branch would silently un-target it while leaving the
  // include list looking correct.
  const exclude = ruleset?.conditions?.ref_name?.exclude ?? [];
  if (exclude.length > 0) {
    fail(
      'ruleset.conditions',
      `ref_name.exclude must stay empty, found ${JSON.stringify(exclude)}`,
    );
  }

  // --- nobody may step around it ------------------------------------------------------
  if (certified.bypassActorsMustBeEmpty) {
    const actors = ruleset.bypass_actors ?? [];
    if (actors.length > 0) {
      fail(
        'ruleset.bypass_actors',
        `expected none, found ${actors.length}: ${JSON.stringify(actors)}`,
      );
    }
  }

  // --- every certified rule type is still present -------------------------------------
  for (const type of certified.requiredRuleTypes) {
    if (!ruleOfType(ruleset, type)) {
      fail('ruleset.rules', `the "${type}" rule is missing`);
    }
  }

  // --- pull request policy ------------------------------------------------------------
  const pr = ruleOfType(ruleset, 'pull_request')?.parameters;
  if (pr) {
    const wanted = certified.pullRequest;

    if (pr.required_review_thread_resolution !== wanted.requiredReviewThreadResolution) {
      fail(
        'pull_request.required_review_thread_resolution',
        `expected ${wanted.requiredReviewThreadResolution}, found ${pr.required_review_thread_resolution}`,
      );
    }

    // Certified as an exact set: adding squash or rebase changes what reaching `main`
    // means, so it is drift even though it is not obviously a weakening.
    const methods = [...(pr.allowed_merge_methods ?? [])].sort();
    const wantedMethods = [...wanted.allowedMergeMethods].sort();
    if (JSON.stringify(methods) !== JSON.stringify(wantedMethods)) {
      fail(
        'pull_request.allowed_merge_methods',
        `expected ${JSON.stringify(wantedMethods)}, found ${JSON.stringify(methods)}`,
      );
    }

    const { certifiedFloor, target } = wanted.requiredApprovingReviewCount;
    const actual = pr.required_approving_review_count;
    if (typeof actual !== 'number' || actual < certifiedFloor) {
      fail(
        'pull_request.required_approving_review_count',
        `must be at least the certified floor ${certifiedFloor}, found ${actual}`,
      );
    } else if (actual > certifiedFloor) {
      // Strengthened live without the record catching up. Not a regression, but the
      // ratchet has to be turned or the new strength is not protected by this check.
      notices.push({
        control: 'pull_request.required_approving_review_count',
        detail:
          `live value ${actual} is above the certified floor ${certifiedFloor}. ` +
          `Raise certifiedFloor in ${CERTIFIED_PATH} so the stronger setting is what gets enforced.`,
      });
    }
    if (actual < target) {
      notices.push({
        control: 'pull_request.required_approving_review_count',
        detail:
          `OPEN P0-06 GAP: live value ${actual} is below the P0-06 target ${target}. ` +
          `Independent human review is NOT yet enforceable. See ${CERTIFIED_PATH} for the ` +
          `two-step owner action that closes this.`,
      });
    }
  }

  // --- required status checks ---------------------------------------------------------
  const checks = ruleOfType(ruleset, 'required_status_checks')?.parameters;
  if (checks) {
    const wanted = certified.requiredStatusChecks;

    if (checks.strict_required_status_checks_policy !== wanted.strictRequiredStatusChecksPolicy) {
      fail(
        'required_status_checks.strict',
        `expected ${wanted.strictRequiredStatusChecksPolicy}, found ${checks.strict_required_status_checks_policy}`,
      );
    }
    if (checks.do_not_enforce_on_create !== wanted.doNotEnforceOnCreate) {
      fail(
        'required_status_checks.do_not_enforce_on_create',
        `expected ${wanted.doNotEnforceOnCreate}, found ${checks.do_not_enforce_on_create}`,
      );
    }

    const live = new Map(
      (checks.required_status_checks ?? []).map((check) => [check.context, check.integration_id]),
    );
    for (const { context, integrationId } of wanted.contexts) {
      if (!live.has(context)) {
        fail(
          'required_status_checks.contexts',
          `required check "${context}" is no longer required`,
        );
        continue;
      }
      // A context can be re-pointed at a different app while keeping its name, which
      // would satisfy a name-only check with a report this repository never produces.
      if (live.get(context) !== integrationId) {
        fail(
          'required_status_checks.contexts',
          `required check "${context}" moved from integration ${integrationId} to ${live.get(context)}`,
        );
      }
    }
  }

  return { ok: failures.length === 0, failures, notices };
}

// ---------------------------------------------------------------------------------------
// live read
// ---------------------------------------------------------------------------------------

/** Request targets are built only from the certified record; no credential is ever in one. */
const redactUrl = (repository, rulesetId) =>
  `https://api.github.com/repos/${repository}/rulesets/${rulesetId}`;

export async function fetchLiveRuleset(certified, { fetchImpl = globalThis.fetch } = {}) {
  const url = redactUrl(certified.repository, certified.rulesetId);
  const baseHeaders = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'bizosto-p0-06-protection-verifier',
  };

  // A token, if present, buys rate limit and nothing else: the resource is public. It is
  // read straight into the header object and never stored, logged or returned.
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? '';
  const attempts = token
    ? [{ ...baseHeaders, Authorization: `Bearer ${token}` }, baseHeaders]
    : [baseHeaders];

  const statuses = [];
  for (const headers of attempts) {
    const response = await fetchImpl(url, { headers });
    if (response.ok) return response.json();
    statuses.push(
      `${headers.Authorization ? 'authenticated' : 'anonymous'}=HTTP ${response.status}`,
    );
    // Fall through to the anonymous attempt: a scoped Actions token can legitimately be
    // refused on this path even though the same data is public.
  }

  // Anonymous GitHub API calls are limited to 60/hour PER IP, and CI runners share egress
  // addresses, so an anonymous 403 usually means "someone else on this IP spent the
  // budget" rather than anything about this repository. Saying so keeps the next person
  // from going looking for a permissions problem that is not there — and is the reason
  // this check is not allowed to gate merges.
  throw new Error(
    `could not read the live ruleset from ${url} (${statuses.join(', ')}). ` +
      `The resource is public, so this is an API, rate-limit or network fault, not a ` +
      `credential fault. Re-run with GITHUB_TOKEN set for the higher authenticated limit.`,
  );
}

// ---------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------

const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (invokedDirectly) {
  const argv = new Set(process.argv.slice(2));
  const asJson = argv.has('--json');
  const offline = argv.has('--snapshot');

  const certified = loadCertified();

  const run = async () => {
    const ruleset = offline ? loadSnapshot() : await fetchLiveRuleset(certified);
    const result = evaluateRuleset(ruleset, certified);

    if (asJson) {
      process.stdout.write(
        `${JSON.stringify({ source: offline ? 'snapshot' : 'live', ...result }, null, 2)}\n`,
      );
    } else {
      const source = offline ? `snapshot (${SNAPSHOT_PATH})` : `live GitHub API`;
      console.log(`P0-06 main protection — ${certified.repository} — read from ${source}`);
      console.log(`  ruleset ${certified.rulesetId} "${certified.rulesetName}"`);
      for (const notice of result.notices) {
        console.log(`  NOTICE  ${notice.control}: ${notice.detail}`);
      }
      if (result.ok) {
        console.log('  OK      every certified invariant still holds.');
      } else {
        for (const failure of result.failures) {
          console.error(`  FAIL    ${failure.control}: ${failure.detail}`);
        }
        console.error(
          `\n${result.failures.length} certified P0-06 invariant(s) no longer hold on the live ruleset.`,
        );
      }
    }

    process.exitCode = result.ok ? 0 : 1;
  };

  run().catch((error) => {
    // `error` here can only carry the URL and an HTTP status; see fetchLiveRuleset.
    console.error(`P0-06 verifier could not complete: ${error.message}`);
    process.exitCode = 1;
  });
}
