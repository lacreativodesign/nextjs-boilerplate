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
 * WHY THIS NEEDS AN AUTHENTICATED, PRIVILEGED READ
 *
 * Most of the ruleset is public data on a public repository and an anonymous caller can read
 * it. `bypass_actors` is the exception, and it is the field that matters most: one bypass
 * actor makes every other rule advisory.
 *
 * `GET /repos/{owner}/{repo}/rulesets/{id}` documents bypass_actors as returned only to
 * callers with sufficient access to the ruleset. So an anonymous or under-scoped read can
 * come back WITHOUT the field, and an absent field is not an empty one. The first version of
 * this script wrote `ruleset.bypass_actors ?? []` and fell back to an anonymous read whenever
 * an authenticated one failed — which meant "I was not allowed to see the bypass list" was
 * reported as "there is no bypass list". Independent review rejected that, correctly.
 *
 * The rule now is: an empty bypass list certifies nothing unless the read that produced it
 * came from an identity GitHub actually serves that list to. `evaluateRuleset` takes an
 * `Observation` saying so, it defaults to NOT observable, and an unprivileged read fails the
 * control with `ruleset.bypass_actors_unobservable` rather than passing it.
 *
 * An anonymous read is still performed when there is no credential, because the other
 * invariants are worth checking — but it is labelled unprivileged and cannot turn the bypass
 * control green. Degraded information is reported as degraded.
 *
 * CREDENTIALS
 *
 * The workflow uses only the automatic, job-scoped GITHUB_TOKEN. No personal access token is
 * created, stored or required: a long-lived `administration: read` PAT would be a worse
 * posture than the drift it detects. Where the job token is not sufficient to observe the
 * bypass list — which is the case for any repository this workflow does not run inside — the
 * control is NOT silently passed. It is reported unobservable and carried as an explicit
 * owner attestation in the contract instead. See the evidence document.
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
 *   node scripts/verify-github-main-protection.mjs              # every certified repository
 *   node scripts/verify-github-main-protection.mjs --repo=erp   # just this one
 *   node scripts/verify-github-main-protection.mjs --snapshot   # offline, uses the snapshot
 *   node scripts/verify-github-main-protection.mjs --json       # machine-readable result
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

/** The certified spec for one repository, by its `key` ("erp", "website"). */
export const certifiedFor = (key, root = REPO_ROOT) => {
  const spec = loadCertified(root).repositories.find((entry) => entry.key === key);
  if (!spec) throw new Error(`no certified repository with key "${key}" in ${CERTIFIED_PATH}`);
  return spec;
};

const ruleOfType = (ruleset, type) =>
  (Array.isArray(ruleset?.rules) ? ruleset.rules : []).find((rule) => rule?.type === type);

/**
 * How the ruleset in hand was obtained, and therefore what it is allowed to certify.
 *
 * `bypassActorsObservable` is the only load-bearing field: it asserts the read came from an
 * identity GitHub actually serves the bypass list to. It defaults to FALSE so that a caller
 * that forgets to say cannot accidentally certify the control — the default is the safe
 * answer, not the convenient one.
 *
 * @typedef {{ source: string, bypassActorsObservable: boolean }} Observation
 */
/** @type {Observation} */
export const DEFAULT_OBSERVATION = Object.freeze({
  source: 'an unspecified read',
  bypassActorsObservable: false,
});

/**
 * An authenticated read by an identity with access to the ruleset.
 * @param {string} source
 * @returns {Observation}
 */
export const observedPrivileged = (source) => ({ source, bypassActorsObservable: true });

/**
 * Anything else: anonymous, under-scoped, or unknown. Cannot certify bypass actors.
 * @param {string} source
 * @returns {Observation}
 */
export const observedUnprivileged = (source) => ({ source, bypassActorsObservable: false });

/** Says precisely HOW the field was unobservable, so the diagnostic is not guesswork. */
const describeUnobservable = (present, actors) => {
  if (!present) return 'the property was absent from the API response';
  if (actors === undefined) return 'the property was undefined';
  if (actors === null) return 'the property was null';
  return `the property was ${typeof actors}, not an array`;
};

