"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OptimizedImage } from "@/components/OptimizedImage";
import { useCallback, useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  CalendarDays,
  ChevronDown,
  CreditCard,
  DollarSign,
  Factory,
  FileText,
  FolderOpen,
  Handshake,
  Home,
  LayoutDashboard,
  LogOut,
  Settings,
  Shield,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getNavigationForRole, localizeNavigation, type NavItem } from "@/lib/navigation/sidebarConfig";
import { useSidebar } from "@/lib/context/SidebarContext";
import { useI18n } from "@/components/i18n/I18nProvider";

const iconMap: Record<string, LucideIcon> = {
  Shield,
  Building2,
  CreditCard,
  Settings,
  LayoutDashboard,
  Users,
  Briefcase,
  TrendingUp,
  UserPlus,
  Handshake,
  DollarSign,
  FileText,
  UserCheck,
  Factory,
  Home,
  FolderOpen,
  Bell,
  BarChart3,
  CalendarDays,
};

type SidebarProps = {
  currentRole: string;
  userName: string;
  userEmail: string;
  tenantName: string;
  tenantLogoUrl?: string | null;
  collapsed?: boolean;
  onCollapse?: (collapsed: boolean) => void;
};

const badgeStyles: Record<string, string> = {
  info: "bg-blue-500/10 text-blue-600",
  warning: "bg-amber-500/10 text-amber-600",
  success: "bg-emerald-500/10 text-emerald-600",
  danger: "bg-rose-500/10 text-rose-600",
};

const isActivePath = (pathname: string, href: string) => {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
};

