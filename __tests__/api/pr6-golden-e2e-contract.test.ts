import * as fs from 'fs';
import * as path from 'path';

const read = (relative: string): string =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('PR6 golden tenant certification contract', () => {
  it('never ships a fixed demo password in the seeder, UI, or CLI', () => {
    const seed = read('lib/demo/seed.ts');
    const page = read('app/super_admin/demo/page.tsx');
    const script = read('scripts/seedDemoTenant.ts');

    expect(seed).toContain('E2E_DEMO_PASSWORD');
    expect(seed).not.toMatch(/DEMO_PASSWORD\s*=\s*['"][^'"]+['"]/);
    expect(page).not.toMatch(/DEMO_PASSWORD\s*=\s*['"][^'"]+['"]/);
    expect(page).not.toContain('copy(DEMO_PASSWORD)');
    expect(script).not.toContain('password: ${');
  });

  it('never publishes demo credentials in the documentation either', () => {
    // The seeder and UI were cleaned up first; the demo doc kept publishing the
    // same shared password in a table, which is the copy people actually read.
    const doc = read('docs/demo-environment.md');

    expect(doc).toContain('E2E_DEMO_PASSWORD');
    expect(doc).not.toContain('| Password |');
    // No table row may pair a demo account with a value in a further column.
    expect(doc).not.toMatch(/@bizosto\.com\s*\|\s*\S+\s*\|/);
    expect(doc).not.toMatch(/passwords? (?:are|is) fixed/i);
  });

  it('fails authenticated E2E when credentials are missing instead of skipping', () => {
    const auth = read('e2e/helpers/auth.ts');
    const smoke = read('.github/workflows/smoke.yml');
    const golden = read('.github/workflows/golden-e2e.yml');

    expect(auth).toContain('E2E_DEMO_PASSWORD is required');
    expect(auth).not.toContain('test.skip');
    expect(smoke).toContain('E2E_DEMO_PASSWORD is required');
    expect(smoke).toContain('E2E_BASE_URL is required');
    expect(golden).toContain('E2E_DEMO_PASSWORD is required');
    expect(golden).toContain('E2E_BASE_URL is required');
  });

  it('runs the golden journey and all per-role smoke tests in the launch gate', () => {
    const workflow = read('.github/workflows/golden-e2e.yml');
    const goldenSpec = read('e2e/golden/golden-tenant.spec.ts');

    expect(workflow).toContain('npx playwright test e2e/golden e2e/smoke');
    expect(goldenSpec).toContain("loginAs(page, 'admin')");
    expect(goldenSpec).toContain("loginAs(page, 'client')");
    expect(goldenSpec).toContain("loginAs(page, 'finance')");
    expect(goldenSpec).toContain('TechVision Brand Refresh');
    expect(goldenSpec).toContain('INV-0001');
  });

  it('requires both demo routes to rebuild a canonical environment behind Super Admin', () => {
    const handler = read('app/api/super_admin/demo/_handler.ts');
    const resetRoute = read('app/api/super_admin/demo/reset/route.ts');
    const seedRoute = read('app/api/super_admin/demo/seed/route.ts');

    expect(handler).toContain('seedDemoEnvironment');
    expect(handler).toContain('reset: true');
    // The guard stays in each route file, where the P0-5 route-contract gate reads it.
    expect(resetRoute).toContain('requireSuperAdmin(req)');
    expect(resetRoute).toContain("rebuildGoldenTenant('reset')");
    expect(seedRoute).toContain('requireSuperAdmin(req)');
    expect(seedRoute).toContain("rebuildGoldenTenant('seed')");
  });

  it('keeps the golden roster in one client-safe module the seeder and UI share', () => {
    const users = read('lib/demo/users.ts');
    const seed = read('lib/demo/seed.ts');
    const page = read('app/super_admin/demo/page.tsx');

    // A client component must never pull the seeder (and therefore firebaseAdmin)
    // into the browser bundle.
    expect(users).not.toMatch(/^\s*import\b.*firebaseAdmin/m);
    expect(page).toContain("from '@/lib/demo/users'");
    expect(page).not.toContain("from '@/lib/demo/seed'");
    expect(seed).toContain("from './users'");
  });
});
