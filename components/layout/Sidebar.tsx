"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  TrendingUp,
  FolderKanban,
  Package,
  DollarSign,
  UserCircle,
  BarChart3,
  Settings,
  Menu,
  X,
  Shield,
} from "lucide-react";
import { useSidebar } from "@/lib/context/SidebarContext";

const BASE_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/users", label: "Users", icon: Users },
  { href: "/clients", label: "Clients", icon: Briefcase },
  { href: "/sales", label: "Sales", icon: TrendingUp },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/production", label: "Production", icon: Package },
  { href: "/finance", label: "Finance", icon: DollarSign },
  { href: "/hr", label: "HR & Team", icon: UserCircle },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

const SUPER_ADMIN_ITEM = { href: "/super_admin", label: "Super Admin", icon: Shield };

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
  const { isMobileOpen, closeMobile, toggleCollapse, openMobile } = useSidebar();

  const navItems = currentRole === "super_admin" ? [SUPER_ADMIN_ITEM, ...BASE_ITEMS] : BASE_ITEMS;

  const linkClass = (href: string) => {
    const isActive =
      href === "/dashboard"
        ? pathname === "/dashboard" || pathname.startsWith("/dashboard/")
        : pathname.startsWith(href);
    return `flex items-center gap-3 rounded-xl transition-all ${
      isActive
        ? "bg-[var(--erp-blue)] text-white shadow-lg"
        : "text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
    }`;
  };

  return (
    <>
      {/* Mobile overlay drawer */}
      {isMobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="sidebar-mobile-overlay fixed inset-0 z-40 bg-black/60 md:hidden"
            style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
            onClick={closeMobile}
          />

          {/* Drawer panel — matches icon-sidebar spacing exactly */}
          <aside
            className="sidebar-mobile-panel fixed left-0 top-0 z-50 h-full w-[260px] bg-[var(--surface-card)] border-r border-[var(--border-subtle)] shadow-2xl md:hidden"
          >
            <div className="flex h-full flex-col p-4">

              {/* Header — same as desktop expanded: logo + close */}
              <div className="mb-6 flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
                <div className="flex items-center gap-3">
                  {tenantLogoUrl ? (
                    <img
                      src={tenantLogoUrl}
                      alt={tenantName}
                      className="h-10 w-10 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--erp-blue)] text-white font-bold text-sm shadow-lg">
                      {tenantName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-bold text-[var(--text-primary)] leading-tight">
                      {tenantName}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">ERP Platform</div>
                  </div>
                </div>
                <button
                  onClick={closeMobile}
                  className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--surface-muted)] transition-colors"
                  aria-label="Close menu"
                >
                  <X className="h-4 w-4 text-[var(--text-muted)]" />
                </button>
              </div>

              {/* Nav — same item height & padding as desktop expanded sidebar */}
              <nav className="flex-1 space-y-1 overflow-y-auto">
                {navItems.map((item, index) => {
                  const Icon = item.icon;
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={closeMobile}
                      style={{ animationDelay: `${40 + index * 28}ms` }}
                      className={`nav-item-enter flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
                        isActive
                          ? "bg-[var(--erp-blue)] text-white shadow-lg shadow-blue-500/20"
                          : "text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          </aside>
        </>
      )}

      {/* Always-visible icon sidebar */}
      <aside
        className={`sidebar-transition fixed left-0 top-0 z-30 h-full border-r border-[var(--border-subtle)] bg-[var(--surface-card)] ${
          collapsed ? "w-16 md:w-[var(--sidebar-collapsed-width)]" : "w-16 md:w-[var(--sidebar-width)]"
        }`}
      >
        <div className="flex h-full flex-col p-2 md:p-4">
          {/* Logo / collapse toggle */}
          <div className="mb-6 border-b border-[var(--border-subtle)] pb-4">
            <div className="md:hidden">
              <button
                onClick={openMobile}
                className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] hover:bg-[var(--surface-card)]"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>
            <div className="hidden md:block">
              {collapsed ? (
                <button
                  onClick={toggleCollapse}
                  className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] hover:bg-[var(--surface-card)]"
                >
                  <Menu className="h-5 w-5" />
                </button>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {tenantLogoUrl ? (
                      <img src={tenantLogoUrl} alt={tenantName} className="h-10 w-10 rounded-lg" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--erp-blue)] text-white font-bold text-sm">
                        {tenantName.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-bold text-[var(--text-primary)]">{tenantName}</div>
                      <div className="text-xs text-[var(--text-muted)]">ERP Platform</div>
                    </div>
                  </div>
                  <button
                    onClick={toggleCollapse}
                    className="rounded-lg p-1.5 hover:bg-[var(--surface-muted)]"
                  >
                    <Menu className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={`${linkClass(item.href)} ${
                    collapsed
                      ? "h-12 w-12 justify-center md:h-12 md:w-12"
                      : "h-12 w-12 justify-center md:h-auto md:w-auto md:px-3 md:py-2.5"
                  }`}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span className={`text-sm font-semibold ${collapsed ? "hidden" : "hidden md:inline"}`}>
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