export default function Sidebar({ currentRole, userName, userEmail, tenantName, tenantLogoUrl, collapsed, onCollapse }: SidebarProps) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { isCollapsed, isMobileOpen, toggleCollapse, closeMobile } = useSidebar();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const effectiveCollapsed = typeof collapsed === "boolean" ? collapsed : isCollapsed;

  const navigation = useMemo(
    () => localizeNavigation(getNavigationForRole(currentRole), (key, fallback) => t(key, { defaultValue: fallback || key })),
    [currentRole, t],
  );

  const handleToggleSection = useCallback((id: string) => {
    setExpandedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleCollapseToggle = useCallback(() => {
    const next = !effectiveCollapsed;
    onCollapse?.(next);
    toggleCollapse();
  }, [effectiveCollapsed, onCollapse, toggleCollapse]);

  const renderNavItem = (item: NavItem) => {
    const Icon = iconMap[item.icon] || LayoutDashboard;
    const active = isActivePath(pathname, item.href);
    const hasChildren = Boolean(item.children && item.children.length > 0);
    const isExpanded = expandedSections[item.id] ?? active;

    return (
      <div key={item.id} className="w-full">
        <div className="flex items-center">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => handleToggleSection(item.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors ${
                active ? "bg-[var(--sidebar-active)] text-[var(--sidebar-active-text)]" : "text-[var(--sidebar-text)] hover:bg-[var(--surface-muted)]"
              }`}
              aria-expanded={isExpanded}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--surface-muted)] text-[var(--text-primary)]">
                <Icon className="h-5 w-5" />
              </span>
              <span className={`flex-1 truncate transition-all ${effectiveCollapsed ? "md:opacity-0 md:group-hover:opacity-100" : "opacity-100"}`}>{item.label}</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""} ${effectiveCollapsed ? "md:opacity-0 md:group-hover:opacity-100" : "opacity-100"}`} />
            </button>
          ) : (
            <Link
              href={item.href}
              onClick={closeMobile}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                active ? "bg-[var(--sidebar-active)] text-[var(--sidebar-active-text)]" : "text-[var(--sidebar-text)] hover:bg-[var(--surface-muted)]"
              }`}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--surface-muted)] text-[var(--text-primary)]">
                <Icon className="h-5 w-5" />
              </span>
              <span className={`flex-1 truncate transition-all ${effectiveCollapsed ? "md:opacity-0 md:group-hover:opacity-100" : "opacity-100"}`}>{item.label}</span>
              {item.badge && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badgeStyles[item.badge.variant]} ${effectiveCollapsed ? "md:opacity-0 md:group-hover:opacity-100" : "opacity-100"}`}>
                  {item.badge.text}
                </span>
              )}
            </Link>
          )}
        </div>

        {hasChildren && (
          <div className={`ml-12 grid gap-1 overflow-hidden transition-all ${isExpanded && !effectiveCollapsed ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}>
            {item.children?.map((child) => {
              const ChildIcon = iconMap[child.icon] || LayoutDashboard;
              const childActive = isActivePath(pathname, child.href);
              return (
                <Link
                  key={child.id}
                  href={child.href}
                  onClick={closeMobile}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                    childActive ? "bg-[var(--sidebar-active)] text-[var(--sidebar-active-text)]" : "text-[var(--sidebar-text)] hover:bg-[var(--surface-muted)]"
                  }`}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-muted)] text-[var(--text-primary)]">
                    <ChildIcon className="h-4 w-4" />
                  </span>
                  <span className="truncate">{child.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <button type="button" aria-hidden={!isMobileOpen} onClick={closeMobile} className={`fixed inset-0 z-40 bg-[var(--drawer-overlay)] transition-opacity md:hidden ${isMobileOpen ? "opacity-100" : "pointer-events-none opacity-0"}`} />
      <aside
        id="primary-sidebar"
        className={`sidebar sidebar-transition group fixed inset-y-0 z-50 flex w-[var(--sidebar-width)] flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-lg md:left-0 md:shadow-none ${
          isMobileOpen ? "open" : ""
        } ${effectiveCollapsed ? "md:w-[var(--sidebar-collapsed-width)] md:hover:w-[var(--sidebar-width)]" : "md:w-[var(--sidebar-width)]"}`}
        aria-label="Primary"
      >
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-[var(--surface-muted)] text-sm font-bold">
            {tenantLogoUrl ? <OptimizedImage src={tenantLogoUrl} alt={tenantName} width={40} height={40} className="h-10 w-10 p-1" sizes="40px" priority disableManualLazy /> : "BZ"}
          </div>
          <div className={`transition-all ${effectiveCollapsed ? "md:opacity-0 md:group-hover:opacity-100" : "opacity-100"}`}>
            <div className="text-sm font-semibold text-[var(--text-primary)]">{tenantName}</div>
            <div className="text-xs text-[var(--text-muted)]">ERP Platform</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 pb-4">{navigation.map((item) => renderNavItem(item))}</nav>

        <div className="border-t border-[var(--border-subtle)] px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-muted)] text-sm font-semibold">{userName.slice(0, 1).toUpperCase()}</div>
            <div className={`min-w-0 flex-1 ${effectiveCollapsed ? "md:opacity-0 md:group-hover:opacity-100" : "opacity-100"}`}>
              <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{userName}</div>
              <div className="truncate text-xs text-[var(--text-muted)]">{userEmail}</div>
              <div className="text-xs uppercase text-[var(--text-soft)]">{currentRole.replace(/_/g, " ")}</div>
            </div>
            <button type="button" onClick={handleCollapseToggle} className={`hidden h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] md:flex ${effectiveCollapsed ? "md:opacity-100" : ""}`} aria-label="Toggle sidebar collapse">
              <ChevronDown className={`h-4 w-4 transition-transform ${effectiveCollapsed ? "-rotate-90" : "rotate-90"}`} />
            </button>
          </div>

          <button
            type="button"
            onClick={async () => {
              await fetch("/api/logout", { method: "POST", credentials: "include" });
              window.location.href = "/login";
            }}
            className={`mt-3 flex w-full items-center gap-2 rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-sm text-[var(--danger)] ${effectiveCollapsed ? "md:justify-center" : ""}`}
          >
            <LogOut className="h-4 w-4" />
            <span className={`${effectiveCollapsed ? "md:hidden md:group-hover:inline" : "inline"}`}>{t("common.logout")}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
