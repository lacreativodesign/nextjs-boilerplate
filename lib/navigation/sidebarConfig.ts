export type NavItem = {
  id: string;
  label: string;
  labelKey?: string;
  href: string;
  icon: string;
  roles: string[];
  module?: string | null;
  children?: NavItem[];
  badge?: { text: string; variant: "info" | "warning" | "success" | "danger" };
};

export const sidebarNavigation: NavItem[] = [
  // ─── Super Admin ───────────────────────────────────────────────────────────
  // super_admin (e.g. admin@bizosto.com) is both the platform operator AND the
  // CEO/admin of the Bizosto office, so they see the FULL operational menu plus
  // a single "Platform" entry for platform management.
  {
    id: "sa-overview",
    label: "Overview",
    labelKey: "navigation.overview",
    href: "/admin",
    icon: "LayoutDashboard",
    roles: ["super_admin"],
    module: null,
  },
  {
    id: "sa-users",
    label: "User Management",
    labelKey: "navigation.users",
    href: "/admin/users",
    icon: "Users",
    roles: ["super_admin"],
    module: null,
  },
  {
    id: "sa-clients",
    label: "Clients",
    labelKey: "navigation.clients",
    href: "/admin/clients",
    icon: "Briefcase",
    roles: ["super_admin"],
    module: null,
  },
  {
    id: "sa-projects",
    label: "Projects",
    labelKey: "navigation.projects",
    href: "/admin/projects",
    icon: "FolderKanban",
    roles: ["super_admin"],
    module: null,
  },
  {
    id: "sa-finance",
    label: "Finance",
    labelKey: "navigation.finance",
    href: "/admin/finance",
    icon: "DollarSign",
    roles: ["super_admin"],
    module: null,
  },
  {
    id: "sa-hr",
    label: "HR & Team",
    labelKey: "navigation.hr",
    href: "/admin/hr",
    icon: "UserCircle",
    roles: ["super_admin"],
    module: null,
  },
  {
    id: "sa-production",
    label: "Production",
    labelKey: "navigation.production",
    href: "/admin/production",
    icon: "Factory",
    roles: ["super_admin"],
    module: null,
  },
  {
    id: "sa-leads",
    label: "Leads",
    labelKey: "navigation.leads",
    href: "/admin/leads",
    icon: "UserPlus",
    roles: ["super_admin"],
    module: null,
  },
  {
    id: "sa-sales",
    label: "Sales",
    labelKey: "navigation.sales",
    href: "/admin/sales",
    icon: "TrendingUp",
    roles: ["super_admin"],
    module: null,
  },
  {
    id: "sa-reports",
    label: "Reports",
    labelKey: "navigation.reports",
    href: "/admin/reports",
    icon: "BarChart3",
    roles: ["super_admin"],
    module: null,
  },
  {
    id: "sa-settings",
    label: "Settings",
    labelKey: "navigation.settings",
    href: "/admin/settings",
    icon: "Settings",
    roles: ["super_admin"],
    module: null,
  },
  {
    id: "sa-help",
    label: "Help",
    labelKey: "navigation.help",
    href: "/help",
    icon: "FileText",
    roles: ["super_admin"],
    module: null,
  },
  {
    id: "sa-platform",
    label: "Platform",
    labelKey: "navigation.platform",
    href: "/super_admin",
    icon: "Shield",
    roles: ["super_admin"],
    module: null,
  },

  // ─── Admin ─────────────────────────────────────────────────────────────────
  {
    id: "admin-dashboard",
    label: "Dashboard",
    labelKey: "navigation.dashboard",
    href: "/dashboard",
    icon: "LayoutDashboard",
    roles: ["admin"],
    module: null,
  },
  {
    id: "admin-users",
    label: "Users",
    labelKey: "navigation.users",
    href: "/users",
    icon: "Users",
    roles: ["admin"],
    module: null,
  },
  {
    id: "admin-clients",
    label: "Clients",
    labelKey: "navigation.clients",
    href: "/clients",
    icon: "Briefcase",
    roles: ["admin"],
    module: "crm",
  },
  {
    id: "admin-reports",
    label: "Reports",
    labelKey: "navigation.reports",
    href: "/reports",
    icon: "BarChart3",
    roles: ["admin"],
    module: "reports",
  },
  {
    id: "admin-billing",
    label: "Billing",
    labelKey: "navigation.billing",
    href: "/billing",
    icon: "CreditCard",
    roles: ["admin"],
    module: null,
  },
  {
    id: "admin-settings",
    label: "Admin Settings",
    labelKey: "navigation.adminSettings",
    href: "/admin/settings",
    icon: "SlidersHorizontal",
    roles: ["admin"],
    module: null,
  },
  // Admin module links — gated by tenant modules
  {
    id: "admin-sales-module",
    label: "Sales",
    labelKey: "navigation.sales",
    href: "/sales",
    icon: "TrendingUp",
    roles: ["admin"],
    module: "sales",
  },
  {
    id: "admin-finance-module",
    label: "Finance",
    labelKey: "navigation.finance",
    href: "/finance",
    icon: "DollarSign",
    roles: ["admin"],
    module: "finance",
  },
  {
    id: "admin-hr-module",
    label: "HR",
    labelKey: "navigation.hr",
    href: "/hr",
    icon: "UserCircle",
    roles: ["admin"],
    module: "hr",
  },
  {
    id: "admin-production-module",
    label: "Production",
    labelKey: "navigation.production",
    href: "/production",
    icon: "Factory",
    roles: ["admin"],
    module: "production",
  },
  {
    id: "admin-projects-module",
    label: "Projects",
    labelKey: "navigation.projects",
    href: "/projects",
    icon: "FolderKanban",
    roles: ["admin"],
    module: "projects",
  },

  // ─── Sales Manager ─────────────────────────────────────────────────────────
  {
    id: "sales-manager-dashboard",
    label: "Dashboard",
    labelKey: "navigation.dashboard",
    href: "/sales_manager",
    icon: "LayoutDashboard",
    roles: ["sales_manager"],
    module: null,
  },
  {
    id: "sales-manager-team",
    label: "My Team",
    labelKey: "navigation.myTeam",
    href: "/sales_manager/team",
    icon: "Users",
    roles: ["sales_manager"],
    module: null,
  },
  {
    id: "sales-manager-sales",
    label: "Sales Overview",
    labelKey: "navigation.salesOverview",
    href: "/sales",
    icon: "TrendingUp",
    roles: ["sales_manager"],
    module: null,
  },
  {
    id: "sales-manager-leads",
    label: "Leads",
    labelKey: "navigation.leads",
    href: "/sales/leads",
    icon: "UserPlus",
    roles: ["sales_manager"],
    module: null,
  },
  {
    id: "sales-manager-deals",
    label: "Deals",
    labelKey: "navigation.deals",
    href: "/sales/deals",
    icon: "Briefcase",
    roles: ["sales_manager"],
    module: null,
  },
  {
    id: "sales-manager-pipeline",
    label: "Pipeline",
    labelKey: "navigation.pipeline",
    href: "/sales/pipeline",
    icon: "TrendingUp",
    roles: ["sales_manager"],
    module: null,
  },
  {
    id: "sales-manager-targets",
    label: "Targets",
    labelKey: "navigation.targets",
    href: "/sales/targets",
    icon: "BarChart3",
    roles: ["sales_manager"],
    module: null,
  },
  {
    id: "sales-manager-reports",
    label: "Reports",
    labelKey: "navigation.reports",
    href: "/reports",
    icon: "BarChart3",
    roles: ["sales_manager"],
    module: null,
  },

  // ─── Sales ─────────────────────────────────────────────────────────────────
  {
    id: "sales-overview",
    label: "Overview",
    labelKey: "navigation.overview",
    href: "/sales",
    icon: "LayoutDashboard",
    roles: ["sales"],
    module: null,
  },
  {
    id: "sales-leads",
    label: "Leads",
    labelKey: "navigation.leads",
    href: "/sales/leads",
    icon: "UserPlus",
    roles: ["sales"],
    module: null,
  },
  {
    id: "sales-deals",
    label: "Deals",
    labelKey: "navigation.deals",
    href: "/sales/deals",
    icon: "Briefcase",
    roles: ["sales"],
    module: null,
  },
  {
    id: "sales-pipeline",
    label: "Pipeline",
    labelKey: "navigation.pipeline",
    href: "/sales/pipeline",
    icon: "TrendingUp",
    roles: ["sales"],
    module: null,
  },
  {
    id: "sales-follow-ups",
    label: "Follow-ups",
    labelKey: "navigation.followUps",
    href: "/sales/follow-ups",
    icon: "CalendarDays",
    roles: ["sales"],
    module: null,
  },
  {
    id: "sales-targets",
    label: "Targets",
    labelKey: "navigation.targets",
    href: "/sales/targets",
    icon: "BarChart3",
    roles: ["sales"],
    module: null,
  },
  {
    id: "sales-clients",
    label: "Clients",
    labelKey: "navigation.clients",
    href: "/clients",
    icon: "Briefcase",
    roles: ["sales"],
    module: null,
  },

  // ─── AM Manager ────────────────────────────────────────────────────────────
  {
    id: "am-manager-dashboard",
    label: "Dashboard",
    labelKey: "navigation.dashboard",
    href: "/am_manager",
    icon: "LayoutDashboard",
    roles: ["am_manager"],
    module: null,
  },
  {
    id: "am-manager-team",
    label: "My Team",
    labelKey: "navigation.team",
    href: "/am_manager/team",
    icon: "Users",
    roles: ["am_manager"],
    module: null,
  },
  {
    id: "am-manager-reports",
    label: "Reports",
    labelKey: "navigation.reports",
    href: "/reports",
    icon: "BarChart3",
    roles: ["am_manager"],
    module: null,
  },

  // ─── AM ────────────────────────────────────────────────────────────────────
  {
    id: "am-dashboard",
    label: "Dashboard",
    labelKey: "navigation.dashboard",
    href: "/am",
    icon: "LayoutDashboard",
    roles: ["am"],
    module: null,
  },
  {
    id: "am-clients",
    label: "My Clients",
    labelKey: "navigation.myClients",
    href: "/am/clients",
    icon: "Briefcase",
    roles: ["am"],
    module: null,
  },
  {
    id: "am-projects",
    label: "Projects",
    labelKey: "navigation.projects",
    href: "/am/projects",
    icon: "FolderKanban",
    roles: ["am"],
    module: null,
  },
  {
    id: "am-pipeline",
    label: "Pipeline",
    labelKey: "navigation.pipeline",
    href: "/am/pipeline",
    icon: "TrendingUp",
    roles: ["am"],
    module: null,
  },
  {
    id: "am-change-requests",
    label: "Change Requests",
    labelKey: "navigation.changeRequests",
    href: "/am/change-requests",
    icon: "GitPullRequest",
    roles: ["am"],
    module: null,
  },
  {
    id: "am-files",
    label: "Files",
    labelKey: "navigation.files",
    href: "/am/files",
    icon: "FolderOpen",
    roles: ["am"],
    module: null,
  },

  // ─── Production Manager ────────────────────────────────────────────────────
  {
    id: "production-manager-dashboard",
    label: "Dashboard",
    labelKey: "navigation.dashboard",
    href: "/production_manager",
    icon: "LayoutDashboard",
    roles: ["production_manager"],
    module: null,
  },
  {
    id: "production-manager-team",
    label: "My Team",
    labelKey: "navigation.team",
    href: "/production_manager/team",
    icon: "Users",
    roles: ["production_manager"],
    module: null,
  },
  {
    id: "production-manager-reports",
    label: "Reports",
    labelKey: "navigation.reports",
    href: "/reports",
    icon: "BarChart3",
    roles: ["production_manager"],
    module: null,
  },

  // ─── Production ────────────────────────────────────────────────────────────
  {
    id: "production-overview",
    label: "Overview",
    labelKey: "navigation.overview",
    href: "/production",
    icon: "LayoutDashboard",
    roles: ["production"],
    module: null,
  },
  {
    id: "production-jobs",
    label: "Jobs",
    labelKey: "navigation.jobs",
    href: "/production/jobs",
    icon: "Factory",
    roles: ["production"],
    module: null,
  },
  {
    id: "production-workload",
    label: "Workload",
    labelKey: "navigation.workload",
    href: "/production/workload",
    icon: "SlidersHorizontal",
    roles: ["production"],
    module: null,
  },
  {
    id: "production-qa",
    label: "QA",
    labelKey: "navigation.qa",
    href: "/production/qa",
    icon: "Shield",
    roles: ["production"],
    module: null,
  },
  {
    id: "production-files",
    label: "Files",
    labelKey: "navigation.files",
    href: "/production/files",
    icon: "FolderOpen",
    roles: ["production"],
    module: null,
  },

  // ─── Finance ───────────────────────────────────────────────────────────────
  {
    id: "finance-overview",
    label: "Overview",
    labelKey: "navigation.overview",
    href: "/finance",
    icon: "LayoutDashboard",
    roles: ["finance"],
    module: null,
  },
  {
    id: "finance-invoices",
    label: "Invoices",
    labelKey: "navigation.invoices",
    href: "/finance/invoices",
    icon: "FileText",
    roles: ["finance"],
    module: null,
  },
  {
    id: "finance-payments",
    label: "Payments",
    labelKey: "navigation.payments",
    href: "/finance/payments",
    icon: "CreditCard",
    roles: ["finance"],
    module: null,
  },
  {
    id: "finance-payroll",
    label: "Payroll",
    labelKey: "navigation.payroll",
    href: "/finance/payroll",
    icon: "DollarSign",
    roles: ["finance"],
    module: null,
  },
  {
    id: "finance-reports",
    label: "Reports",
    labelKey: "navigation.reports",
    href: "/finance/reports",
    icon: "BarChart3",
    roles: ["finance"],
    module: null,
  },
  {
    id: "finance-tax",
    label: "Tax",
    labelKey: "navigation.tax",
    href: "/finance/tax",
    icon: "FileText",
    roles: ["finance"],
    module: null,
  },
  {
    id: "finance-settings",
    label: "Settings",
    labelKey: "navigation.settings",
    href: "/finance/settings",
    icon: "Settings",
    roles: ["finance"],
    module: null,
  },

  // ─── HR ────────────────────────────────────────────────────────────────────
  {
    id: "hr-overview",
    label: "Overview",
    labelKey: "navigation.overview",
    href: "/hr",
    icon: "LayoutDashboard",
    roles: ["hr"],
    module: null,
  },
  {
    id: "hr-employees",
    label: "Employees",
    labelKey: "navigation.employees",
    href: "/hr/employees",
    icon: "Users",
    roles: ["hr"],
    module: null,
  },
  {
    id: "hr-attendance",
    label: "Attendance",
    labelKey: "navigation.attendance",
    href: "/hr/attendance",
    icon: "CalendarDays",
    roles: ["hr"],
    module: null,
  },
  {
    id: "hr-leave",
    label: "Leave",
    labelKey: "navigation.leave",
    href: "/hr/leave",
    icon: "CalendarDays",
    roles: ["hr"],
    module: null,
  },
  {
    id: "hr-payroll",
    label: "Payroll",
    labelKey: "navigation.payroll",
    href: "/hr/payroll",
    icon: "DollarSign",
    roles: ["hr"],
    module: null,
  },
  {
    id: "hr-performance",
    label: "Performance",
    labelKey: "navigation.performance",
    href: "/hr/performance",
    icon: "BarChart3",
    roles: ["hr"],
    module: null,
  },

  // ─── Client ────────────────────────────────────────────────────────────────
  {
    id: "client-dashboard",
    label: "Dashboard",
    labelKey: "navigation.dashboard",
    href: "/client",
    icon: "LayoutDashboard",
    roles: ["client"],
    module: null,
  },
  {
    id: "client-projects",
    label: "My Projects",
    labelKey: "navigation.myProjects",
    href: "/client/projects",
    icon: "FolderKanban",
    roles: ["client"],
    module: null,
  },
  {
    id: "client-files",
    label: "Files",
    labelKey: "navigation.files",
    href: "/client/files",
    icon: "FolderOpen",
    roles: ["client"],
    module: null,
  },
  {
    id: "client-change-requests",
    label: "Change Requests",
    labelKey: "navigation.changeRequests",
    href: "/client/change-requests",
    icon: "GitPullRequest",
    roles: ["client"],
    module: null,
  },
  {
    id: "client-billing",
    label: "Billing",
    labelKey: "navigation.billing",
    href: "/client/billing",
    icon: "CreditCard",
    roles: ["client"],
    module: null,
  },
  {
    id: "client-profile",
    label: "Profile",
    labelKey: "navigation.profile",
    href: "/client/profile",
    icon: "UserCircle",
    roles: ["client"],
    module: null,
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

export function localizeNavigation(items: NavItem[], translator: (key: string, fallback?: string) => string): NavItem[] {
  return items.map((item) => ({
    ...item,
    label: item.labelKey ? translator(item.labelKey, item.label) : item.label,
    children: item.children ? localizeNavigation(item.children, translator) : undefined,
  }));
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
