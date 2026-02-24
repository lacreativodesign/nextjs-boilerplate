"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Briefcase, TrendingUp, FolderKanban,
  Package, DollarSign, UserCircle, BarChart3, Settings,
  Menu, X, Shield,
} from "lucide-react";
import { useSidebar } from "@/lib/context/SidebarContext";

const ALL_ITEMS = [
  { href: "/dashboard",   label: "Overview",           icon: LayoutDashboard, roles: null            },
  { href: "/users",       label: "Users",              icon: Users,           roles: null            },
  { href: "/clients",     label: "Clients",            icon: Briefcase,       roles: null            },
  { href: "/sales",       label: "Sales & Pipeline",   icon: TrendingUp,      roles: null            },
  { href: "/projects",    label: "Projects & Delivery",icon: FolderKanban,    roles: null            },
  { href: "/production",  label: "Production",         icon: Package,         roles: null            },
  { href: "/finance",     label: "Finance",            icon: DollarSign,      roles: null            },
  { href: "/hr",          label: "HR & Team",          icon: UserCircle,      roles: null            },
  { href: "/reports",     label: "Reports",            icon: BarChart3,       roles: null            },
  { href: "/super_admin", label: "Super Admin",        icon: Shield,          roles: ["super_admin"] },
  { href: "/settings",    label: "Settings",           icon: Settings,        roles: null            },
];

type SidebarProps = {
  currentRole: string;
  userName: string;
  userEmail: string;
  tenantName: string;
  tenantLogoUrl: string | null;
  collapsed: boolean;
};

export default function Sidebar({ currentRole, tenantName, tenantLogoUrl, collapsed }: SidebarProps) {
  const pathname = usePathname();
  const { isMobileOpen, closeMobile, toggleCollapse, openMobile } = useSidebar();

  const navItems = ALL_ITEMS.filter(
    (item) => item.roles === null || item.roles.includes(currentRole)
  );

  const labelsClass = [
    isMobileOpen ? "sidebar-mobile-open"  : "",
    !collapsed   ? "sidebar-desktop-open" : "",
  ].join(" ");

  const LogoBlock = () =>
    tenantLogoUrl ? (
      <img src={tenantLogoUrl} alt={tenantName}
        className="h-10 w-10 flex-shrink-0 rounded-xl object-cover" />
    ) : (
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center
        rounded-xl bg-[var(--erp-blue)] text-white font-bold text-sm shadow-md">
        {tenantName.slice(0, 2).toUpperCase()}
      </div>
    );

  return (
    <>
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-[25] bg-black/50 md:hidden"
          style={{ backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
          onClick={closeMobile}
        />
      )}

      <aside
        className={`sidebar-transition fixed left-0 top-0 z-30 h-full
          border-r border-[var(--border-subtle)] bg-[var(--surface-card)]
          ${isMobileOpen ? "w-[260px]" : "w-16"}
          ${collapsed ? "md:w-[var(--sidebar-collapsed-width)]" : "md:w-[var(--sidebar-width)]"}
          ${labelsClass}`}
      >
        <div className="flex h-full flex-col p-2 md:p-3">

          <div className="mb-4 border-b border-[var(--border-subtle)] pb-4">
            <div className="flex h-12 items-center">
              <LogoBlock />
              <div className="sidebar-label ml-3 min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-[var(--text-primary)] leading-tight">
                  {tenantName}
                </div>
                <div className="text-xs text-[var(--text-muted)]">ERP Platform</div>
              </div>
              {isMobileOpen && (
                <button onClick={closeMobile}
                  className="ml-2 flex-shrink-0 flex h-8 w-8 items-center justify-center
                    rounded-lg hover:bg-[var(--surface-muted)] transition-colors md:hidden"
                  aria-label="Close menu">
                  <X className="h-4 w-4 text-[var(--text-muted)]" />
                </button>
              )}
              {!isMobileOpen && (
                <button onClick={openMobile}
                  className="ml-auto flex-shrink-0 flex h-8 w-8 items-center justify-center
                    rounded-lg hover:bg-[var(--surface-muted)] transition-colors md:hidden"
                  aria-label="Open menu">
                  <Menu className="h-4 w-4 text-[var(--text-muted)]" />
                </button>
              )}
              {!collapsed && (
                <button onClick={toggleCollapse}
                  className="ml-2 flex-shrink-0 flex h-8 w-8 items-center justify-center
                    rounded-lg hover:bg-[var(--surface-muted)] transition-colors hidden md:flex"
                  aria-label="Collapse sidebar">
                  <Menu className="h-4 w-4 text-[var(--text-muted)]" />
                </button>
              )}
              {collapsed && (
                <button onClick={toggleCollapse}
                  className="ml-auto flex-shrink-0 flex h-8 w-8 items-center justify-center
                    rounded-lg hover:bg-[var(--surface-muted)] transition-colors hidden md:flex"
                  aria-label="Expand sidebar">
                  <Menu className="h-4 w-4 text-[var(--text-muted)]" />
                </button>
              )}
            </div>
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  onClick={isMobileOpen ? closeMobile : undefined}
                  className={`flex items-center rounded-xl transition-colors px-[11px] py-2.5
                    ${isActive
                      ? "bg-[var(--erp-blue)] text-white shadow-lg shadow-blue-500/20"
                      : "text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
                    }`}
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
