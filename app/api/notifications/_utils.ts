import { isPlanAccessError, requireModule } from "../../lib/plan-enforcement";

export async function requireNotificationsModule(tenantId: string) {
  try {
    await requireModule(tenantId, "notifications");
    return { ok: true as const };
  } catch (err) {
    if (isPlanAccessError(err)) {
      return { ok: false as const, status: err.status, error: err.message };
    }
    return { ok: false as const, status: 500, error: "Unable to validate plan access." };
  }
}
