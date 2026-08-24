import fs from 'fs';
import path from 'path';

/**
 * BUILD-01 — both CI and the deployment build enforce lint and typecheck.
 *
 * CI runs ESLint and TypeScript as explicit diagnostic steps, then `next build` enforces
 * the same gates at the deployable-artifact boundary. Keeping both protects Vercel builds
 * if branch protection or workflow configuration drifts. This test prevents either layer
 * from quietly returning to the historical ignore-build-errors configuration.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const WORKFLOW = '.github/workflows/test.yml';
const NEXT_CONFIG = 'next.config.js';

/** Strips comments so prose describing a setting is never mistaken for the setting. */
const activeConfig = () =>
  read(NEXT_CONFIG)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

describe('BUILD-01: the production build fails closed', () => {
  it('does not ignore ESLint or TypeScript build errors', () => {
    const config = activeConfig();
    expect(config).toMatch(/eslint:\s*\{\s*ignoreDuringBuilds:\s*false\s*\}/);
    expect(config).toMatch(/typescript:\s*\{\s*ignoreBuildErrors:\s*false\s*\}/);
  });

  it('documents why in-build gates remain enabled', () => {
    const raw = read(NEXT_CONFIG);
    expect(raw).toContain('BUILD-01');
    expect(raw).toContain('fail closed');
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
