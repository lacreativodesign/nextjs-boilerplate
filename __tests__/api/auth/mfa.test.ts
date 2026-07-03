import { FirestoreEmulator, buildTenantSeed } from "../test-utils/firestore-emulator";
import { adminUser } from "../test-utils/auth";
import { jsonRequest } from "../test-utils/request";

const db = new FirestoreEmulator(buildTenantSeed());
const requireAdminOrSuperAdmin = jest.fn(async () => ({ ok: true, user: adminUser({ uid: "admin_a" }) }));
const getUser = jest.fn(async () => ({
  multiFactor: { enrolledFactors: [{ uid: "factor_1" }] },
  tokensValidAfterTime: "2025-01-01T00:00:00.000Z",
}));
const updateUser = jest.fn(async () => undefined);

jest.mock("@/app/api/admin/_utils", () => ({ requireAdminOrSuperAdmin }));
jest.mock("@/lib/firebaseAdmin", () => ({
  adminDb: db,
  adminAuth: {
    getUser,
    updateUser,
  },
}));
jest.mock("@/lib/security", () => ({ checkRateLimit: jest.fn(async () => undefined) }));

describe("auth mfa admin API", () => {
  beforeAll(async () => {
    // The MFA route is tenant-scoped and returns 404 unless the target user doc
    // exists in the caller's tenant. Seed the user the tests operate on.
    await db.collection("users").doc("u1").set({ tenantId: "tenant_a", isDeleted: false });
  });

  it("returns mfa setup status", async () => {
    const route = await import("@/app/api/admin/users/[uid]/mfa/route");
    const res = await route.GET(jsonRequest("https://app.local/api/admin/users/u1/mfa") as any, { params: { uid: "u1" } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.mfaEnabled).toBe(true);
    expect(body.enrolledFactors).toBe(1);
  });

  it("resets MFA and writes user document flags", async () => {
    const route = await import("@/app/api/admin/users/[uid]/mfa/route");
    const res = await route.DELETE(
      jsonRequest("https://app.local/api/admin/users/u1/mfa", undefined, { method: "DELETE" }) as any,
      { params: { uid: "u1" } },
    );

    expect(res.status).toBe(200);
    expect(updateUser).toHaveBeenCalledWith("u1", { multiFactor: { enrolledFactors: [] } });

    const userDoc = await db.collection("users").doc("u1").get();
    expect(userDoc.data()).toEqual(expect.objectContaining({ mfaEnabled: false }));
  });

  it("enforces unauthorized access", async () => {
    requireAdminOrSuperAdmin.mockResolvedValueOnce({ ok: false, error: "Unauthorized", status: 401 } as any);
    const route = await import("@/app/api/admin/users/[uid]/mfa/route");
    const res = await route.GET(jsonRequest("https://app.local/api/admin/users/u1/mfa") as any, { params: { uid: "u1" } });
    expect(res.status).toBe(401);
  });
});
