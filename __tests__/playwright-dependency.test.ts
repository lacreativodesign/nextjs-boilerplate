import * as fs from 'fs';
import * as path from 'path';

/**
 * Playwright E2E runner guard (QUAL-01, F10).
 *
 * The repo ships a complete E2E harness — playwright.config.ts, the e2e/ specs,
 * the per-role smoke suite (e2e/smoke/role-pages.spec.ts), the auth helper, and
 * the smoke.yml workflow — but @playwright/test was missing from package.json, so
 * a clean install could not run `npm run test:smoke` at all. These assertions keep
 * the dependency, its exact pin, the smoke script, and the harness files from
 * regressing, so the browser-based role-navigation evidence stays reproducible.
 */

const read = (relative: string): string =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');
const exists = (relative: string): boolean => fs.existsSync(path.join(process.cwd(), relative));

const pkg = JSON.parse(read('package.json')) as {
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

describe('Playwright E2E runner (QUAL-01)', () => {
  it('declares @playwright/test in devDependencies', () => {
    expect(pkg.devDependencies).toBeDefined();
    expect(pkg.devDependencies?.['@playwright/test']).toBeDefined();
  });

  it('pins @playwright/test to an exact version', () => {
    const version = pkg.devDependencies?.['@playwright/test'] ?? '';
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('keeps the test:smoke script targeting e2e/smoke', () => {
    expect(pkg.scripts?.['test:smoke']).toBe('playwright test e2e/smoke');
  });

  it('ships the playwright config and per-role smoke spec', () => {
    expect(exists('playwright.config.ts')).toBe(true);
    expect(exists('e2e/smoke/role-pages.spec.ts')).toBe(true);
  });
});
