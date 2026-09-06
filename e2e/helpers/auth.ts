import { type Page } from '@playwright/test';

/**
 * Real-login helper for the golden tenant E2E suites.
 *
 * Demo accounts are seeded in tenant `bizosto-demo` and share a password that
 * exists only in environment configuration. Emails below are non-secret
 * defaults; the password must never be committed to source.
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

export function requireDemoPassword(): string {
  const password = String(process.env.E2E_DEMO_PASSWORD || '').trim();
  if (!password) {
    throw new Error('E2E_DEMO_PASSWORD is required for authenticated golden tenant tests');
  }
  return password;
}

/**
 * Log in as a demo role via the real login form and wait for navigation away
 * from /login. Missing credentials fail the suite instead of producing a
 * misleading skipped/green certification.
 */
export async function loginAs(page: Page, role: SmokeRole): Promise<void> {
  const password = requireDemoPassword();
  const email = emailForRole(role);

  await page.goto('/login');
  await page.locator('input[type="email"], input[name="email"]').fill(email);
  await page.locator('input[type="password"], input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();

  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15000 });
}
