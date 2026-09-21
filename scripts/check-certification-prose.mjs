#!/usr/bin/env node
/**
 * P0-06 — the stale-prose checker.
 *
 * WHY THIS EXISTS
 *
 * The recurring defect in this certification is not a weakened control. It is a sentence that
 * outlives the world it described. Five have been found so far, and the fifth was found by an
 * independent reviewer in the LIVE PULL REQUEST BODIES — a surface no test could reach, because
 * the committed artefacts were already clean.
 *
 * WHY THE PR BODY IS NOT CHECKED AUTOMATICALLY IN CI
 *
 * A pull request body lives in GitHub, not in the repository. Reading it from a workflow means
 * an API call, and reading ANOTHER repository's pull request means a credential this project
 * deliberately does not have: each repository is certified by a workflow running inside it under
 * its own automatic job token, precisely so that no repository holds a credential for the other.
 * Adding a personal access token to close this gap would trade a documentation defect for a
 * standing secret. That trade is refused.
 *
 * So the PR body remains EXTERNAL EVIDENCE, audited as a MANUAL certification step — and this
 * script is what makes that step deterministic rather than a careful read. Pipe the body into a
 * file and run:
 *
 *   node scripts/check-certification-prose.mjs --body=/tmp/pr.md --repo=erp     --expect-head=<sha>
 *   node scripts/check-certification-prose.mjs --body=/tmp/pr.md --repo=website --expect-head=<sha>
 *
 * `--repo` matters: a few rules are true of one repository only. The website pull request
 * genuinely changes nothing under lib/, so applying the ERP's rule there would flag an
 * accurate sentence, and a guard that cries wolf on accurate prose gets ignored.
 *
 * HOW IT AVOIDS BEING BRITTLE
 *
 * A certification SHOULD be able to say "the repository was public earlier". Forbidding the word
 * outright would make the record less honest, not more. Two mechanisms keep this usable:
 *
 *   1. A forbidden phrase is only a violation when it appears on a line with NO historical
 *      marker. Lines carrying one are legitimate history and are skipped.
 *   2. Current state is asserted against a STRUCTURED table, not against prose. A body must
 *      carry a `CURRENT STATE` section whose rows say what the contract says.
 *
 * It exits non-zero on any violation, prints every one, and never mutates anything.
 */

import { readFileSync, existsSync } from 'node:fs';

/** Lines that carry one of these are history, not a claim about now. */
const HISTORICAL_MARKERS = [
  'historical',
  'was public',
  'were public',
  'earlier revision',
  'no longer true',
  'since resolved',
  'superseded',
  'at the time',
  'previously',
  'used to',
  'defect',
];

/**
 * Claims that are false about the CURRENT state. Each is a regex plus the reason it is wrong,
 * so a failure explains itself instead of just naming a pattern.
 */
const FORBIDDEN = [
  [
    /\b(nextjs-boilerplate|this repository|the ERP repo(sitory)?) is\s+\**public/i,
    'the ERP repository is PRIVATE',
  ],
  [/\bbizosto-website is\s+(currently\s+)?\**public/i, 'the website repository is PRIVATE'],
  [/\bboth repositories are public\b/i, 'both repositories are PRIVATE'],
  [/visibility\s*[-–—:]\s*open\b/i, 'the visibility control is CLOSED'],
  [/visibility (is|remains) (still )?open\b/i, 'the visibility control is CLOSED'],
  [
    /visibility and independent review remain open/i,
    'only independent review remains open; visibility is CLOSED',
  ],
  [/\bmust end up private\b/i, 'both repositories are already private'],
  [/\bcannot upgrade right now\b/i, 'the plan constraint no longer applies'],
  // SCOPED to the ERP repository. The website pull request changes four P0-06 files and
  // genuinely touches nothing under lib/, so an unscoped rule flagged a TRUE statement there.
  // A guard that cries wolf on accurate prose teaches people to ignore it.
  [/\bseven files\b/i, 'the ERP pull request changes NINE files', 'erp'],
  [
    /\b(no change under|nothing under)[^.]*\blib\/(?![^.]*did)/i,
    'lib/support/storage.ts is part of the ERP change',
    'erp',
  ],
  [/(only|sole) required check\b/i, 'the website has TWO required checks'],
  [
    /dependency-security[^.]{0,40}(future work|not branch-required|advisory only)/i,
    'dependency-security is live and branch-required',
  ],
];

