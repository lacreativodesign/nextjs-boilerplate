import { test, expect } from "@playwright/test";

test.describe("Login page", () => {
  test("loads at /login", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response?.status()).toBe(200);
  });

  test("shows email and password fields", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"], input[name="password"]')).toBeVisible();
  });

  test('shows "Forgot Password" link', async ({ page }) => {
    await page.goto("/login");
    const forgotLink = page.getByText(/forgot password/i);
    await expect(forgotLink).toBeVisible();
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"], input[name="email"]').fill("invalid@example.com");
    await page.locator('input[type="password"], input[name="password"]').fill("wrongpassword");
    await page.locator('button[type="submit"]').click();
    // Wait for an error message to appear
    const error = page.locator('[role="alert"], .error, [data-testid="error"]').or(
      page.getByText(/invalid|incorrect|wrong|failed|error/i)
    );
    await expect(error.first()).toBeVisible({ timeout: 8000 });
  });

  test("shows validation on empty form submission", async ({ page }) => {
    await page.goto("/login");
    await page.locator('button[type="submit"]').click();
    // Browser native validation or custom error should appear
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const isRequired = await emailInput.getAttribute("required");
    if (isRequired !== null) {
      // Native browser validation — field will be invalid
      const validity = await emailInput.evaluate((el: HTMLInputElement) => el.validity.valid);
      expect(validity).toBe(false);
    } else {
      // Custom validation message
      const error = page.locator('[role="alert"], .error, [data-testid="error"]');
      await expect(error.first()).toBeVisible({ timeout: 5000 });
    }
  });
});
