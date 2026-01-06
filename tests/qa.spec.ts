import { test, expect, Browser } from "@playwright/test";

const shouldRun = process.env.QA_E2E === "1";
const password = process.env.SEED_PASSWORD || "ChangeMe123!";

const roles = [
  { role: "super_admin", email: "qa-super_admin@lacreativo.test", path: "/super_admin" },
  { role: "admin", email: "qa-admin@lacreativo.test", path: "/admin" },
  { role: "sales_manager", email: "qa-sales-manager@lacreativo.test", path: "/sales-manager" },
  { role: "sales", email: "qa-sales@lacreativo.test", path: "/sales" },
  { role: "account_manager", email: "qa-account-manager@lacreativo.test", path: "/am" },
  { role: "production", email: "qa-production@lacreativo.test", path: "/production" },
  { role: "finance", email: "qa-finance@lacreativo.test", path: "/finance" },
  { role: "hr", email: "qa-hr@lacreativo.test", path: "/hr" },
  { role: "client", email: "qa-client@lacreativo.test", path: "/client" },
];

async function login(page: any, email: string, remember: boolean) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  const checkbox = page.getByRole("checkbox");
  if (remember) {
    if (!(await checkbox.isChecked())) {
      await checkbox.check();
    }
  } else {
    if (await checkbox.isChecked()) {
      await checkbox.uncheck();
    }
  }
  await page.getByRole("button", { name: /login/i }).click();
}

test.describe("QA E2E", () => {
  test.skip(!shouldRun, "QA_E2E not enabled");

  test("remember me sets persistent cookie", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page, roles[0].email, true);
    await page.waitForURL("**/super_admin");
    const cookies = await context.cookies();
    const sessionCookie = cookies.find((cookie) => cookie.name === "lac_session");
    expect(sessionCookie).toBeTruthy();
    expect(sessionCookie?.expires).toBeGreaterThan(0);
    await context.close();
  });

  test("remember me unchecked uses session cookie", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page, roles[0].email, false);
    await page.waitForURL("**/super_admin");
    const cookies = await context.cookies();
    const sessionCookie = cookies.find((cookie) => cookie.name === "lac_session");
    expect(sessionCookie).toBeTruthy();
    expect(sessionCookie?.expires).toBe(-1);
    await context.close();
  });

  test("login routes for each role", async ({ browser }) => {
    for (const role of roles) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await login(page, role.email, true);
      await page.waitForURL(`**${role.path}`);
      await expect(page).toHaveURL(new RegExp(`${role.path}$`));
      await context.close();
    }
  });
});
