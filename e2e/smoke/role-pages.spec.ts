/**
 * Per-role smoke suite — REAL login as each seeded demo account, then load that
 * role's key pages and assert no error banner.
 *
 * Runs against a DEPLOYMENT, not a local build. Required env vars:
 *   - BASE_URL            deployment URL (read by playwright.config.ts)
 *   - E2E_DEMO_PASSWORD   shared password for the demo_* accounts
 *
 * Without E2E_DEMO_PASSWORD the helper calls test.skip(), so the suite degrades
 * gracefully (e.g. when the GitHub secret is missing). Run with:
 *   npm run test:smoke
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAs, ROLE_LANDING, type SmokeRole } from "../helpers/auth";

/**
 * Short, representative page list per role — pulled from lib/navigation/sidebarConfig.ts.
 * This is a SMOKE check (does the page load without erroring), not an exhaustive crawl.
 */
const ROLE_PAGES: Record<SmokeRole, string[]> = {
  admin: ["/dashboard", "/users", "/clients"],
  sales: ["/sales", "/sales/leads", "/sales/deals"],
  sales_manager: ["/sales_manager", "/sales_manager/team", "/sales/deals"],
  am: ["/am", "/am/clients", "/am/projects"],
  am_manager: ["/am_manager", "/am_manager/team", "/reports"],
  production: ["/production", "/production/jobs", "/production/qa"],
  production_manager: ["/production_manager", "/production_manager/team", "/reports"],
  finance: ["/finance", "/finance/invoices", "/finance/payments"],
  hr: ["/hr", "/hr/employees", "/hr/attendance"],
  client: ["/client", "/client/projects", "/client/billing"],
};

/** Common, framework-agnostic error indicators we never want to see on a page. */
const ERROR_TEXT = /Unable to load|Something went wrong|Server error|CSRF validation failed/i;

async function assertNoErrorBanner(page: Page): Promise<void> {
  // Soft text check — generous, resilient to copy differences.
  await expect(page.getByText(ERROR_TEXT), "no error-banner text").toHaveCount(0);
  // Any alert region carrying one of those error messages.
  await expect(
    page.locator('[role="alert"]').filter({ hasText: ERROR_TEXT }),
    "no error alert region",
  ).toHaveCount(0);
}

for (const role of Object.keys(ROLE_PAGES) as SmokeRole[]) {
  test.describe(`smoke: ${role}`, () => {
    test(`logs in and loads ${role} pages without errors`, async ({ page }) => {
      await loginAs(page, role);

      // 1. Landed somewhere authenticated (not /login) within this role's area.
      const landing = ROLE_LANDING[role];
      const pathname = new URL(page.url()).pathname;
      expect(pathname, "should not be on /login after auth").not.toMatch(/\/login$/);
      expect(pathname.startsWith(landing), `should land on ${landing} area, got ${pathname}`).toBeTruthy();

      // 2. Load this role's key pages — no 4xx/5xx, no error banner.
      for (const href of ROLE_PAGES[role]) {
        const response = await page.goto(href);
        const status = response?.status() ?? 0;
        expect(status, `${href} should not return a 4xx/5xx`).toBeLessThan(400);
        await assertNoErrorBanner(page);
      }
    });
  });
}
