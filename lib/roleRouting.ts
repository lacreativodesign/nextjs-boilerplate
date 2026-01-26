export const ROLE_ROUTES: Record<string, string> = {
  super_admin: "/super_admin",
  admin: "/admin",
  sales_manager: "/sales_manager",
  sales: "/sales",
  am_manager: "/am_manager",
  am: "/am",
  account_manager: "/am",
  production_manager: "/production_manager",
  hr: "/hr",
  finance: "/finance",
  production: "/production",
  client: "/client",
};

export function getRoleRoute(role?: string | null) {
  const normalized = String(role || "")
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/^account_manager$/, "am");
  return ROLE_ROUTES[normalized] || "/login";
}
