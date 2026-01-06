export const ROLES = [
  "super_admin",
  "admin",
  "sales_manager",
  "am_manager",
  "production_manager",
  "sales",
  "account_manager",
  "production",
  "finance",
  "hr",
  "client",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_DASHBOARD_ROUTES: Record<Role, string> = {
  super_admin: "/super-admin",
  admin: "/admin",
  sales_manager: "/sales-manager",
  am_manager: "/am-manager",
  production_manager: "/production-manager",
  sales: "/sales",
  account_manager: "/am",
  production: "/production",
  finance: "/finance",
  hr: "/hr",
  client: "/client",
};

export const ROUTE_ROLE_ACCESS: Record<string, Role[]> = {
  "/super-admin": ["super_admin"],
  "/admin": ["admin", "super_admin"],
  "/sales-manager": ["sales_manager", "admin", "super_admin"],
  "/am-manager": ["am_manager", "admin", "super_admin"],
  "/production-manager": ["production_manager", "admin", "super_admin"],
  "/sales": ["sales", "sales_manager", "admin", "super_admin"],
  "/am": ["account_manager"],
  "/production": ["production"],
  "/finance": ["finance", "admin", "super_admin"],
  "/hr": ["hr", "admin", "super_admin"],
  "/client": ["client"],
};

export const PROTECTED_ROUTE_PREFIXES = Object.keys(ROUTE_ROLE_ACCESS).sort(
  (a, b) => b.length - a.length
);

function normalizeRole(role?: string | null) {
  return String(role || "").toLowerCase();
}

export function getDashboardRouteForRole(role?: string | null) {
  const normalized = normalizeRole(role) as Role;
  return ROLE_DASHBOARD_ROUTES[normalized] || "/login";
}

export function getRouteAccessForPath(pathname: string) {
  const match = PROTECTED_ROUTE_PREFIXES.find((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (!match) return null;
  return { prefix: match, roles: ROUTE_ROLE_ACCESS[match] };
}

export function isRoleAllowedForPath(role: string | null | undefined, pathname: string) {
  const access = getRouteAccessForPath(pathname);
  if (!access) return true;
  const normalized = normalizeRole(role);
  return access.roles.includes(normalized as Role);
}
