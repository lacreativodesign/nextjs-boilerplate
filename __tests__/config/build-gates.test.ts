import fs from 'fs';
import path from 'path';

/**
 * BUILD-01 — the build skips lint and typecheck, so CI must not.
 *
 * `next build` re-runs ESLint and a full TypeScript program after webpack finishes. Both
 * already run as their own steps in the Quality Gates workflow, on the same commit, before
 * that workflow runs `npm run build` itself. Doing the work twice bought nothing and cost
 * a second type-check of ~1,700 files plus a generated validator per API route — on
 * Vercel's 2-core / 8 GB builder that phase ran past the 45-minute ceiling and the
 * deployment was killed with no error output at all.
 *
 * Turning the in-build checks off is only safe while CI keeps doing them. This file is the
 * thing that makes that true: if someone deletes the lint or typecheck step from the
 * workflow, or points it at a different command, the suite goes red rather than quietly
 * leaving every deploy unchecked.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const WORKFLOW = '.github/workflows/test.yml';
const NEXT_CONFIG = 'next.config.js';

/** Strips comments so prose describing a setting is never mistaken for the setting. */
const activeConfig = () =>
  read(NEXT_CONFIG)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

describe('BUILD-01: the production build no longer duplicates the checks', () => {
  it('skips ESLint and the type-check inside next build', () => {
    const config = activeConfig();
    expect(config).toMatch(/eslint:\s*\{\s*ignoreDuringBuilds:\s*true\s*\}/);
    expect(config).toMatch(/typescript:\s*\{\s*ignoreBuildErrors:\s*true\s*\}/);
  });

  it('explains why in the config itself, so the flags are not read as laziness', () => {
    // The comment is the load-bearing part: these two flags are dangerous without the
    // reason and the pointer to what replaces them.
    const raw = read(NEXT_CONFIG);
    expect(raw).toContain('BUILD-01');
    expect(raw).toContain('test.yml');
  });
});

describe('BUILD-01: CI still enforces both, as its own required steps', () => {
  const workflow = read(WORKFLOW);

  it('runs on every pull request', () => {
    expect(workflow).toMatch(/^on:\s*\n\s*pull_request:/m);
  });

  it('lints', () => {
    expect(workflow).toContain('run: npm run lint');
  });

  it('type-checks', () => {
    expect(workflow).toContain('run: npm run typecheck');
  });

  it('still builds, so a compile error is caught before Vercel sees it', () => {
    expect(workflow).toContain('run: npm run build');
  });

  it('checks formatting and runs the suite', () => {
    expect(workflow).toContain('run: npm run format:check');
    expect(workflow).toContain('run: npm test');
  });

  it('keeps the commands pointed at the real tools', () => {
    const scripts = JSON.parse(read('package.json')).scripts as Record<string, string>;
    expect(scripts.lint).toContain('next lint');
    expect(scripts.typecheck).toContain('tsc --noEmit');
    expect(scripts.build).toContain('next build');
  });

  it('orders the checks before the build, so a red gate stops the job early', () => {
    const lintAt = workflow.indexOf('run: npm run lint');
    const typecheckAt = workflow.indexOf('run: npm run typecheck');
    const buildAt = workflow.indexOf('run: npm run build');
    expect(lintAt).toBeLessThan(buildAt);
    expect(typecheckAt).toBeLessThan(buildAt);
  });
});