/**
 * Repository visibility, as a certified control in its own right.
 *
 * P0-06 forbids trading source confidentiality for a branch-protection setting. On
 * 2026-09-17 bizosto-website was made public to get past a plan restriction, which is exactly
 * that trade, and independent review rejected it. Publication is therefore not a remedy and
 * not a neutral fact — for a repository certified `private`, it is DRIFT, and this reports it
 * as a failure rather than as the blocker being "resolved".
 *
 * It fails closed the same way the bypass check does: a visibility that cannot be read is not
 * assumed to be the expected one.
 *
 * @param {{ visibility?: string, private?: boolean } | null} repo
 * @param {{ repository: string, expectedVisibility: string, visibilityIsGovernanceFinding?: boolean }} certified
 * @returns {{ ok: boolean, failures: Array<{control: string, detail: string}>, notices: Array<{control: string, detail: string}> }}
 */
export function evaluateVisibility(repo, certified) {
  const failures = [];
  const notices = [];
  const expected = certified.expectedVisibility;

  if (!repo || typeof repo !== 'object' || typeof repo.visibility !== 'string') {
    failures.push({
      control: 'repository.visibility_unobservable',
      detail:
        `could not read the visibility of ${certified.repository}. An unreadable repository ` +
        `is not assumed to be correctly configured.`,
    });
    return { ok: false, failures, notices };
  }

  if (repo.visibility !== expected) {
    if (expected === 'private' && repo.visibility === 'public') {
      failures.push({
        control: 'repository.visibility',
        detail:
          `${certified.repository} is PUBLIC but is certified private. Publishing proprietary ` +
          `source is not an acceptable substitute for branch protection — the correct owner ` +
          `action is a GitHub Pro (or higher) plan, which serves rulesets on private ` +
          `repositories. Restore this repository to private.`,
      });
    } else {
      failures.push({
        control: 'repository.visibility',
        detail: `expected "${expected}", found "${repo.visibility}"`,
      });
    }
  } else if (certified.visibilityIsGovernanceFinding) {
    // Recorded, not endorsed: "public" here describes what IS, not what was approved.
    notices.push({
      control: 'repository.visibility',
      detail:
        `${certified.repository} is ${repo.visibility}. This predates P0-06 and is recorded ` +
        `as a repository-visibility governance finding for owner review, not as an approval. ` +
        `Do not read "certified" here as "someone decided this should be public".`,
    });
  }

  return { ok: failures.length === 0, failures, notices };
}

/**
 * The whole judgement, as a pure function, so the mutation tests can drive it without a
 * network and without a process exit.
 *
 * @param {Record<string, any> | null} ruleset
 * @param {Record<string, any>} certified
 * @param {Observation} [observation]
 *
 * Returns `{ ok, failures, notices }`. `failures` is non-empty exactly when the live
 * ruleset no longer guarantees a certified invariant — that is the fail-closed condition.
 * `notices` carries findings that are informational rather than a regression, so that a
 * configuration which is STRONGER than the record is reported without being treated as a
 * fault.
 */
