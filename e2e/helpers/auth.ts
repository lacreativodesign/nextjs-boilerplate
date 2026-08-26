import { test, type Page } from '@playwright/test';
import { parseDemoUserPasswords } from '../../lib/demo/safety';

/**
 * Real-login helper for the per-role smoke suite.
 *
 * Demo accounts are seeded only in an isolated environment and each has a distinct password.
 * Emails below are non-secret defaults; credentials are read only from
 * process.env.E2E_DEMO_PASSWORDS_JSON and are never hardcoded or logged.
 *
 * Per-role email can be overridden via `E2E_<ROLE_UPPER>_EMAIL`
 * (e.g. E2E_SALES_MANAGER_EMAIL).
 */

export type SmokeRole =
  | 'admin'
  | 'sales'
  | 'sales_manager'
  | 'am'
  | 'am_manager'
  | 'production'
  | 'production_manager'
  | 'finance'
  | 'hr'
  | 'client';

/** Default (non-secret) demo emails — seeded in tenant `bizosto-demo`. */
export const ROLE_EMAILS: Record<SmokeRole, string> = {
  admin: 'demo_admin@bizosto.com',
  sales: 'demo_sales@bizosto.com',
  sales_manager: 'demo_sales_manager@bizosto.com',
  am: 'demo_am@bizosto.com',
  am_manager: 'demo_am_manager@bizosto.com',
  production: 'demo_production@bizosto.com',
  production_manager: 'demo_production_manager@bizosto.com',
  finance: 'demo_finance@bizosto.com',
  hr: 'demo_hr@bizosto.com',
  client: 'demo_client@bizosto.com',
};

/** Per-role landing route (mirrors ROLE_DASHBOARD_ROUTE in lib/erpAccess.ts). */
export const ROLE_LANDING: Record<SmokeRole, string> = {
  admin: '/dashboard',
  sales: '/sales',
  sales_manager: '/sales_manager',
  am: '/am',
  am_manager: '/am_manager',
  production: '/production',
  production_manager: '/production_manager',
  finance: '/finance',
  hr: '/hr',
  client: '/client',
};

/** Resolve the email for a role, allowing an env override. */
export function emailForRole(role: SmokeRole): string {
  const override = process.env[`E2E_${role.toUpperCase()}_EMAIL`];
  return override && override.trim().length > 0 ? override.trim() : ROLE_EMAILS[role];
}

export function passwordsForSmokeRoles(raw: string): Readonly<Record<string, string>> {
  const emails = (Object.keys(ROLE_EMAILS) as SmokeRole[]).map(emailForRole);
  return parseDemoUserPasswords(raw, emails);
}

export function assertIsolatedSmokeTarget(
  rawBaseUrl = process.env.BASE_URL || 'http://localhost:3000',
  isolatedAcknowledgement = process.env.E2E_ISOLATED_ENVIRONMENT,
): URL {
  let url: URL;
  try {
    url = new URL(rawBaseUrl);
  } catch {
    throw new Error('BASE_URL must be an absolute URL for authenticated smoke tests.');
  }

  const hostname = url.hostname.toLowerCase();
  if (['app.bizosto.com', 'dashboard.lacreativo.com'].includes(hostname)) {
    throw new Error('Authenticated smoke tests are forbidden against a production Bizosto host.');
  }

  const isLocal =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]';
  if (!isLocal && isolatedAcknowledgement !== 'true') {
    throw new Error(
      'Set E2E_ISOLATED_ENVIRONMENT=true only after verifying BASE_URL uses isolated Firebase data.',
    );
  }

  return url;
}

async function assertIsolatedFirebaseProject(page: Page, target: URL): Promise<void> {
  const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(
    target.hostname.toLowerCase(),
  );
  if (isLocal) return;

  const expectedProjectId = String(process.env.E2E_EXPECTED_FIREBASE_PROJECT_ID || '').trim();
  const productionProjectId = String(process.env.FIREBASE_PRODUCTION_PROJECT_ID || '').trim();
  if (!expectedProjectId || !productionProjectId) {
    throw new Error(
      'Remote smoke tests require E2E_EXPECTED_FIREBASE_PROJECT_ID and FIREBASE_PRODUCTION_PROJECT_ID.',
    );
  }

  const response = await page.request.get('/api/public/firebase-config');
  if (!response.ok()) {
    throw new Error('Could not verify the target deployment Firebase project before login.');
  }

  const payload = (await response.json()) as { projectId?: unknown };
  const actualProjectId = typeof payload.projectId === 'string' ? payload.projectId.trim() : '';
  if (
    !actualProjectId ||
    actualProjectId !== expectedProjectId ||
    actualProjectId === productionProjectId ||
    actualProjectId === 'la-creativo-erp'
  ) {
    throw new Error('Authenticated smoke test target is not isolated from production Firebase.');
  }
}

/**
 * Log in as a demo role via the REAL login form, then wait for navigation away
 * from /login. Skips the test (with a clear message) when the per-account credential map is not
 * set. A malformed, incomplete, weak, or shared map fails clearly instead of weakening the test.
 */
export async function loginAs(page: Page, role: SmokeRole): Promise<void> {
  const email = emailForRole(role);
  const rawPasswords = process.env.E2E_DEMO_PASSWORDS_JSON;
  test.skip(!rawPasswords, 'Set E2E_DEMO_PASSWORDS_JSON to run authenticated smoke tests');
  const target = assertIsolatedSmokeTarget();
  await assertIsolatedFirebaseProject(page, target);

  let password: string;
  try {
    password = passwordsForSmokeRoles(rawPasswords as string)[email];
  } catch {
    throw new Error(
      'E2E_DEMO_PASSWORDS_JSON must contain a distinct strong password for every smoke-test account.',
    );
  }

  await page.goto('/login');
  await page.locator('input[type="email"], input[name="email"]').fill(email);
  await page.locator('input[type="password"], input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();

  // Wait for navigation AWAY from /login (allow redirects to the role landing).
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15000 });
}
