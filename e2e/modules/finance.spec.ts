import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Finance module — unauthenticated access', () => {
  test('GET /api/admin/finance/overview returns 401 without auth', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/admin/finance/overview`, {
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(401);
  });

  test('GET /api/admin/finance/invoices/list returns 401 without auth', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/admin/finance/invoices/list`, {
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(401);
  });

  test('GET /api/admin/finance/expenses/list returns 401 without auth', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/admin/finance/expenses/list`, {
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(401);
  });

  test('GET /api/admin/reports/exports/revenue-by-client?format=csv returns 401 without auth', async ({
    request,
  }) => {
    const response = await request.get(
      `${BASE_URL}/api/admin/reports/exports/revenue-by-client?format=csv`,
      { failOnStatusCode: false },
    );
    expect(response.status()).toBe(401);
  });
});