export function evaluateRuleset(ruleset, certified, observation = DEFAULT_OBSERVATION) {
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
  //
  // This is the control the whole ruleset rests on: a single bypass actor makes every other
  // rule advisory. It is also the one field GitHub may decline to return.
  //
  // `GET /repos/{owner}/{repo}/rulesets/{id}` documents bypass_actors as included only for
  // callers with sufficient access to the ruleset. An under-privileged or anonymous read can
  // therefore come back with the field ABSENT — and absent is not empty. The first version of
  // this verifier wrote `ruleset.bypass_actors ?? []`, which silently turned "I was not
  // allowed to see the bypass list" into "there is no bypass list", i.e. into a PASS. That is
  // a false green on the most important invariant in the file, and independent review was
  // right to reject it.
  //
  // So: only an explicitly observable empty array satisfies this. Absent, undefined, null,
  // and any non-array all fail as UNOBSERVABLE, with their own diagnostic so the failure
  // cannot be misread as "a bypass actor was found". And an unprivileged read cannot satisfy
  // it at all, however empty the array looks — see `observation` below.
  if (certified.bypassActorsMustBeEmpty) {
    const present = Object.prototype.hasOwnProperty.call(ruleset, 'bypass_actors');
    const actors = ruleset.bypass_actors;

    if (!present || actors === undefined || actors === null || !Array.isArray(actors)) {
      fail(
        'ruleset.bypass_actors_unobservable',
        `bypass_actors was not observable (${describeUnobservable(present, actors)}). GitHub ` +
          `returns this field only to callers with sufficient access to the ruleset, so an ` +
          `absent value means "not allowed to look", never "there are none". This cannot be ` +
          `certified without a privileged authenticated read.`,
      );
    } else if (!observation.bypassActorsObservable) {
      fail(
        'ruleset.bypass_actors_unobservable',
        `bypass_actors came back as an empty array, but from ${observation.source}, which is ` +
          `not an identity GitHub guarantees the bypass list to. An empty array from such a ` +
          `read is indistinguishable from a withheld one, so it cannot certify absence of ` +
          `bypass actors.`,
      );
    } else if (actors.length > 0) {
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

/**
 * The seam is typed as the narrow shape this function actually uses, not as `fetch`.
 *
 * Three fields is the whole contract, and saying so is what lets the certification suite
 * drive the credential path with a plain double instead of a fabricated `Response` — a test
 * that had to impersonate all fourteen `Response` members would be asserting things about
 * the DOM rather than about how this function treats a token.
 *
 * @typedef {{ ok: boolean; status: number; json: () => Promise<any> }} RulesetResponse
 * @typedef {(url: string, init: { headers: Record<string, string> }) => Promise<RulesetResponse>} RulesetFetch
 */

/**
 * @param {{ repository: string, rulesetId: number | null }} spec
 * @param {{ fetchImpl?: RulesetFetch }} [options]
 * @returns {Promise<Record<string, any>>}
 */
export async function fetchLiveRuleset(
  spec,
  { fetchImpl = /** @type {RulesetFetch} */ (globalThis.fetch) } = {},
) {
  return fetchJson(redactUrl(spec.repository, spec.rulesetId), fetchImpl);
}

/**
 * As `fetchLiveRuleset`, but returns the `Observation` as well, which is what the CLI needs
 * in order to decide whether the bypass list it just read is allowed to certify anything.
 *
 * @param {{ repository: string, rulesetId: number | null }} spec
 * @param {{ fetchImpl?: RulesetFetch }} [options]
 * @returns {Promise<{ ruleset: Record<string, any>, observation: Observation }>}
 */
export async function fetchLiveRulesetObserved(
  spec,
  { fetchImpl = /** @type {RulesetFetch} */ (globalThis.fetch) } = {},
) {
  const { body, observation } = await fetchWithObservation(
    redactUrl(spec.repository, spec.rulesetId),
    fetchImpl,
  );
  return { ruleset: body, observation };
}

/**
 * One authenticated-then-anonymous GET. The token, if any, reaches an Authorization header
 * and nowhere else; see the note at the top of this file.
 *
 * @param {string} url
 * @param {RulesetFetch} fetchImpl
 * @returns {Promise<any>}
 */
async function fetchJson(url, fetchImpl) {
  return (await fetchWithObservation(url, fetchImpl)).body;
}

/**
 * The same request, but it also reports HOW the answer was obtained.
 *
 * This is what stops an anonymous fallback from laundering itself into a certification: the
 * caller gets an `Observation` it must pass to `evaluateRuleset`, and only the authenticated
 * branch produces one where `bypassActorsObservable` is true.
 *
 * @param {string} url
 * @param {RulesetFetch} fetchImpl
 * @returns {Promise<{ body: any, observation: Observation }>}
 */
async function fetchWithObservation(url, fetchImpl) {
  const baseHeaders = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'bizosto-p0-06-protection-verifier',
  };

  // The token is read straight into the header object and never stored, logged or returned.
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? '';
  const attempts = token
    ? [
        { headers: { ...baseHeaders, Authorization: `Bearer ${token}` }, privileged: true },
        { headers: baseHeaders, privileged: false },
      ]
    : [{ headers: baseHeaders, privileged: false }];

  const statuses = [];
  for (const { headers, privileged } of attempts) {
    const response = await fetchImpl(url, { headers });
    if (response.ok) {
      return {
        body: await response.json(),
        observation: privileged
          ? observedPrivileged('an authenticated read')
          : observedUnprivileged('an anonymous read'),
      };
    }
    statuses.push(
      `${headers.Authorization ? 'authenticated' : 'anonymous'}=HTTP ${response.status}`,
    );
    // An anonymous retry still happens, because the other invariants are worth checking —
    // but it comes back labelled unprivileged, so it cannot certify the bypass list.
  }

  // Anonymous GitHub API calls are limited to 60/hour PER IP, and CI runners share egress
  // addresses, so an anonymous 403 usually means "someone else on this IP spent the
  // budget" rather than anything about this repository. Saying so keeps the next person
  // from going looking for a permissions problem that is not there — and is the reason
  // this check is not allowed to gate merges.
  throw new Error(
    `could not read the ruleset from ${url} (${statuses.join(', ')}). ` +
      `This is an access, rate-limit or network fault. A private repository returns 404 to ` +
      `an identity without access, and anonymous GitHub reads are capped at 60/hour per IP ` +
      `on a shared runner address — which is why this check never gates a merge.`,
  );
}

/**
 * Find the certified ruleset on a repository that has none recorded yet.
 *
 * A repository with `applied: false` is an open gap, but it is one the owner closes outside
 * this repository, and the moment they do the check should start evaluating the real thing
 * rather than continuing to report it missing. So rather than hard-failing on a null
 * rulesetId, look for a branch ruleset with the certified name and evaluate that.
 *
 * @param {{ repository: string, rulesetName: string }} spec
 * @param {{ fetchImpl?: RulesetFetch }} [options]
 * @returns {Promise<Record<string, any> | null>}
 */
export async function discoverLiveRuleset(
  spec,
  { fetchImpl = /** @type {RulesetFetch} */ (globalThis.fetch) } = {},
) {
  const listed = await fetchJson(
    `https://api.github.com/repos/${spec.repository}/rulesets`,
    fetchImpl,
  );
  const match = (Array.isArray(listed) ? listed : []).find(
    (entry) => entry?.name === spec.rulesetName && entry?.target === 'branch',
  );
  if (!match) return null;
  return fetchLiveRuleset({ repository: spec.repository, rulesetId: match.id }, { fetchImpl });
}

/**
 * Repository metadata, for the visibility control.
 *
 * @param {{ repository: string }} spec
 * @param {{ fetchImpl?: RulesetFetch }} [options]
 * @returns {Promise<Record<string, any> | null>}
 */
export async function fetchRepository(
  spec,
  { fetchImpl = /** @type {RulesetFetch} */ (globalThis.fetch) } = {},
) {
  return fetchJson(`https://api.github.com/repos/${spec.repository}`, fetchImpl);
}

// ---------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------

const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const flags = new Set(argv);
  const asJson = flags.has('--json');
  const offline = flags.has('--snapshot');

  // `--repo=<key>` scopes the run to one certified repository.
  //
  // This is what makes the private website verifiable at all. A job token issued to the ERP
  // repository cannot read a PRIVATE bizosto-website — GitHub answers 404 — and a
  // cross-repository read that fails must never be reported as a certification. So each
  // repository verifies ITSELF, from a workflow running inside it, under its own job token:
  // the ERP workflow runs `--repo=erp`, and the companion workflow in bizosto-website runs
  // `--repo=website`. Neither needs a credential for the other, and neither can silently
  // vouch for the other.
  const only = (argv.find((arg) => arg.startsWith('--repo=')) || '').split('=')[1] || null;

  const run = async () => {
    const results = [];
    const selected = loadCertified().repositories.filter((spec) => !only || spec.key === only);

    if (only && selected.length === 0) {
      console.error(`P0-06 verifier: no certified repository with key "${only}".`);
      process.exitCode = 1;
      return;
    }

    for (const spec of selected) {
      // Offline mode can only speak for repositories that have a committed snapshot.
      if (offline && !spec.snapshot) {
        results.push({
          repository: spec.repository,
          source: 'none',
          ok: true,
          skipped: 'no snapshot recorded; run without --snapshot to check it live',
          failures: [],
          notices: [],
        });
        continue;
      }

      let ruleset = null;
      let observation = DEFAULT_OBSERVATION;
      const source = offline ? 'snapshot' : 'live';
      const preFailures = [];
      const preNotices = [];

      // Visibility is only checkable live: it is a property of the repository rather than of
      // the ruleset, so a snapshot has nothing to check it against.
      if (!offline) {
        try {
          const repo = await fetchRepository(spec);
          const visibility = evaluateVisibility(repo, spec);
          preFailures.push(...visibility.failures);
          preNotices.push(...visibility.notices);
        } catch (error) {
          // A private repository returns 404 to an identity without access. That is a failure
          // to OBSERVE, and it must never be reported as a repository that checked out fine.
          preFailures.push({
            control: 'repository.visibility_unobservable',
            detail:
              `could not read ${spec.repository}: ${error.message} ` +
              `A cross-repository read this identity cannot perform is not a certification.`,
          });
        }
      }

      try {
        if (offline) {
          ruleset = readJson(spec.snapshot);
          // The snapshot is a RECORDED observation, not a live one. It is treated as
          // privileged only because the contract states which identity captured it, and the
          // certification suite asserts that statement is present. It certifies the record;
          // the live workflow certifies the current state.
          observation = spec.snapshotCapturedBy
            ? observedPrivileged(`the recorded snapshot (captured by ${spec.snapshotCapturedBy})`)
            : observedUnprivileged('a snapshot with no recorded capture identity');
        } else if (spec.rulesetId) {
          ({ ruleset, observation } = await fetchLiveRulesetObserved(spec));
        } else {
          // Not recorded yet — look for it anyway, so the day the owner applies it this
          // starts evaluating the real ruleset instead of reporting it missing forever.
          ruleset = await discoverLiveRuleset(spec);
          observation = observedUnprivileged('a discovery read');
          if (ruleset) {
            ({ ruleset, observation } = await fetchLiveRulesetObserved({
              repository: spec.repository,
              rulesetId: ruleset.id,
            }));
          }
        }
      } catch (error) {
        results.push({
          repository: spec.repository,
          source,
          ok: false,
          failures: [...preFailures, { control: 'ruleset.read', detail: error.message }],
          notices: preNotices,
        });
        continue;
      }

      if (!ruleset && !spec.applied) {
        results.push({
          repository: spec.repository,
          source,
          ok: false,
          failures: [
            ...preFailures,
            {
              control: 'ruleset.applied',
              detail:
                `no branch ruleset named "${spec.rulesetName}" exists on this repository, or ` +
                `this identity cannot see it. The certified protection is NOT confirmed — see ` +
                `the OWNER ACTION in docs/security/p0-06-github-main-protection.md.`,
            },
          ],
          notices: preNotices,
        });
        continue;
      }

      const result = evaluateRuleset(ruleset, spec, observation);
      if (ruleset && !spec.applied) {
        result.notices.push({
          control: 'ruleset.applied',
          detail:
            `the certified ruleset now EXISTS on this repository. Record its id and set ` +
            `applied:true in ${CERTIFIED_PATH} so it is pinned rather than discovered by name.`,
        });
      }
      result.failures.unshift(...preFailures);
      result.notices.unshift(...preNotices);
      result.ok = result.failures.length === 0;
      results.push({ repository: spec.repository, source, observation, ...result });
    }

    const ok = results.every((result) => result.ok);

    if (asJson) {
      process.stdout.write(`${JSON.stringify({ ok, results }, null, 2)}\n`);
    } else {
      for (const result of results) {
        console.log(`P0-06 main protection — ${result.repository} — read from ${result.source}`);
        if (result.skipped) {
          console.log(`  SKIP    ${result.skipped}`);
          continue;
        }
        if (result.observation) {
          console.log(
            `  VIA     ${result.observation.source} ` +
              `(bypass list ${result.observation.bypassActorsObservable ? 'observable' : 'NOT observable'})`,
          );
        }
        for (const notice of result.notices) {
          console.log(`  NOTICE  ${notice.control}: ${notice.detail}`);
        }
        if (result.ok) {
          console.log('  OK      every certified invariant still holds.');
        } else {
          for (const failure of result.failures) {
            console.error(`  FAIL    ${failure.control}: ${failure.detail}`);
          }
        }
      }
      if (!ok) {
        const broken = results.filter((result) => !result.ok).length;
        console.error(
          `\n${broken} of ${results.length} certified repositories no longer guarantee P0-06.`,
        );
      }
    }

    process.exitCode = ok ? 0 : 1;
  };

  run().catch((error) => {
    // `error` here can only carry a URL and an HTTP status; see fetchWithObservation.
    console.error(`P0-06 verifier could not complete: ${error.message}`);
    process.exitCode = 1;
  });
}
