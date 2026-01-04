import {
  canAccessHr,
  createHrEvent,
  createHrNotification,
  isAdminLike,
  isHrRole,
  requireHrAccess,
  serverTimestamp,
  toIso,
} from "../admin/hr/_utils";
import { normalizeRole } from "../admin/_utils";

export {
  canAccessHr,
  createHrEvent,
  createHrNotification,
  isAdminLike,
  isHrRole,
  normalizeRole,
  requireHrAccess,
  serverTimestamp,
  toIso,
};

const ROLE_ROUTES: Record<string, string> = {
  super_admin: "/admin",
  admin: "/admin",
  sales_manager: "/sales-manager",
  sales: "/sales",
  account_manager: "/am",
  hr: "/hr",
  finance: "/finance",
  production: "/production",
  client: "/client",
};

export function getRouteForRole(role?: string | null) {
  const normalized = normalizeRole(role || "");
  return ROLE_ROUTES[normalized] || "/";
}
