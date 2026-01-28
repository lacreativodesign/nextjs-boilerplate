import { getCurrentUser } from "../../admin/_utils";
import { hasPermission, Permission } from "../../../lib/permissions";
import { isPlanAccessError, requireModule } from "../../../lib/plan-enforcement";

export const runtime = "nodejs";

export async function requireTenantStripeConnect() {
  const me = await getCurrentUser();
  if (!me) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  const role = String(me.role || "").toLowerCase();
  if (!hasPermission(role, Permission.ManageTenant)) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  try {
    await requireModule(me.tenantId, "client_stripe_connect", { role: me.role });
  } catch (err) {
    if (isPlanAccessError(err)) {
      return { ok: false as const, status: 403, error: "MODULE_DISABLED" };
    }
    return { ok: false as const, status: 500, error: "Unable to validate module access." };
  }

  return { ok: true as const, user: me };
}
