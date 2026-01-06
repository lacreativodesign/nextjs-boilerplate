import { getDashboardRouteForRole, ROLE_DASHBOARD_ROUTES } from "@/lib/auth/roles";

export const ROLE_ROUTES: Record<string, string> = ROLE_DASHBOARD_ROUTES;

export function getRoleRoute(role?: string | null) {
  return getDashboardRouteForRole(role);
}
