import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('authentication and signup hardening contracts', () => {
  const middleware = read('middleware.ts');
  const subscription = read('lib/subscription.ts');
  const signup = read('app/api/signup/route.ts');

  it('does not trust a caller-controlled prefetch header to bypass middleware', () => {
    expect(middleware).not.toContain("req.headers.get('x-middleware-prefetch')");
    expect(middleware).not.toContain('x-middleware-prefetch');
  });

  it('keeps security, CSP nonce, and rate-limit headers on login and signup passthroughs', () => {
    const publicPageGate = middleware.slice(
      middleware.indexOf('// Skip tenant validation for login/signup pages'),
      middleware.indexOf("if (pathname === '/'"),
    );
    expect(publicPageGate).toContain('applyRateHeaders(');
    expect(publicPageGate).toContain('request: { headers: requestHeaders }');
  });

  it('models pending_checkout as locked and exempts only exact recovery APIs', () => {
    expect(subscription).toContain("| 'pending_checkout'");
    expect(subscription).toContain("state === 'hard_locked' || state === 'pending_checkout'");
    expect(middleware).toContain('isSubscriptionRecoveryApiPath(pathname)');
    expect(subscription).not.toContain("pathname.startsWith('/api/billing')");
    expect(subscription).not.toContain("pathname.startsWith('/api/stripe')");
  });

  it('checks the platform signup switch and reserved identity before consuming an OTP', () => {
    const decision = signup.indexOf('resolvePublicSignupDenial()');
    const reserved = signup.indexOf('isReservedTenantIdentifier(payload.companyName)');
    const otp = signup.indexOf("collection('email_otps')");
    const authCreate = signup.indexOf('adminAuth.createUser');

    expect(decision).toBeGreaterThan(-1);
    expect(reserved).toBeGreaterThan(decision);
    expect(otp).toBeGreaterThan(reserved);
    expect(authCreate).toBeGreaterThan(otp);
  });

  it('gates both signup OTP endpoints while leaving password recovery on its own route', () => {
    for (const route of ['app/api/auth/send-otp/route.ts', 'app/api/auth/verify-otp/route.ts']) {
      expect(read(route)).toContain('resolvePublicSignupDenial()');
    }
    expect(read('app/api/auth/send-otp/route.ts')).toContain('${escapeHtml(email)}');

    const passwordRecovery = read('app/api/auth/request-password-reset/route.ts');
    expect(passwordRecovery).not.toContain('resolvePublicSignupDenial');
    expect(middleware).toContain('isPublicAuthPath(pathname)');
    expect(middleware).toContain("pathname.startsWith('/set-password')");
  });

  it('does not exempt authenticated session and SSO mutations as a broad auth prefix', () => {
    expect(middleware).not.toContain("pathname.startsWith('/api/auth')");
    expect(middleware).toContain('CSRF_EXEMPT_AUTH_PATHS.has(pathname)');

    const publicAuthBlock = middleware.slice(
      middleware.indexOf('const PUBLIC_AUTH_PATHS'),
      middleware.indexOf('function isPublicAuthPath'),
    );
    for (const protectedPath of [
      '/api/auth/create-set-password-token',
      '/api/auth/sessions',
      '/api/auth/sessions/invalidate-all',
      '/api/auth/sso/status',
    ]) {
      expect(publicAuthBlock).not.toContain(`'${protectedPath}'`);
    }

    const sessionHook = read('lib/hooks/useSessionTimeout.ts');
    expect(sessionHook).toContain("apiFetch('/api/auth/sessions'");
    expect(sessionHook).not.toContain("fetch('/api/auth/sessions'");
  });

  it('limits the global launch checklist and diagnostics to super_admin', () => {
    const helper = read('app/api/admin/launch-checklist/_utils.ts');
    expect(helper).toContain('isSuperAdmin(auth.user.role)');
    expect(helper).toContain('status: 403');
    expect(read('app/api/admin/launch-checklist/route.ts')).toContain(
      'requireLaunchChecklistSuperAdmin()',
    );
    expect(read('app/api/admin/launch-checklist/check/route.ts')).toContain(
      'requireLaunchChecklistSuperAdmin()',
    );
  });
});

