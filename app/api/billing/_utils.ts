import { getCurrentUser, isAdminRole } from "../admin/_utils";

export const runtime = "nodejs";

export async function requireBillingAccess() {
  const me = await getCurrentUser();
  if (!me) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  const role = String(me.role || "").toLowerCase();
  if (!(isAdminRole(role) || role === "finance")) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  if (!me.tenantId) {
    return { ok: false as const, status: 400, error: "Tenant context missing" };
  }

  return { ok: true as const, user: me };
}

export function currentPeriodKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
