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
import { getDashboardRouteForRole } from "@/lib/auth/roles";

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

export function getRouteForRole(role?: string | null) {
  const normalized = normalizeRole(role || "");
  return getDashboardRouteForRole(normalized) || "/";
}
