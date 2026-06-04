import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

test.describe("Role escalation prevention", () => {
  test(
    "POST /api/admin/users/create with role=super_admin returns 403 without super_admin session",
    async ({ request }) => {
      const response = await request.post(`${BASE_URL}/api/admin/users/create`, {
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        data: {
          email: "attacker@example.com",
          name: "Attacker",
          role: "super_admin",
        },
        failOnStatusCode: false,
      });
      // Without a super_admin session the server must reject with 401 or 403
      expect([401, 403]).toContain(response.status());
    }
  );

  test("Role escalation block works — 2xx is never returned for super_admin creation", async ({
    request,
  }) => {
    const response = await request.post(`${BASE_URL}/api/admin/users/create`, {
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      data: {
        email: "escalation-check@example.com",
        role: "super_admin",
      },
      failOnStatusCode: false,
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});
