import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

test.describe("Production module — unauthenticated access", () => {
  test("GET /api/production/overview returns 401 without auth", async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/production/overview`, {
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(401);
  });

  test("GET /api/production/files/list returns 401 without auth", async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/production/files/list`, {
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(401);
  });
});
