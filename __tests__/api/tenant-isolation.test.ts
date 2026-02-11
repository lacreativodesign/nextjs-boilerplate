import { FirestoreEmulator, buildTenantSeed } from "./test-utils/firestore-emulator";
import { financeUser } from "./test-utils/auth";
import { jsonRequest } from "./test-utils/request";

const db = new FirestoreEmulator(buildTenantSeed());
const requireFinance = jest.fn(async () => ({ ok: true, user: financeUser({ uid: "finance_a", tenantId: "tenant_a", role: "finance" }) }));

jest.mock("@/lib/firebaseAdmin", () => ({ adminDb: db }));
jest.mock("@/app/api/finance/_utils", () => ({
  requireFinance,
  serverTimestamp: jest.fn(() => new Date("2025-01-01T00:00:00.000Z")),
}));
jest.mock("@/lib/security", () => ({ checkRateLimit: jest.fn(async () => undefined) }));
jest.mock("@/lib/logging", () => ({ logError: jest.fn() }));

describe("tenant isolation and RBAC enforcement", () => {
  it("prevents tenant A from reading tenant B recurring history", async () => {
    const route = await import("@/app/api/finance/recurring-invoices/history/route");
    const res = await route.GET(jsonRequest("https://app.local/api/finance/recurring-invoices/history?templateId=template_b"));
    expect(res.status).toBe(403);
  });

  it("prevents tenant A from deleting tenant B budget", async () => {
    const route = await import("@/app/api/finance/budgets/delete/route");
    const res = await route.POST(jsonRequest("https://app.local/api/finance/budgets/delete", { budgetId: "budget_b" }));
    expect(res.status).toBe(403);
  });

  it("returns unauthorized on missing finance auth context", async () => {
    requireFinance.mockResolvedValueOnce({ ok: false, status: 401, error: "Unauthorized" });
    const route = await import("@/app/api/finance/tax-rates/list/route");
    const res = await route.GET(jsonRequest("https://app.local/api/finance/tax-rates/list"));
    expect(res.status).toBe(401);
  });
});
