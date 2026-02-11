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

describe("finance recurring templates API", () => {
  it("creates template with scheduling fields", async () => {
    const { POST } = await import("@/app/api/finance/recurring-invoices/create/route");
    const res = await POST(
      jsonRequest("https://app.local/api/finance/recurring-invoices/create", {
        name: "Weekly Retainer",
        clientId: "client_a",
        status: "active",
        frequency: "weekly",
        interval: 1,
        dayOfWeek: 1,
        startDate: "2025-01-01",
        currency: "USD",
        lineItems: [{ id: "li_1", description: "Service", quantity: 1, unitPrice: 100 }],
        dueDaysAfter: 15,
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    const template = await db.collection("recurring_invoice_templates").doc(body.templateId).get();
    expect(template.data()).toEqual(expect.objectContaining({ tenantId: "tenant_a", frequency: "weekly", dueDaysAfter: 15 }));
  });

  it("filters active templates by tenant", async () => {
    const { GET } = await import("@/app/api/finance/recurring-invoices/list/route");
    const res = await GET(jsonRequest("https://app.local/api/finance/recurring-invoices/list?active=true"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.templates.every((t: any) => t.tenantId === "tenant_a")).toBe(true);
    expect(body.templates.every((t: any) => t.status === "active")).toBe(true);
  });

  it("enforces tenant isolation on status updates", async () => {
    const { POST } = await import("@/app/api/finance/recurring-invoices/set-status/route");
    const res = await POST(
      jsonRequest("https://app.local/api/finance/recurring-invoices/set-status", {
        templateId: "template_b",
        status: "paused",
      }),
    );

    expect(res.status).toBe(403);
  });

  it("deletes only own-tenant template", async () => {
    const { POST } = await import("@/app/api/finance/recurring-invoices/delete/route");
    const res = await POST(
      jsonRequest("https://app.local/api/finance/recurring-invoices/delete", {
        templateId: "template_a",
      }),
    );

    expect(res.status).toBe(200);
    const deleted = await db.collection("recurring_invoice_templates").doc("template_a").get();
    expect(deleted.exists).toBe(false);
  });
});