describe('demo environment hardening contracts', () => {
  const seed = read('lib/demo/seed.ts');
  const script = read('scripts/seedDemoTenant.ts');
  const page = read('app/super_admin/demo/page.tsx');
  const docs = read('docs/demo-environment.md');
  const e2eAuth = read('e2e/helpers/auth.ts');
  const legacyCredential = ['Bizosto', 'Demo', '2026', '!'].join('');

  it('contains no published legacy shared credential', () => {
    for (const source of [seed, script, page, docs, e2eAuth]) {
      expect(source).not.toContain(legacyCredential);
    }
    expect(seed).not.toContain('DEMO_PASSWORD');
    expect(page).not.toContain('DEMO_PASSWORD');
    expect(script).not.toMatch(/console\.log\([^\n]*(password|credential)[^\n]*\$\{/i);
    expect(e2eAuth).not.toMatch(/E2E_DEMO_PASSWORD\b/);
  });

  it('guards and validates credentials before clearing or writing demo data', () => {
    const body = seed.slice(seed.indexOf('export async function seedDemoTenant'));
    const guard = body.indexOf('assertDemoMutationAllowed({ tenantId, projectId })');
    const credentials = body.indexOf('parseDemoUserPasswords(');
    const clear = body.indexOf('clearDemoTenantData(tenantId)');
    const firstWrite = body.indexOf("collection('tenants')");

    expect(guard).toBeGreaterThan(-1);
    expect(credentials).toBeGreaterThan(guard);
    expect(clear).toBeGreaterThan(credentials);
    expect(firstWrite).toBeGreaterThan(clear);
  });

  it('deletes only exact tenant-scoped demo data and makes reset a real guarded replacement', () => {
    expect(seed).toContain(".where('tenantId', '==', tenantId)");
    expect(seed).toContain('.doc(tenantId).delete()');
    expect(seed).toContain('export async function resetDemoTenant');

    const resetRoute = read('app/api/super_admin/demo/reset/route.ts');
    expect(resetRoute).toContain('DEMO_RESET_CONFIRMATION');
    expect(resetRoute).toContain('resetDemoTenant()');
    expect(resetRoute).not.toContain('seedDemoTenant(');

    const seedRoute = read('app/api/super_admin/demo/seed/route.ts');
    expect(seedRoute).toContain('DEMO_SEED_CONFIRMATION');
    expect(seedRoute.indexOf('requireSuperAdmin(req)')).toBeLessThan(
      seedRoute.indexOf('req.json()'),
    );

    const statusRoute = read('app/api/super_admin/demo/status/route.ts');
    expect(statusRoute).toContain('evaluateDemoMutationSafety({');
    expect(statusRoute).toContain('mutationSafety,');
  });

  it('pins CLI and UI controls to the demo tenant without exposing credentials', () => {
    expect(script).toContain('The demo seeder is restricted to tenant');
    expect(script).toContain('Explicit confirmation required');
    expect(script).not.toContain('seedDemoEnvironment');
    expect(page).toContain('This page never receives or displays them.');
    expect(page).toContain("confirmation: 'RESET_BIZOSTO_DEMO'");
    expect(page).toContain('mutationSafety?.allowed !== true');
    expect(e2eAuth).toContain('E2E_DEMO_PASSWORDS_JSON');
    expect(e2eAuth).toContain('parseDemoUserPasswords');
    expect(e2eAuth).toContain('assertIsolatedSmokeTarget()');
    expect(e2eAuth).toContain("'app.bizosto.com'");
    expect(e2eAuth).toContain("page.request.get('/api/public/firebase-config')");
    expect(e2eAuth).toContain('E2E_EXPECTED_FIREBASE_PROJECT_ID');
  });
});
