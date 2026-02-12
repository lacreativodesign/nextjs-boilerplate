export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: string;
  roles: string[];
  children?: NavItem[];
  badge?: { text: string; variant: "info" | "warning" | "success" | "danger" };
};

export const sidebarNavigation: NavItem[] = [
  {
    id: "super-admin-dashboard",
    label: "Super Admin",
    href: "/super_admin/dashboard",
    icon: "Shield",
    roles: ["super_admin"],
    children: [
      { id: "sa-tenants", label: "Tenants", href: "/super_admin/tenants", icon: "Building2", roles: ["super_admin"] },
      { id: "sa-plans", label: "Plans", href: "/super_admin/plans", icon: "CreditCard", roles: ["super_admin"] },
      { id: "sa-system", label: "System", href: "/super_admin/system", icon: "Settings", roles: ["super_admin"] },
    ],
  },
  {
    id: "admin",
    label: "Administration",
    href: "/admin/dashboard",
    icon: "Settings",
    roles: ["admin", "super_admin"],
    children: [
      { id: "admin-dashboard", label: "Dashboard", href: "/admin/dashboard", icon: "LayoutDashboard", roles: ["admin", "super_admin"] },
      { id: "admin-users", label: "Users", href: "/admin/users", icon: "Users", roles: ["admin", "super_admin"] },
      { id: "admin-clients", label: "Clients", href: "/admin/clients", icon: "Briefcase", roles: ["admin", "super_admin"] },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    href: "/sales/dashboard",
    icon: "TrendingUp",
    roles: ["sales", "sales_manager", "admin", "super_admin"],
    children: [
      {
        id: "sales-dashboard",
        label: "Dashboard",
        href: "/sales/dashboard",
        icon: "LayoutDashboard",
        roles: ["sales", "sales_manager", "admin", "super_admin"],
      },
      { id: "sales-leads", label: "Leads", href: "/sales/leads", icon: "UserPlus", roles: ["sales", "sales_manager", "admin", "super_admin"] },
      { id: "sales-deals", label: "Deals", href: "/sales/deals", icon: "Handshake", roles: ["sales", "sales_manager", "admin", "super_admin"] },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    href: "/finance/dashboard",
    icon: "DollarSign",
    roles: ["finance", "admin", "super_admin"],
    children: [
      {
        id: "finance-dashboard",
        label: "Dashboard",
        href: "/finance/dashboard",
        icon: "LayoutDashboard",
        roles: ["finance", "admin", "super_admin"],
      },
      { id: "finance-invoices", label: "Invoices", href: "/finance/invoices", icon: "FileText", roles: ["finance", "admin", "super_admin"] },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    href: "/dashboard/reports",
    icon: "BarChart3",
    roles: [
      "admin",
      "super_admin",
      "sales_manager",
      "sales",
      "am_manager",
      "am",
      "production_manager",
      "production",
      "hr",
      "finance",
    ],
  },
  {
    id: "am",
    label: "Account Mgmt",
    href: "/am/dashboard",
    icon: "UserCheck",
    roles: ["am", "am_manager", "admin", "super_admin"],
    children: [
      {
        id: "am-dashboard",
        label: "Dashboard",
        href: "/am/dashboard",
        icon: "LayoutDashboard",
        roles: ["am", "am_manager", "admin", "super_admin"],
      },
    ],
  },
  {
    id: "production",
    label: "Production",
    href: "/production/dashboard",
    icon: "Factory",
    roles: ["production", "production_manager", "admin", "super_admin"],
    children: [
      {
        id: "prod-dashboard",
        label: "Dashboard",
        href: "/production/dashboard",
        icon: "LayoutDashboard",
        roles: ["production", "production_manager", "admin", "super_admin"],
      },
    ],
  },
  {
    id: "hr",
    label: "HR",
    href: "/hr/dashboard",
    icon: "Users",
    roles: ["hr", "admin", "super_admin"],
    children: [
      { id: "hr-dashboard", label: "Dashboard", href: "/hr/dashboard", icon: "LayoutDashboard", roles: ["hr", "admin", "super_admin"] },
      { id: "hr-leave", label: "Leave", href: "/hr/leave", icon: "CalendarDays", roles: ["hr", "admin", "super_admin"] },
    ],
  },
  {
    id: "client-portal",
    label: "My Portal",
    href: "/client/dashboard",
    icon: "Home",
    roles: ["client"],
    children: [
      { id: "client-dashboard", label: "Dashboard", href: "/client/dashboard", icon: "LayoutDashboard", roles: ["client"] },
      { id: "client-invoices", label: "Invoices", href: "/client/invoices", icon: "FileText", roles: ["client"] },
      { id: "client-projects", label: "Projects", href: "/client/projects", icon: "FolderOpen", roles: ["client"] },
    ],
  },
];

const normalizePath = (path: string) => {
  if (!path) return "/";
  const trimmed = path.trim();
  if (trimmed === "/") return "/";
  return trimmed.replace(/\/+$/, "");
};

const isPathMatch = (pathname: string, href: string) => {
  const normalizedPath = normalizePath(pathname);
  const normalizedHref = normalizePath(href);
  if (normalizedHref === "/") return normalizedPath === "/";
  return normalizedPath === normalizedHref || normalizedPath.startsWith(`${normalizedHref}/`);
};

const filterByRole = (items: NavItem[], role: string): NavItem[] => {
  return items
    .filter((item) => item.roles.includes(role))
    .map((item) => {
      if (!item.children) return item;
      const children = filterByRole(item.children, role);
      return { ...item, children };
    });
};

export function getNavigationForRole(role: string): NavItem[] {
  if (!role) return [];
  return filterByRole(sidebarNavigation, role);
}

export function findNavItemByHref(href: string): NavItem | null {
  const normalized = normalizePath(href);
  let match: NavItem | null = null;

  const visit = (items: NavItem[]) => {
    for (const item of items) {
      if (isPathMatch(normalized, item.href)) {
        if (!match || item.href.length > match.href.length) {
          match = item;
        }
      }
      if (item.children) visit(item.children);
    }
  };

  visit(sidebarNavigation);
  return match;
}

export function getBreadcrumbs(pathname: string): { label: string; href: string }[] {
  const normalized = normalizePath(pathname);
  const trail: { label: string; href: string }[] = [];

  const dfs = (items: NavItem[], parents: { label: string; href: string }[]): boolean => {
    for (const item of items) {
      const nextTrail = [...parents, { label: item.label, href: item.href }];
      if (isPathMatch(normalized, item.href)) {
        trail.splice(0, trail.length, ...nextTrail);
        return true;
      }
      if (item.children && dfs(item.children, nextTrail)) {
        return true;
      }
    }
    return false;
  };

  dfs(sidebarNavigation, []);

  if (!trail.length) return [];
  return [{ label: "Home", href: "/" }, ...trail];
}
