export const ROLE_ROUTES: Record<string, string> = {
  super_admin: "/super_admin",
  admin: "/admin",
  sales_manager: "/sales-manager",
  sales: "/sales",
  account_manager: "/am",
  hr: "/hr",
  finance: "/finance",
  production: "/production",
  client: "/client",
};

export function getRoleRoute(role?: string | null) {
  const normalized = String(role || "").toLowerCase();
  return ROLE_ROUTES[normalized] || "/login";
}
