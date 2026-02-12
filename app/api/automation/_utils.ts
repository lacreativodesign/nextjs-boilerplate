import { normalizeTenantId } from "@/lib/tenant";
import { getCurrentUser, isAdminOrSuper } from "../admin/_utils";

export async function requireAutomationAdmin() {
  const me = await getCurrentUser();
  if (!me) return { ok: false as const, status: 401, error: "Unauthorized" };
  if (!isAdminOrSuper(me.role)) return { ok: false as const, status: 403, error: "Forbidden" };
  return { ok: true as const, user: { ...me, tenantId: normalizeTenantId(me.tenantId) } };
}
