import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

test.describe("CSRF enforcement", () => {
  test("POST /api/admin/clients/list without X-Requested-With returns 403", async ({
    request,
  }) => {
    const response = await request.post(`${BASE_URL}/api/admin/clients/list`, {
      headers: {
        "Content-Type": "application/json",
        // Deliberately omit X-Requested-With
      },
      data: {},
      failOnStatusCode: false,
    });
    // Must be 401 (no session) or 403 (CSRF rejected). 2xx is never acceptable.
    expect([401, 403]).toContain(response.status());
  });

  test("POST /api/admin/users/delete without X-Requested-With returns 403", async ({
    request,
  }) => {
    const response = await request.post(`${BASE_URL}/api/admin/users/delete`, {
      headers: {
        "Content-Type": "application/json",
        // Deliberately omit X-Requested-With
      },
      data: { id: "test" },
      failOnStatusCode: false,
    });
    expect([401, 403]).toContain(response.status());
  });

  test("POST /api/session-login is EXEMPT from CSRF (no 403 for missing header)", async ({
    request,
  }) => {
    const response = await request.post(`${BASE_URL}/api/session-login`, {
      headers: { "Content-Type": "application/json" },
      data: { email: "test@example.com", password: "wrongpassword" },
      failOnStatusCode: false,
    });
    // Login endpoint must not block on CSRF — it should return 400/401/422, never 403
    expect(response.status()).not.toBe(403);
  });

  test("POST /api/signup is EXEMPT from CSRF (no 403 for missing header)", async ({
    request,
  }) => {
    const response = await request.post(`${BASE_URL}/api/signup`, {
      headers: { "Content-Type": "application/json" },
      data: { email: "newuser@example.com", password: "Password123!" },
      failOnStatusCode: false,
    });
    // Signup must not block on CSRF — any status except 403 is acceptable
    expect(response.status()).not.toBe(403);
  });
});
