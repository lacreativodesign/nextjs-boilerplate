import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('HR module — unauthenticated access', () => {
  test('GET /api/hr/overview returns 401 without auth', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/hr/overview`, {
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(401);
  });

  test('GET /api/hr/documents/list returns 401 without auth', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/hr/documents/list`, {
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(401);
  });

  // S12: /api/hr/attendance/list was removed. It had no UI consumer, ran an unbounded
  // users scan followed by one subcollection query PER USER, and those queries addressed
  // `attendance/{userId}/logs` — a subcollection no writer has ever created. The monthly
  // grid supersedes it in a single bounded query, so the auth smoke test moves there.
  test('GET /api/hr/attendance returns 401 without auth', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/hr/attendance?month=2026-01`, {
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(401);
  });

  test('POST /api/hr/employees/create returns 401 without auth', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/hr/employees/create`, {
      headers: { 'Content-Type': 'application/json' },
      data: {},
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(401);
  });
});
