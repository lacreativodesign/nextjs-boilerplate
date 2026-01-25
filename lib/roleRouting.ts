export const ROLE_ROUTES: Record<string, string> = {
  super_admin: "/super_admin",
  admin: "/admin",
  sales_manager: "/sales_manager",
  sales: "/sales",
  am_manager: "/am_manager",
  am: "/am",
  hr: "/hr",
  finance: "/finance",
  production_manager: "/production_manager",
  production: "/production",
  client: "/client",
};

export function normalizeRole(role?: string | null) {
  const raw = String(role || "").toLowerCase().trim();
  const mapping: Record<string, string> = {
    account_manager: "am",
    "sales-manager": "sales_manager",
    "super-admin": "super_admin",
    "am-manager": "am_manager",
    "production-manager": "production_manager",
  };
  return mapping[raw] || raw;
}

export function getRoleRoute(role?: string | null) {
  const normalized = normalizeRole(role);
  return ROLE_ROUTES[normalized] || "/login";
}
