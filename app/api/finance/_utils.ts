import { getCurrentUser, isAdminRole } from "../admin/_utils";
import {
  createFinanceEvent,
  parseNumber,
  parseString,
  queueFinanceEmail,
  serverTimestamp,
  toISO,
} from "@/lib/finance/serverUtils";

export const runtime = "nodejs";

export async function requireFinance() {
  const me = await getCurrentUser();
  if (!me) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }
  const role = String(me.role || "").toLowerCase();
  if (!(role === "finance" || isAdminRole(role))) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }
  return { ok: true as const, user: me };
}

export {
  createFinanceEvent,
  parseNumber,
  parseString,
  queueFinanceEmail,
  serverTimestamp,
  toISO,
};
