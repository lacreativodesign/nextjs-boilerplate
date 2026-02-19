"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
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
  LogOut,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getNavigationForRole, type NavItem } from "@/lib/navigation/sidebarConfig";
import { useSidebar } from "@/lib/context/SidebarContext";

const iconMap: Record<string, LucideIcon> = {
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
};

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
  userName,
  userEmail,
  tenantName,
  tenantLogoUrl,
  collapsed,
}: SidebarProps) {
  const pathname = usePathname();
  const { isMobileOpen, closeMobile, toggleCollapse, openMobile } = useSidebar();
  const navigation = useMemo(() => getNavigationForRole(currentRole), [currentRole]);

  return (
    <>
      {/* Mobile Overlay - Only when menu button clicked */}
      {isMobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={closeMobile}
          />
          <aside className="fixed left-0 top-0 z-50 h-full w-[260px] bg-[var(--surface-card)] border-r border-[var(--border-subtle)] md:hidden flex flex-col">
            {/* Header with close */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
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
              <button onClick={closeMobile} className="p-2">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
              {navigation.map((item) => {
                const Icon = iconMap[item.icon] || LayoutDashboard;
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={closeMobile}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
                      active
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

            {/* Footer */}
            <div className="border-t border-[var(--border-subtle)] p-4">
              <button
                onClick={async () => {
                  await fetch("/api/logout", { method: "POST", credentials: "include" });
                  window.location.href = "/login";
                }}
                className="flex w-full items-center gap-2 rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-sm text-[var(--danger)]"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </button>
            </div>
          </aside>
        </>
      )}

      {/* ALWAYS VISIBLE Sidebar - Collapsed 64px on mobile, full/collapsed on desktop */}
      <aside
        className={`sidebar-transition fixed left-0 top-0 z-30 h-full border-r border-[var(--border-subtle)] bg-[var(--surface-card)] flex flex-col ${
          collapsed
            ? "w-16 md:w-16"
            : "w-16 md:w-[260px]"
        }`}
      >
        {/* Header - Hamburger on mobile, Logo on desktop */}
        <div className="border-b border-[var(--border-subtle)] p-3">
          {/* Mobile: Always hamburger */}
          <div className="md:hidden">
            <button
              onClick={openMobile}
              className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] hover:bg-[var(--surface-card)]"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>

          {/* Desktop: Logo or collapsed button */}
          <div className="hidden md:block">
            {collapsed ? (
              <button
                onClick={toggleCollapse}
                className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] hover:bg-[var(--surface-card)]"
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

        {/* Navigation - Icons only on mobile, icons+labels on desktop (unless collapsed) */}
        <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
          {navigation.map((item) => {
            const Icon = iconMap[item.icon] || LayoutDashboard;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.id}
                href={item.href}
                title={item.label}
                className={`flex items-center gap-3 rounded-xl transition-all ${
                  collapsed
                    ? "h-10 w-10 justify-center"
                    : "h-10 w-10 justify-center md:h-auto md:w-auto md:px-3 md:py-2.5"
                } ${
                  active
                    ? "bg-[var(--erp-blue)] text-white shadow-lg"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
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
      </aside>
    </>
  );
}