/**
 * Structured invariants in the machine-readable contract.
 *
 * These deliberately replace a prose rule that was tried and removed. Matching the words
 * "governance finding" flagged two legitimate texts: a finding correctly described as closed,
 * and the verifier's own conditional NOTICE string. The field is the control; the prose is
 * commentary. Assert the field.
 */
const CONTRACT_PATH = 'docs/security/p0-06-main-protection.certified.json';

/** @returns {string[]} one message per broken invariant */
export function scanContract(json, label) {
  const problems = [];
  for (const spec of json.repositories ?? []) {
    const at = `${label}[${spec.key}]`;
    if (spec.expectedVisibility !== 'private') {
      problems.push(
        `${at}  expectedVisibility is "${spec.expectedVisibility}", must be "private" — both repositories are private and the ratchet only tightens`,
      );
    }
    if (spec.visibilityIsGovernanceFinding !== false) {
      problems.push(
        `${at}  visibilityIsGovernanceFinding is ${spec.visibilityIsGovernanceFinding}, must be false — that flag downgrades a visibility mismatch to a notice, so a regression to public would pass with a shrug`,
      );
    }
    const approvals = spec.pullRequest?.requiredApprovingReviewCount ?? {};
    if (approvals.gapOpen === false && approvals.certifiedFloor === 0) {
      problems.push(
        `${at}  gapOpen is false while certifiedFloor is 0 — the reviewer gap cannot be closed on paper`,
      );
    }
  }
  return problems;
}

/** Rows a pull request body's CURRENT STATE table must assert. */
const REQUIRED_STATE = [
  [/WEBSITE RULESET[^|]*\|[^|]*GREEN/i, 'website ruleset GREEN'],
  [/WEBSITE VISIBILITY[^|]*\|[^|]*PRIVATE\s*—\s*CLOSED/i, 'website visibility PRIVATE — CLOSED'],
  [/DEPENDENCY SECURITY[^|]*\|[^|]*GREEN/i, 'dependency security GREEN'],
  [/INDEPENDENT REVIEW[^|]*\|[^|]*OPEN/i, 'independent review OPEN'],
  [/P0-06[^|]*\|[^|]*NOT FULLY CLOSED/i, 'P0-06 NOT FULLY CLOSED'],
];

const isHistorical = (line) => {
  const l = line.toLowerCase();
  return HISTORICAL_MARKERS.some((m) => l.includes(m));
};

/** @returns {string[]} one message per violation */
export function scanProse(text, label, repo = 'erp') {
  const problems = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (isHistorical(line)) return; // legitimate history
    for (const [pattern, reason, scope] of FORBIDDEN) {
      if (scope && scope !== repo) continue; // rule does not apply to this repository
      if (pattern.test(line)) {
        problems.push(
          `${label}:${i + 1}  claims something false — ${reason}\n      ${line.trim().slice(0, 120)}`,
        );
      }
    }
  });
  return problems;
}

/** @returns {string[]} one message per missing/incorrect required row */
export function scanCurrentState(text, label) {
  const problems = [];
  // A HEADING, not the phrase anywhere in the text. Matching the phrase let a mutant that
  // renamed the section survive, because the words occurred elsewhere in the body.
  if (!/^#{1,6}\s+CURRENT STATE\b/im.test(text)) {
    problems.push(
      `${label}  has no CURRENT STATE heading — a reader cannot tell satisfied controls from open ones`,
    );
    return problems;
  }
  for (const [pattern, what] of REQUIRED_STATE) {
    if (!pattern.test(text)) problems.push(`${label}  CURRENT STATE does not assert: ${what}`);
  }
  return problems;
}

/**
 * Base-branch SHAs, which are legitimately named as current facts rather than as history:
 * they are what each pull request is based on, not a superseded head of it.
 */
/**
 * Wording that excuses a non-current SHA, narrower than HISTORICAL_MARKERS on purpose — it has
 * to point at the SHA, not merely discuss history.
 */
