"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Briefcase, TrendingUp, FolderKanban,
  Package, DollarSign, UserCircle, BarChart3, Settings, CreditCard,
  Shield, ChevronLeft, ChevronRight, X, FileText, Bell, Search as SearchIcon,
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
};

export default function Sidebar({
  currentRole,
  tenantName,
  tenantLogoUrl,
  collapsed,
}: SidebarProps) {
  const pathname = usePathname();
  const { isMobileOpen, closeMobile, openMobile, toggleCollapse } = useSidebar();
  const { t } = useI18n();

  const ALL_ITEMS = [
    { href: "/dashboard", label: t("navigation.dashboard"), icon: LayoutDashboard, roles: null },
    { href: "/users", label: t("navigation.users"), icon: Users, roles: null },
    { href: "/clients", label: t("navigation.clients"), icon: Briefcase, roles: null },
    { href: "/sales", label: t("navigation.sales"), icon: TrendingUp, roles: null },
    { href: "/projects", label: t("navigation.projects"), icon: FolderKanban, roles: null },
    { href: "/production", label: t("navigation.production"), icon: Package, roles: null },
    { href: "/finance", label: t("navigation.finance"), icon: DollarSign, roles: null },
    { href: "/billing/terminal", label: "Payment Terminal", icon: CreditCard, roles: ["admin", "super_admin"] },
    { href: "/hr", label: t("navigation.hr"), icon: UserCircle, roles: null },
    { href: "/reports", label: t("navigation.reports"), icon: BarChart3, roles: null },
    { href: "/super_admin", label: t("navigation.superAdmin"), icon: Shield, roles: ["super_admin"] },
    { href: "/dashboard/documents", label: "Documents", icon: FileText, roles: ["admin", "super_admin"] },
    { href: "/dashboard/notifications", label: "Notifications", icon: Bell, roles: null },
    { href: "/search", label: "Search", icon: SearchIcon, roles: ["admin", "super_admin"] },
    { href: "/settings", label: t("common.settings"), icon: Settings, roles: null },
  ];

  const navItems = ALL_ITEMS.filter(
    (item) => item.roles === null || item.roles.includes(currentRole)
  );

  const labelsClass = [
    isMobileOpen ? "sidebar-mobile-open" : "",
    !collapsed ? "sidebar-desktop-open" : "",
  ].filter(Boolean).join(" ");

  const initials = tenantName.slice(0, 2).toUpperCase();

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
        <div className="flex h-full flex-col p-2 md:p-3">

          <div className="mb-4 border-b border-[var(--border-subtle)] pb-3">
            <div className="flex h-14 items-center">

              <button
                type="button"
                onClick={() => (isMobileOpen ? closeMobile() : openMobile())}
                className="flex-shrink-0 focus:outline-none md:cursor-default md:pointer-events-none"
                aria-label="Toggle sidebar"
              >
                <LogoIcon />
              </button>

              <div className="sidebar-label ml-3 min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-[var(--text-primary)] leading-tight">
                  {tenantName}
                </div>
                <div className="text-xs text-[var(--text-muted)]">ERP Platform</div>
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

              <button
                onClick={toggleCollapse}
                className="ml-auto flex-shrink-0 hidden md:flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-card)] hover:bg-[var(--surface-hover)] transition-colors shadow-sm"
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {collapsed ? (
                  <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
                ) : (
                  <ChevronLeft className="h-4 w-4 text-[var(--text-muted)]" />
                )}
              </button>

            </div>
          </div>

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
                    "flex items-center rounded-xl transition-colors px-[11px] py-2.5",
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
