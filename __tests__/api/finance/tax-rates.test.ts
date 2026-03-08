import { FirestoreEmulator, buildTenantSeed } from "../test-utils/firestore-emulator";
import { financeUser } from "../test-utils/auth";
import { jsonRequest } from "../test-utils/request";

const db = new FirestoreEmulator(buildTenantSeed());
const authUser = financeUser({ uid: "user_a", tenantId: "tenant_a" });

jest.mock("@/lib/firebaseAdmin", () => ({ adminDb: db }));
jest.mock("@/app/api/finance/_utils", () => ({
  requireFinance: jest.fn(async () => ({ ok: true, user: authUser })),
  serverTimestamp: jest.fn(() => new Date("2025-01-01T00:00:00.000Z")),
}));
jest.mock("@/lib/security", () => ({ checkRateLimit: jest.fn(async () => undefined) }));
jest.mock("@/lib/logging", () => ({ logError: jest.fn() }));

describe("finance tax rates API", () => {
  it("creates tax rate and normalizes region/country", async () => {
    const { POST } = await import("@/app/api/finance/tax-rates/create/route");
    const res = await POST(
      jsonRequest("https://app.local/api/finance/tax-rates/create", {
        name: "CA Sales Tax",
        type: "sales_tax",
        rate: 8.5,
        country: "us",
        region: "ca",
        isActive: true,
        isDefault: false,
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);

    const created = await db.collection("tax_rates").doc(body.taxRateId).get();
    expect(created.data()).toEqual(expect.objectContaining({ country: "US", region: "CA", tenantId: "tenant_a" }));
  });

  it("rejects invalid effective date range", async () => {
    const { POST } = await import("@/app/api/finance/tax-rates/create/route");
    const res = await POST(
      jsonRequest("https://app.local/api/finance/tax-rates/create", {
        name: "Invalid",
        type: "vat",
        rate: 10,
        country: "US",
        effectiveFrom: "2025-12-01",
        effectiveTo: "2025-01-01",
      }),
    );

    expect(res.status).toBe(400);
  });

  it("enforces tenant isolation on update", async () => {
    const { POST } = await import("@/app/api/finance/tax-rates/update/route");
    const res = await POST(
      jsonRequest("https://app.local/api/finance/tax-rates/update", {
        taxRateId: "tax_b",
        rate: 6,
      }),
    );

    expect(res.status).toBe(403);
  });

  it("returns only active country rates for tenant", async () => {
    await db.collection("tax_rates").doc("tax_a_inactive").set({
      tenantId: "tenant_a",
      isActive: false,
      country: "US",
      name: "Inactive",
      rate: 4,
    });

    const { GET } = await import("@/app/api/finance/tax-rates/list/route");
    const res = await GET(jsonRequest("https://app.local/api/finance/tax-rates/list?active=true&country=us"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.taxRates.every((r: any) => r.tenantId === "tenant_a")).toBe(true);
    expect(body.taxRates.every((r: any) => r.country === "US")).toBe(true);
    expect(body.taxRates.every((r: any) => r.isActive)).toBe(true);
  });
});