const SHA_HISTORY =
  /superseded|earlier head|previous head|\(historical|_\(historical|history:|formerly/i;

const KNOWN_PERMANENT_SHAS = new Set([
  '70a5403990fdeabe70bb2cd5e1700e60eb683b71', // ERP main
  '632f5daf6e5981dd610b59199c7230f38b8cd2c0', // website main (the PR #61 merge)
]);

const COMMITTED = [
  'docs/security/p0-06-github-main-protection.md',
  'docs/security/p0-06-main-protection.certified.json',
  'scripts/verify-github-main-protection.mjs',
  '.github/workflows/github-protection-certification.yml',
];

function main(argv) {
  const bodyArg = argv.find((a) => a.startsWith('--body='));
  const headArg = argv.find((a) => a.startsWith('--expect-head='));
  const repoArg = argv.find((a) => a.startsWith('--repo='));
  const repo = repoArg ? repoArg.slice('--repo='.length) : 'erp';
  if (!['erp', 'website'].includes(repo)) {
    console.error(`--repo must be "erp" or "website", got "${repo}"`);
    process.exit(2);
  }
  const problems = [];

  // This file and the Jest suite are the scanners; they necessarily contain every phrase as
  // their own pattern, so they are never scanned. Including them made an earlier version of
  // this guard fail against itself.
  for (const f of COMMITTED) {
    if (!existsSync(f)) {
      problems.push(`${f}  is missing — a certification artefact cannot simply disappear`);
      continue;
    }
    problems.push(...scanProse(readFileSync(f, 'utf8'), f, 'erp'));
  }

  if (existsSync(CONTRACT_PATH)) {
    try {
      problems.push(
        ...scanContract(JSON.parse(readFileSync(CONTRACT_PATH, 'utf8')), CONTRACT_PATH),
      );
    } catch (err) {
      problems.push(`${CONTRACT_PATH}  is not valid JSON: ${err.message}`);
    }
  }

  if (bodyArg) {
    const path = bodyArg.slice('--body='.length);
    if (!existsSync(path)) {
      console.error(`--body=${path} does not exist`);
      process.exit(2);
    }
    const body = readFileSync(path, 'utf8');
    problems.push(...scanProse(body, path, repo));
    problems.push(...scanCurrentState(body, path));
    if (headArg) {
      const sha = headArg.slice('--expect-head='.length);
      // The head must appear in the REFERENCE TABLE, not merely somewhere in the prose. A body
      // that mentions the right SHA in passing while its summary names an older one is exactly
      // the failure this whole exercise is about.
      const row = new RegExp(`\\|[^|\\n]*head[^|\\n]*\\|[^|\\n]*${sha}`, 'i');
      if (!row.test(body)) {
        problems.push(
          `${path}  has no reference row naming the current head ${sha} — a body whose summary names an older head is stale by definition`,
        );
      }
      // Any OTHER 40-hex SHA presented without a historical marker is a stale current claim.
      //
      // This deliberately uses a NARROWER marker set than the prose scan. The general list
      // exempted a line merely because it contained the word "historical" — which a sentence
      // ABOUT historical marking naturally does, and a mutant smuggled a superseded SHA in
      // exactly that way. A SHA must be excused by wording that points at the SHA itself.
      body.split('\n').forEach((line, i) => {
        if (SHA_HISTORY.test(line)) return;
        for (const m of line.matchAll(/\b[0-9a-f]{40}\b/g)) {
          if (m[0] !== sha && !KNOWN_PERMANENT_SHAS.has(m[0])) {
            problems.push(
              `${path}:${i + 1}  names SHA ${m[0]} with no historical marker, but the current head is ${sha}`,
            );
          }
        }
      });
    }
  }

  if (problems.length) {
    console.error('P0-06 stale-prose check FAILED\n');
    for (const p of problems) console.error('  ' + p);
    console.error(
      '\nFix the prose to match live reality. Never relax the contract to match the prose.',
    );
    process.exit(1);
  }
  console.log(
    bodyArg
      ? 'OK  committed artefacts and the supplied pull request body agree with the contract.'
      : 'OK  committed artefacts carry no stale current-state claim.',
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
