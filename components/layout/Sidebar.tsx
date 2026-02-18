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
} from "lucide-react";
import { useSidebar } from "@/lib/context/SidebarContext";

const MENU_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/users", label: "Users", icon: Users },
  { href: "/clients", label: "Clients", icon: Briefcase },
  { href: "/sales", label: "Sales & Pipeline", icon: TrendingUp },
  { href: "/projects", label: "Projects & Delivery", icon: FolderKanban },
  { href: "/production", label: "Production", icon: Package },
  { href: "/finance", label: "Finance", icon: DollarSign },
  { href: "/hr", label: "HR & Team", icon: UserCircle },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

type SidebarProps = {
  currentRole: string;
  userName: string;
  userEmail: string;
  tenantName: string;
  tenantLogoUrl: string | null;
  collapsed: boolean;
};

export default function Sidebar({
  tenantName,
  tenantLogoUrl,
  collapsed,
}: SidebarProps) {
  const pathname = usePathname();
  const { isMobileOpen, closeMobile, toggleCollapse } = useSidebar();

  // Mobile overlay
  if (isMobileOpen) {
    return (
      <>
        {/* Overlay backdrop */}
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={closeMobile}
        />

        {/* Full sidebar drawer on mobile */}
        <aside className="fixed left-0 top-0 z-50 h-full w-[260px] border-r border-[var(--border-subtle)] bg-[var(--surface-card)] md:hidden">
          <div className="flex h-full flex-col p-4">
            {/* Header with close button */}
            <div className="mb-6 flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
              <div className="flex items-center gap-3">
                {tenantLogoUrl ? (
                  <img src={tenantLogoUrl} alt={tenantName} className="h-10 w-10 rounded-lg" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--erp-blue)] text-sm font-bold text-white">
                    {tenantName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="text-sm font-bold text-[var(--text-primary)]">{tenantName}</div>
                  <div className="text-xs text-[var(--text-muted)]">ERP Platform</div>
                </div>
              </div>
              <button onClick={closeMobile} className="p-2">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1">
              {MENU_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeMobile}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
                      isActive
                        ? "bg-[var(--erp-blue)] text-white shadow-lg"
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
    );
  }

  // Desktop sidebar (always visible)
  return (
    <aside
      className={`sidebar-transition fixed left-0 top-0 z-30 hidden h-full border-r border-[var(--border-subtle)] bg-[var(--surface-card)] md:block ${
        collapsed ? "w-[var(--sidebar-collapsed-width)]" : "w-[var(--sidebar-width)]"
      }`}
    >
      <div className="flex h-full flex-col p-4">
        {/* Header */}
        <div className="mb-6 border-b border-[var(--border-subtle)] pb-4">
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
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--erp-blue)] text-sm font-bold text-white">
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

        {/* Navigation */}
        <nav className="flex-1 space-y-1">
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href);

            if (collapsed) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={`flex h-12 w-12 items-center justify-center rounded-xl transition-all ${
                    isActive
                      ? "bg-[var(--erp-blue)] text-white shadow-lg"
                      : "text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
                  isActive
                    ? "bg-[var(--erp-blue)] text-white shadow-lg"
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
  );
}
