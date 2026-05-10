"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Briefcase, TrendingUp, FolderKanban,
  Package, DollarSign, UserCircle, BarChart3, Settings, CreditCard,
  Shield, X, SlidersHorizontal, HelpCircle,
} from "lucide-react";
import { useSidebar } from "@/lib/context/SidebarContext";
import { useI18n } from "@/components/i18n/I18nProvider";

type SidebarProps = {
  currentRole: string;
  userName: string;
  userEmail: string;
  tenantName: string;
  tenantLogoUrl: string | null;
  collapsed: boolean;
  tenantPlan?: string;
  tenantModules?: Record<string, boolean>;
};

export default function Sidebar({
  currentRole,
  tenantName,
  tenantLogoUrl,
  collapsed,
  tenantModules = {},
}: SidebarProps) {
  const pathname = usePathname();
  const { isMobileOpen, closeMobile, openMobile, toggleCollapse } = useSidebar();
  const { t } = useI18n();

  // module key → which sidebar item it gates (for admin role only)
  // null means always visible regardless of plan
  const ALL_ITEMS = [
    { href: "/dashboard",           label: t("navigation.dashboard"),  icon: LayoutDashboard, roles: ["admin", "super_admin"],                                                                                                                         module: null },
    { href: "/users",               label: t("navigation.users"),       icon: Users,           roles: ["admin", "super_admin", "hr"],                                                                                                                    module: null },
    { href: "/clients",             label: t("navigation.clients"),     icon: Briefcase,       roles: ["admin", "super_admin", "sales", "sales_manager", "am", "am_manager"],                                                                          module: "crm" },
    { href: "/sales",               label: t("navigation.sales"),       icon: TrendingUp,      roles: ["admin", "super_admin", "sales", "sales_manager"],                                                                                               module: "sales" },
    { href: "/projects",            label: t("navigation.projects"),    icon: FolderKanban,    roles: ["admin", "super_admin", "am", "am_manager", "production", "production_manager"],                                                                 module: "projects" },
    { href: "/production",          label: t("navigation.production"),  icon: Package,         roles: ["admin", "super_admin", "production", "production_manager"],                                                                                     module: "production" },
    { href: "/finance",             label: t("navigation.finance"),     icon: DollarSign,      roles: ["admin", "super_admin", "finance"],                                                                                                               module: "finance" },
    { href: "/hr",                  label: t("navigation.hr"),          icon: UserCircle,      roles: ["admin", "super_admin", "hr"],                                                                                                                    module: "hr" },
    { href: "/reports",             label: t("navigation.reports"),     icon: BarChart3,       roles: ["admin", "super_admin", "sales_manager", "am_manager", "production_manager", "finance", "hr"],                                                   module: "reports" },
    { href: "/billing",             label: "Billing",                   icon: CreditCard,      roles: ["admin", "super_admin"],                                                                                                                          module: null },
    { href: "/admin/settings",              label: "Admin Settings",   icon: SlidersHorizontal, roles: ["admin", "super_admin"],                                                                                                                       module: null },
    { href: "/super_admin",         label: t("navigation.superAdmin"),  icon: Shield,          roles: ["super_admin"],                                                                                                                                   module: null },
    { href: "/help",                label: "Help",                      icon: HelpCircle,      roles: ["admin", "super_admin", "sales", "sales_manager", "am", "am_manager", "production", "production_manager", "finance", "hr", "client"],           module: null },
    { href: "/settings",            label: t("common.settings"),        icon: Settings,        roles: ["admin", "super_admin", "sales", "sales_manager", "am", "am_manager", "production", "production_manager", "finance", "hr", "client"],             module: null },
  ];

  const navItems = ALL_ITEMS.filter((item) => {
    // Must match role
    if (!item.roles.includes(currentRole)) return false;

    // Module gating — only applies to admin role (other roles have their own dedicated dashboards)
    // super_admin bypasses all module checks
    // trial plan bypasses module checks (full access during trial)
    if (
      item.module &&
      currentRole === "admin" &&
      Object.keys(tenantModules).length > 0
    ) {
      return tenantModules[item.module] !== false;
    }

    return true;
  });

  const labelsClass = [
    isMobileOpen ? "sidebar-mobile-open" : "",
    !collapsed ? "sidebar-desktop-open" : "",
  ].filter(Boolean).join(" ");

  const LogoIcon = () =>
    tenantLogoUrl ? (
      <img
        src={tenantLogoUrl}
        alt={tenantName}
        className="h-10 w-10 flex-shrink-0 rounded-xl object-cover"
      />
    ) : (
      <div style={{
        width: 40, height: 40, borderRadius: 4,
        background: "linear-gradient(to bottom, #012167 0%, #6692f9 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif",
        fontWeight: 700, fontSize: 26, color: "#ffffff",
        userSelect: "none", flexShrink: 0,
        letterSpacing: "-0.01em",
      }}>
        B
      </div>
    );

  return (
    <>
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-[35] md:hidden"
          style={{
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
          }}
          onClick={closeMobile}
        />
      )}

      <aside
        className={[
          "sidebar-transition",
          "fixed left-0 top-0 z-40 h-full",
          "border-r border-[var(--border-subtle)] bg-[var(--surface-card)]",
          isMobileOpen ? "w-[260px]" : "w-16",
          collapsed
            ? "md:w-[var(--sidebar-collapsed-width)]"
            : "md:w-[var(--sidebar-width)]",
          labelsClass,
        ].join(" ")}
      >
        {/* No horizontal padding on outer — icons must center in 64px */}
        <div className="flex h-full flex-col py-3">

          {/* px-3 on header keeps B icon at 12px left → center = 12+20 = 32px = half of 64px */}
          <div className="mb-4 border-b border-[var(--border-subtle)] pb-3 px-3">
            <div className="flex h-14 items-center">

              {/* B icon is the ONLY toggle — desktop: collapse, mobile: open/close drawer */}
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined" && window.innerWidth >= 768) {
                    toggleCollapse();
                  } else {
                    isMobileOpen ? closeMobile() : openMobile();
                  }
                }}
                className="flex-shrink-0 cursor-pointer focus:outline-none"
                aria-label="Toggle sidebar"
              >
                <LogoIcon />
              </button>

              <div className="sidebar-label ml-3 min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-[var(--text-primary)] leading-tight">
                  {tenantName}
                </div>
                <div className="text-xs text-[var(--text-muted)]">Operating System</div>
              </div>

              {isMobileOpen && (
                <button
                  onClick={closeMobile}
                  className="ml-2 flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--surface-muted)] transition-colors md:hidden"
                  aria-label="Close menu"
                >
                  <X className="h-4 w-4 text-[var(--text-muted)]" />
                </button>
              )}

            </div>
          </div>

          {/* px-4 on links → icon starts at 16px, center = 16+16 = 32px = half of 64px */}
          <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  onClick={isMobileOpen ? closeMobile : undefined}
                  className={[
                    "flex w-full items-center rounded-xl transition-colors px-4 py-2.5",
                    isActive
                      ? "bg-[var(--erp-blue)] text-white shadow-lg shadow-blue-500/20"
                      : "text-[var(--text-primary)] opacity-60 hover:bg-[var(--surface-muted)] hover:opacity-100",
                  ].join(" ")}
                >
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="sidebar-label ml-2 text-sm font-semibold whitespace-nowrap">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>

        </div>
      </aside>
    </>
  );
}
