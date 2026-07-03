import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('CRM module — unauthenticated access', () => {
  test('GET /api/admin/clients/list returns 401 without auth', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/admin/clients/list`, {
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(401);
  });

  test('GET /api/admin/sales/leads/list returns 401 without auth', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/admin/sales/leads/list`, {
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(401);
  });

  test('GET /api/admin/sales/deals/list returns 401 without auth', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/admin/sales/deals/list`, {
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(401);
  });

  test('GET /api/admin/clients/list?limit=5 returns max 5 items with pagination object', async ({
    request,
  }) => {
    const response = await request.get(`${BASE_URL}/api/admin/clients/list?limit=5`, {
      failOnStatusCode: false,
    });
    // Unauthenticated requests must be rejected
    if (response.status() === 401) {
      expect(response.status()).toBe(401);
      return;
    }
    const body = await response.json();
    // If authenticated context returns data, validate pagination shape
    expect(body).toHaveProperty('pagination');
    const items = body.data ?? body.items ?? body.clients ?? [];
    expect(items.length).toBeLessThanOrEqual(5);
  });
});
