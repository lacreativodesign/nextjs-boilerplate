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

  it('requires the reset route to rebuild a canonical environment', () => {
    const resetRoute = read('app/api/super_admin/demo/reset/route.ts');
    const seedRoute = read('app/api/super_admin/demo/seed/route.ts');

    expect(resetRoute).toContain('seedDemoEnvironment');
    expect(resetRoute).toContain('reset: true');
    expect(seedRoute).toContain('seedDemoEnvironment');
    expect(seedRoute).toContain('reset: true');
  });
});
