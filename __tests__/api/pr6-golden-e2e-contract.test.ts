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

  it('reaches a protected deployment without handing the bypass secret to third parties', () => {
    const setup = read('e2e/global-setup.ts');
    const config = read('playwright.config.ts');
    const smoke = read('.github/workflows/smoke.yml');
    const golden = read('.github/workflows/golden-e2e.yml');

    expect(setup).toContain('x-vercel-protection-bypass');
    expect(setup).toContain('x-vercel-set-bypass-cookie');
    // `extraHTTPHeaders` would attach the secret to every cross-origin request the
    // app makes (Firebase, Google, Stripe). It must never be used for this.
    expect(setup).not.toMatch(/^\s*extraHTTPHeaders/m);
    expect(config).not.toMatch(/^\s*extraHTTPHeaders/m);
    // Traces capture headers and cookies, and the report artifact is public on a
    // public repository, so traces are off whenever a bypass cookie is in play.
    expect(config).toContain("trace: bypassSecret ? 'off'");
    expect(smoke).toContain('VERCEL_AUTOMATION_BYPASS_SECRET');
    expect(golden).toContain('VERCEL_AUTOMATION_BYPASS_SECRET');
  });

  it('fails with a diagnosable message when the login form is not reachable', () => {
    const auth = read('e2e/helpers/auth.ts');

    expect(auth).toContain('Bizosto login form not found');
    expect(auth).toContain('VERCEL_AUTOMATION_BYPASS_SECRET');
    // A rejected sign-in must report the page's own reason, not just "no navigation".
    expect(auth).toContain('did not leave /login');
    expect(auth).toContain('.login-error');
    // ...and, because the page renders a wrong password and a missing account with the
    // same words, Identity Platform's own code as well. Reading it from the sign-in
    // RESPONSE is what keeps the password — which is in the request — out of this.
    expect(auth).toContain('accounts:signInWithPassword');
    expect(auth).toContain('Identity Platform reported');
    expect(auth).toContain('Seed Golden Tenant workflow');
    expect(auth).not.toContain('test.skip');
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
