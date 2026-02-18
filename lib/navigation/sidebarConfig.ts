export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: string;
  roles: string[];
  badge?: { text: string; variant: "info" | "warning" | "success" | "danger" };
};

export const sidebarNavigation: NavItem[] = [
  {
    id: "overview",
    label: "Overview",
    href: "/dashboard",
    icon: "LayoutDashboard",
    roles: ["admin", "super_admin", "sales", "sales_manager", "finance", "hr", "production", "production_manager", "am", "am_manager"],
  },
  {
    id: "users",
    label: "Users",
    href: "/users",
    icon: "Users",
    roles: ["admin", "super_admin"],
  },
  {
    id: "clients",
    label: "Clients",
    href: "/clients",
    icon: "Briefcase",
    roles: ["admin", "super_admin", "sales", "sales_manager", "am", "am_manager"],
  },
  {
    id: "sales",
    label: "Sales & Pipeline",
    href: "/sales",
    icon: "TrendingUp",
    roles: ["sales", "sales_manager", "admin", "super_admin"],
  },
  {
    id: "projects",
    label: "Projects & Delivery",
    href: "/projects",
    icon: "FolderKanban",
    roles: ["admin", "super_admin", "am", "am_manager", "production", "production_manager"],
  },
  {
    id: "production",
    label: "Production",
    href: "/production",
    icon: "Package",
    roles: ["production", "production_manager", "admin", "super_admin"],
  },
  {
    id: "finance",
    label: "Finance",
    href: "/finance",
    icon: "DollarSign",
    roles: ["finance", "admin", "super_admin"],
  },
  {
    id: "hr",
    label: "HR & Team",
    href: "/hr",
    icon: "UserCircle",
    roles: ["hr", "admin", "super_admin"],
  },
  {
    id: "reports",
    label: "Reports",
    href: "/reports",
    icon: "BarChart3",
    roles: ["admin", "super_admin", "sales_manager", "sales", "am_manager", "am", "production_manager", "production", "hr", "finance"],
  },
  {
    id: "settings",
    label: "Settings",
    href: "/settings",
    icon: "Settings",
    roles: ["admin", "super_admin"],
  },
];

const filterByRole = (items: NavItem[], role: string): NavItem[] => {
  return items.filter((item) => item.roles.includes(role));
};

export function getNavigationForRole(role: string): NavItem[] {
  if (!role) return [];
  return filterByRole(sidebarNavigation, role);
}
