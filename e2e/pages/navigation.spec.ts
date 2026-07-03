import { test, expect } from '@playwright/test';

test.describe('Public page loads', () => {
  test('/login loads with status 200', async ({ page }) => {
    const response = await page.goto('/login');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/.+/);
  });

  test('/signup loads (if exists)', async ({ page }) => {
    const response = await page.goto('/signup');
    // Accept 200 (page exists) or 404 (page intentionally absent)
    expect([200, 404]).toContain(response?.status());
    if (response?.status() === 200) {
      await expect(page).toHaveTitle(/.+/);
    }
  });

  test('static pages do not crash (no 5xx)', async ({ page }) => {
    const publicPages = ['/login'];
    for (const url of publicPages) {
      const response = await page.goto(url);
      const status = response?.status() ?? 0;
      expect(status).toBeLessThan(500);
    }
  });
});
