import { type Page } from '@playwright/test';
import { requireDemoPassword } from '../../lib/demo/password-policy.mjs';

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

// The same rule the seeder writes with and the preflight checks — see
// lib/demo/password-policy.mjs. This helper used to trim while the preflight did not,
// which is how a correctly configured secret failed the gate. Missing credentials still
// throw here rather than skipping: E2E_DEMO_PASSWORD is required, never optional.
export { requireDemoPassword };

/**
 * What to do about an Identity Platform rejection, without claiming to know more than it
 * said. `INVALID_LOGIN_CREDENTIALS` really is two causes at once; naming only the likelier
 * one is what sent the last certification round looking for a stale password when a demo
 * tenant seeded into the wrong Firebase project would look exactly the same.
 */
function remedyFor(identityReason: string): string {
  if (identityReason.startsWith('TOO_MANY_ATTEMPTS_TRY_LATER')) {
    return (
      'The account is throttled by Firebase after repeated failed sign-ins, which a failing ' +
      'certification run produces 39 of. Fix the credential first, then let the throttle clear.'
    );
  }
  if (identityReason.startsWith('USER_DISABLED')) {
    return 'The account exists and is disabled. Re-seeding the golden tenant re-enables it.';
  }
  if (identityReason.startsWith('EMAIL_NOT_FOUND')) {
    return 'This Firebase project holds no such account. Seed the golden tenant into the project the deployment reads.';
  }
  return (
    "Either the demo accounts do not carry this run's E2E_DEMO_PASSWORD, or they do not " +
    'exist in the Firebase project this deployment serves — Email Enumeration Protection ' +
    'makes those indistinguishable from here. Run the Seed Golden Tenant workflow, which ' +
    'seeds from this same secret, and re-run the gate.'
  );
}

/**
 * Log in as a demo role via the real login form and wait for navigation away
 * from /login. Missing credentials fail the suite instead of producing a
 * misleading skipped/green certification.
 */
export async function loginAs(page: Page, role: SmokeRole): Promise<void> {
  const password = requireDemoPassword();
  const email = emailForRole(role);

  // The page's own message cannot distinguish the two causes that matter here. With
  // Email Enumeration Protection enabled — the default for current Firebase projects —
  // Identity Platform answers a wrong password and a non-existent account identically,
  // and the login page renders both as "Incorrect password. Please try again.". So a
  // failing run could not tell "re-seed the accounts" from "the accounts are in a
  // different project", and reported the first as if it knew.
  //
  // Identity Platform's own code is more specific than the page's text, so record it.
  // Only the RESPONSE is read; the request body carries the password and is never touched.
  let identityReason = '';
  page.on('response', (response) => {
    if (response.ok() || !response.url().includes('accounts:signInWithPassword')) return;
    void response
      .json()
      .then((body) => {
        identityReason = String(body?.error?.message || '').trim();
      })
      .catch(() => {
        // Best effort only: never mask the failure the caller is about to report.
      });
  });

  await page.goto('/login');

  const passwordField = page.locator('input[type="password"], input[name="password"]');
  try {
    await passwordField.waitFor({ state: 'visible', timeout: 15000 });
  } catch {
    // Without this the suite reports a bare 30s timeout on a locator, which is
    // what made the first golden tenant run take twenty minutes to say nothing.
    // The likeliest cause by far is that the browser is on Vercel's Deployment
    // Protection wall, which has an email field and no password field.
    throw new Error(
      `Bizosto login form not found at ${page.url()} (page title: "${await page.title()}"). ` +
        'If this is a Vercel authentication page, the deployment is behind Deployment ' +
        'Protection and VERCEL_AUTOMATION_BYPASS_SECRET is missing or wrong.',
    );
  }

  await page.locator('input[type="email"], input[name="email"]').fill(email);
  await passwordField.fill(password);
  await page.locator('button[type="submit"]').click();

  try {
    await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15000 });
  } catch {
    // The page puts the reason in its own error region. Without reading it the
    // suite can only report "navigation did not happen", which is not something
    // an operator can act on.
    let reported = '';
    try {
      const errorRegion = page.locator('.login-error');
      if (await errorRegion.count()) {
        reported = ((await errorRegion.first().textContent()) || '').trim();
      }
    } catch {
      // Best effort only: never mask the original failure.
    }

    throw new Error(
      `Login as ${role} did not leave /login. ` +
        (reported ? `The page reported: "${reported}". ` : 'The page reported no error. ') +
        (identityReason ? `Identity Platform reported: ${identityReason}. ` : '') +
        remedyFor(identityReason),
    );
  }
}
