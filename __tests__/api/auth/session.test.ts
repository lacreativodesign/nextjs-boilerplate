import { FirestoreEmulator, buildTenantSeed } from "../test-utils/firestore-emulator";
import { adminUser } from "../test-utils/auth";
import { jsonRequest } from "../test-utils/request";

const db = new FirestoreEmulator(buildTenantSeed());
const currentUser = adminUser({ uid: "user_a", tenantId: "tenant_a" });

const cookiesGet = jest.fn((name: string) => (name === "lac_session" ? { value: "session_token" } : undefined));
const getCurrentUser = jest.fn(async () => currentUser);
const getActiveSessions = jest.fn(async () => [{ id: "sess_current" }, { id: "sess_other" }]);
const hashSessionToken = jest.fn(() => "sess_current");
const refreshSession = jest.fn(async () => undefined);
const invalidateSessionById = jest.fn(async () => undefined);
const invalidateAllSessions = jest.fn(async () => undefined);

jest.mock("next/headers", () => ({ cookies: () => ({ get: cookiesGet }) }));
jest.mock("@/app/api/admin/_utils", () => ({ getCurrentUser }));
jest.mock("@/lib/firebaseAdmin", () => ({ adminDb: db }));
jest.mock("@/lib/security", () => ({ checkRateLimit: jest.fn(async () => undefined) }));
jest.mock("@/lib/auth/session", () => ({
  getActiveSessions,
  hashSessionToken,
  refreshSession,
  invalidateSessionById,
  invalidateAllSessions,
}));

describe("auth sessions API", () => {
  it("lists sessions and marks current session", async () => {
    const route = await import("@/app/api/auth/sessions/route");
    const res = await route.GET(jsonRequest("https://app.local/api/auth/sessions") as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "sess_current", current: true }),
        expect.objectContaining({ id: "sess_other", current: false }),
      ]),
    );
  });

  it("refreshes current session token", async () => {
    const route = await import("@/app/api/auth/sessions/route");
    const res = await route.POST(jsonRequest("https://app.local/api/auth/sessions", {}) as any);
    expect(res.status).toBe(200);
    expect(refreshSession).toHaveBeenCalledWith("session_token");
  });

  it("prevents invalidating current session by id", async () => {
    const route = await import("@/app/api/auth/sessions/[id]/route");
    const res = await route.DELETE(jsonRequest("https://app.local/api/auth/sessions/sess_current", undefined, { method: "DELETE" }) as any, {
      params: { id: "sess_current" },
    });

    expect(res.status).toBe(409);
  });

  it("invalidates all sessions excluding current token", async () => {
    const route = await import("@/app/api/auth/sessions/invalidate-all/route");
    const res = await route.POST(jsonRequest("https://app.local/api/auth/sessions/invalidate-all", {}) as any);

    expect(res.status).toBe(200);
    expect(invalidateAllSessions).toHaveBeenCalledWith("user_a", "session_token");
  });

  it("returns unauthorized when current user is missing", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    const route = await import("@/app/api/auth/sessions/route");
    const res = await route.GET(jsonRequest("https://app.local/api/auth/sessions") as any);
    expect(res.status).toBe(401);
  });
});
