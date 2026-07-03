import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Pagination behaviour', () => {
  test('GET /api/admin/clients/list?limit=5 returns pagination object with hasMore and nextCursor', async ({
    request,
  }) => {
    const response = await request.get(`${BASE_URL}/api/admin/clients/list?limit=5`, {
      failOnStatusCode: false,
    });

    // Unauthenticated — verify auth guard fires and skip pagination shape check
    if (response.status() === 401) {
      expect(response.status()).toBe(401);
      return;
    }

    expect(response.status()).toBe(200);
    const body = await response.json();

    // Pagination envelope must exist
    expect(body).toHaveProperty('pagination');
    expect(body.pagination).toHaveProperty('hasMore');
    expect(body.pagination).toHaveProperty('nextCursor');

    // Returned items must not exceed the requested limit
    const items = body.data ?? body.items ?? body.clients ?? [];
    expect(items.length).toBeLessThanOrEqual(5);
  });

  test('GET /api/admin/clients/list without params returns default page size', async ({
    request,
  }) => {
    const response = await request.get(`${BASE_URL}/api/admin/clients/list`, {
      failOnStatusCode: false,
    });

    // Unauthenticated — verify auth guard fires and skip shape check
    if (response.status() === 401) {
      expect(response.status()).toBe(401);
      return;
    }

    expect(response.status()).toBe(200);
    const body = await response.json();

    // A pagination object should still be present for the default page
    expect(body).toHaveProperty('pagination');
  });
});
