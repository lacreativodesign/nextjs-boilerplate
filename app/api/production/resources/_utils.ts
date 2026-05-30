import { getCurrentUser, isAdminOrSuper, isProduction, isProductionManager } from "@/app/api/admin/_utils";

export async function getResourcePlannerUser() {
  const me = await getCurrentUser();
  if (!me?.tenantId) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  if (!isAdminOrSuper(me.role) && !isProduction(me.role) && !isProductionManager(me.role)) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: true as const, user: me };
}

export function asIsoDate(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof (value as Record<string, unknown>)?.toDate === "function") return (value as Record<string, unknown>).toDate().toISOString().slice(0, 10);
  return null;
}
