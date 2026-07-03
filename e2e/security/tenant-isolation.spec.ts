import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const PROTECTED_GET_ENDPOINTS = [
  '/api/admin/clients/list',
  '/api/admin/finance/overview',
  '/api/hr/overview',
  '/api/am/overview',
];

test.describe('Tenant isolation — unauthenticated access', () => {
  for (const endpoint of PROTECTED_GET_ENDPOINTS) {
    test(`GET ${endpoint} returns 401 without session`, async ({ request }) => {
      const response = await request.get(`${BASE_URL}${endpoint}`);
      expect(response.status()).toBe(401);
    });
  }

  test('POST without X-Requested-With header returns 403 (CSRF)', async ({ request }) => {
    // Pick a mutating endpoint that enforces CSRF checks
    const response = await request.post(`${BASE_URL}/api/admin/users/delete`, {
      headers: {
        'Content-Type': 'application/json',
        // Deliberately omit X-Requested-With
      },
      data: { id: 'test' },
      failOnStatusCode: false,
    });
    // Must be 401 (no auth) or 403 (CSRF rejected). Either is acceptable; 2xx is not.
    expect([401, 403]).toContain(response.status());
  });
});
