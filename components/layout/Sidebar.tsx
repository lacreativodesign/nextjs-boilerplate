"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Briefcase, TrendingUp, FolderKanban,
  Package, DollarSign, UserCircle, BarChart3, Settings,
  Shield, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useSidebar } from "@/lib/context/SidebarContext";

const ALL_ITEMS = [
  { href: "/dashboard",   label: "Overview",            icon: LayoutDashboard, roles: null            },
  { href: "/users",       label: "Users",               icon: Users,           roles: null            },
  { href: "/clients",     label: "Clients",             icon: Briefcase,       roles: null            },
  { href: "/sales",       label: "Sales & Pipeline",    icon: TrendingUp,      roles: null            },
  { href: "/projects",    label: "Projects & Delivery", icon: FolderKanban,    roles: null            },
  { href: "/production",  label: "Production",          icon: Package,         roles: null            },
  { href: "/finance",     label: "Finance",             icon: DollarSign,      roles: null            },
  { href: "/hr",          label: "HR & Team",           icon: UserCircle,      roles: null            },
  { href: "/reports",     label: "Reports",             icon: BarChart3,       roles: null            },
  { href: "/super_admin", label: "Super Admin",         icon: Shield,          roles: ["super_admin"] },
  { href: "/settings",    label: "Settings",            icon: Settings,        roles: null            },
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
  currentRole,
  collapsed,
}: SidebarProps) {
  const pathname = usePathname();
  const { isMobileOpen, closeMobile, toggleCollapse } = useSidebar();

  const navItems = ALL_ITEMS.filter(
    (item) => item.roles === null || item.roles.includes(currentRole)
  );

  const labelsClass = [
    isMobileOpen ? "sidebar-mobile-open"  : "",
    !collapsed   ? "sidebar-desktop-open" : "",
  ].filter(Boolean).join(" ");

  return (
    <>
      {isMobileOpen && (
        <div
          className="fixed left-0 right-0 bottom-0 top-[56px] z-[25] md:hidden"
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
          "fixed left-0 z-30",
          "top-[56px] h-[calc(100vh-56px)]",
          "border-r border-[var(--border-subtle)] bg-[var(--surface-card)]",
          isMobileOpen ? "w-[260px]" : "w-16",
          collapsed ? "md:w-[var(--sidebar-collapsed-width)]" : "md:w-[var(--sidebar-width)]",
          labelsClass,
        ].join(" ")}
      >
        <div className="flex h-full flex-col py-3 px-2">

          <div className="mb-2 hidden md:flex justify-end pr-1">
            <button
              onClick={toggleCollapse}
              className="flex h-7 w-7 items-center justify-center rounded-lg
                text-[var(--text-muted)] hover:bg-[var(--surface-muted)]
                hover:text-[var(--text-primary)] transition-colors"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed
                ? <ChevronRight className="h-4 w-4" />
                : <ChevronLeft  className="h-4 w-4" />
              }
            </button>
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
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
                      : "text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]",
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
