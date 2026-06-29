import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const XHR = { "X-Requested-With": "XMLHttpRequest" };

// Internal revenue pipeline, in order. An admin is authorized for every stage.
const INTERNAL_PIPELINE = [
  { stage: "leads", path: "/api/crm/leads" },
  { stage: "deals", path: "/api/crm/deals" },
  { stage: "invoices", path: "/api/finance/invoices/list" },
  { stage: "projects", path: "/api/admin/projects/list" },
  { stage: "clients", path: "/api/admin/clients/list" },
];

// Final delivery stage — the client portal.
const CLIENT_PORTAL = [
  { stage: "client overview", path: "/api/client/overview" },
  { stage: "client projects", path: "/api/client/projects/list" },
];

test.describe("Golden flow — authenticated revenue pipeline", () => {
  test("admin traverses every internal stage (lead -> deal -> invoice -> project -> client)", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    for (const { stage, path } of INTERNAL_PIPELINE) {
      const res = await page.request.get(`${BASE_URL}${path}`, { headers: XHR });
      expect(res.status(), `admin GET ${stage} (${path}) should be 200`).toBe(200);
    }
  });

  test("client can reach the delivery stage (portal)", async ({ page }) => {
    await loginAs(page, "client");
    for (const { stage, path } of CLIENT_PORTAL) {
      const res = await page.request.get(`${BASE_URL}${path}`, { headers: XHR });
      expect(res.status(), `client GET ${stage} (${path}) should be 200`).toBe(200);
    }
  });

  test("client cannot cross into internal pipeline data", async ({ page }) => {
    await loginAs(page, "client");
    const res = await page.request.get(`${BASE_URL}/api/finance/invoices/list`, {
      headers: XHR,
      failOnStatusCode: false,
    });
    expect([401, 403]).toContain(res.status());
  });
});
