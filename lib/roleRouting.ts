import { ROLE_DASHBOARD_ROUTE, normalizeRole } from "@/lib/erpAccess";

export const ROLE_ROUTES: Record<string, string> = {
  ...ROLE_DASHBOARD_ROUTE,
  account_manager: "/am",
};

export function getRoleRoute(role?: string | null) {
  const normalized = normalizeRole(role);
  return normalized ? ROLE_DASHBOARD_ROUTE[normalized] : "/login";
}
