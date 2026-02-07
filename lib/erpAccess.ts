export const ERP_ROLES = [
  "super_admin",
  "admin",
  "sales_manager",
  "sales",
  "am_manager",
  "am",
  "production_manager",
  "production",
  "finance",
  "hr",
  "client",
] as const;

export type ErpRole = (typeof ERP_ROLES)[number];

export const ROLE_DASHBOARD_ROUTE: Record<ErpRole, string> = {
  super_admin: "/super_admin",
  admin: "/admin",
  sales_manager: "/sales_manager",
  sales: "/sales",
  am_manager: "/am_manager",
  am: "/am",
  production_manager: "/production_manager",
  production: "/production",
  finance: "/finance",
  hr: "/hr",
  client: "/client",
};

export type NavItem = { label: string; href: string };

const ERP_MENU: NavItem[] = [
  { label: "Overview", href: "/admin" },
  { label: "Sales", href: "/sales" },
  { label: "Finance", href: "/finance" },
  { label: "Production", href: "/production" },
  { label: "HR", href: "/hr" },
  { label: "Client Portal", href: "/client" },
  { label: "Platform", href: "/super_admin" },
];

const CLIENT_MENU: NavItem[] = [
  { label: "Overview", href: "/client" },
  { label: "Projects", href: "/client" },
  { label: "Billing", href: "/client" },
  { label: "Profile", href: "/client" },
];

export function normalizeRole(role?: string | null): ErpRole | null {
  const normalized = String(role || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/^account_manager$/, "am");

  return (ERP_ROLES as readonly string[]).includes(normalized) ? (normalized as ErpRole) : null;
}

export function menuForRole(role?: string | null): NavItem[] {
  const normalized = normalizeRole(role);
  if (!normalized) return [];

  if (normalized === "client") return CLIENT_MENU;
  if (normalized === "super_admin") return [{ label: "Platform Overview", href: "/super_admin" }];

  return ERP_MENU.filter((item) => {
    if (item.href === "/super_admin") return false;
    if (normalized === "sales" && item.href === "/finance") return false;
    if (normalized === "production" && item.href === "/finance") return false;
    return true;
  });
}

export function roleFromPath(pathname: string): ErpRole | null {
  const entries = Object.entries(ROLE_DASHBOARD_ROUTE) as Array<[ErpRole, string]>;
  const match = entries.find(([, route]) => pathname === route || pathname.startsWith(`${route}/`));
  return match?.[0] || null;
}

export function rolesAllowedForApi(pathname: string): ErpRole[] | null {
  if (pathname.startsWith("/api/super_admin")) return ["super_admin"];
  if (pathname.startsWith("/api/admin")) return ["admin", "super_admin"];
  if (pathname.startsWith("/api/sales_manager")) return ["sales_manager"];
  if (pathname.startsWith("/api/sales")) return ["sales"];
  if (pathname.startsWith("/api/am_manager")) return ["am_manager"];
  if (pathname.startsWith("/api/am")) return ["am"];
  if (pathname.startsWith("/api/production_manager")) return ["production_manager"];
  if (pathname.startsWith("/api/production")) return ["production"];
  if (pathname.startsWith("/api/finance")) return ["finance"];
  if (pathname.startsWith("/api/hr")) return ["hr"];
  if (pathname.startsWith("/api/client")) return ["client"];
  if (pathname.startsWith("/api/crm")) return ["sales", "sales_manager", "admin"];
  return null;
}
