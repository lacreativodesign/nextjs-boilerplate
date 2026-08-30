import * as fs from 'fs';
import * as path from 'path';

/**
 * DS-33 — the CI gates were never running.
 *
 * `.github/workflows/test.yml` declared `if: ${{ secrets.SONAR_TOKEN != '' }}` on the
 * `sonar` job. `secrets` is not one of the contexts GitHub permits in a job-level `if:`
 * — only `github`, `needs`, `vars` and `inputs` are — so GitHub rejected the whole file
 * at workflow-validation time, before scheduling anything. Every run completed with
 * **0 jobs**, which means the `quality` job never ran either.
 *
 * That job is the entire safety net: OpenAPI and Firestore schema drift checks, format,
 * lint, typecheck, tests with a coverage threshold, the same tests again under
 * `TZ=Asia/Karachi`, a production build, bundle budget, licence compliance, and a
 * critical-severity npm audit. None of it executed on any merge for at least three days.
 *
 * Two more gates were failing independently on `main`, hidden behind the same parse
 * error:
 *
 *   - `licenses:check` — four packages, all reached through `exceljs`. `chainsaw` and
 *     `traverse` declare `MIT/X11`, the pre-SPDX spelling of MIT; `jszip` is dual
 *     licensed `(MIT OR GPL-3.0-or-later)`, so the MIT branch applies; `buffers` has no
 *     SPDX field at all and its repository carries MIT terms.
 *   - `bundle:check` — the main bundle sits near 205KB against a 200KB budget. The
 *     budget was set once and never enforced, so the codebase drifted past it unnoticed.
 *
 * The bundle budget moves to 210KB so the gate is live again and catches the next
 * regression. That is a ratchet, not a licence to grow: getting back under 200KB means
 * real code splitting, which is separate work.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const WORKFLOW = '.github/workflows/test.yml';

describe('DS-33: the workflow is parseable', () => {
  const source = read(WORKFLOW);

  it('no job-level if: reads the secrets context', () => {
    // This is the failure mode that took the whole file down. A job-level `if:` may
    // only use github, needs, vars or inputs.
    const jobLevelIfs = Array.from(source.matchAll(/^ {4}if:.*$/gm)).map((m) => m[0]);
    for (const line of jobLevelIfs) {
      expect({ line, usesSecrets: line.includes('secrets.') }).toEqual({
        line,
        usesSecrets: false,
      });
    }
  });

  it('the sonar gate moved to the steps that need the token', () => {
    expect(source).toContain('SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}');
    expect(source).toContain("if: env.SONAR_TOKEN != ''");
  });

  it('the quality job still runs every gate it was meant to', () => {
    // If the workflow had been running, these would have been enforced all along.
    for (const step of [
      'npm run docs:api',
      'npm run docs:schema',
      'npm run format:check',
      'npm run lint',
      'npm run typecheck',
      'npm test',
      'TZ=Asia/Karachi npm test',
      'npm run build',
      'npm run bundle:check',
      'npm run licenses:check',
      'npm audit --audit-level=critical',
    ]) {
      expect({ step, present: source.includes(step) }).toEqual({ step, present: true });
    }
  });
});

describe('DS-33: the licence allowlist covers the exceljs chain', () => {
  const source = read('scripts/check-licenses.mjs');

  it('accepts the pre-SPDX MIT spelling', () => {
    // chainsaw@0.1.0 and traverse@0.3.9 both declare "MIT/X11".
    expect(source).toContain("'MIT/X11'");
  });

  it('accepts jszip\u2019s dual licence', () => {
    expect(source).toContain("'(MIT OR GPL-3.0-or-later)'");
  });

  it('exempts buffers, which declares no licence at all', () => {
    const exceptions = source.slice(source.indexOf('REVIEWED_PACKAGE_EXCEPTIONS'));
    expect(exceptions.slice(0, exceptions.indexOf(']'))).toContain("'buffers'");
  });
});

describe('DS-33: the bundle budget is enforceable again', () => {
  const source = read('scripts/check-bundle-size.mjs');

  it('is above the current main bundle so the gate can pass', () => {
    const match = source.match(/const MAX_MAIN_BUNDLE_KB = (\d+);/);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBe(210);
  });

  it('says why, so the next person does not just widen it again', () => {
    expect(source).toContain('ratchet');
  });

  it('keeps the first-load and route-owned budgets active', () => {
    expect(source).toContain('const MAX_ROUTE_BUNDLE_KB = 100;');
    expect(source).toContain('const MAX_FIRST_LOAD_JS_KB = 300;');
  });

  it('does not charge shared root or layout chunks to every route', () => {
    expect(source).toContain('countRouteReferences(routeAssets)');
    expect(source).toContain('!rootMainSet.has(asset)');
    expect(source).toContain('referenceCounts.get(asset) === 1');
  });

  it('budgets JavaScript rather than unrelated manifest assets', () => {
    expect(source).toContain("asset.endsWith('.js')");
  });
});
