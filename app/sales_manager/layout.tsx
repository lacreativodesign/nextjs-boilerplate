"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  LayoutDashboard,
  UserPlus,
  FolderKanban,
  Handshake,
  Target,
  UsersRound,
  BarChart3,
  Menu,
} from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebaseClient";
import { signOut, type Auth } from "firebase/auth";
import RequireAuth from "@/components/RequireAuth";
import { useTenantContext } from "@/lib/tenant/useTenantContext";
import { canAccessPlanModule, type PlanModuleKey } from "@/lib/tenant/plan-access";
import SidebarFooter from "@/components/layouts/SidebarFooter";

const navItems = [
  { label: "Overview", path: "/sales_manager", icon: LayoutDashboard },
  { label: "Leads", path: "/sales_manager/leads", icon: UserPlus },
  { label: "Pipeline", path: "/sales_manager/pipeline", icon: FolderKanban },
  { label: "Deals", path: "/sales_manager/deals", icon: Handshake },
  { label: "Targets", path: "/sales_manager/targets", icon: Target },
  { label: "Approvals", path: "/sales_manager/approvals", icon: Target, planKey: "approvals" },
  { label: "Team", path: "/sales_manager/team", icon: UsersRound },
  { label: "Reports", path: "/sales_manager/reports", icon: BarChart3, planKey: "reports" },
];

export default function SalesManagerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [authInstance, setAuthInstance] = useState<Auth | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [realPath, setRealPath] = useState(pathname);
  const { data: tenantContext, loading: tenantLoading, error: tenantError } = useTenantContext();

  useEffect(() => {
    if (typeof window !== "undefined") {
      setRealPath(window.location.pathname);
    }
  }, [pathname]);

  const normalize = (p: string) => p.replace(/\/+$/, "") || "/";
  const current = normalize(realPath).replace("/sales_manager", "/sales_manager");

  const role = tenantContext?.user?.role || "";
  const planModules = tenantContext?.tenant?.modules || {};
  const moduleMap = tenantContext?.tenant?.modulesEnabled || {};
  const notificationsEnabled = canAccessPlanModule({ modules: planModules, moduleKey: "notifications", role });
  const userName = tenantContext?.user?.displayName || tenantContext?.user?.email || "Sales Manager";

  const isPlanDisabled = (planKey?: string) =>
    planKey ? !canAccessPlanModule({ modules: planModules, moduleKey: planKey as PlanModuleKey, role }) : false;

  useEffect(() => {
    if (tenantLoading) return;
    if (tenantError === "Tenant suspended" || tenantContext?.tenant?.status === "suspended") {
      router.replace("/suspended");
      return;
    }
    if (moduleMap.salesManager === false || isPlanDisabled(navItems.find((item) => current.startsWith(item.path))?.planKey)) {
      router.replace("/module-disabled");
    }
  }, [tenantLoading, tenantContext, moduleMap, router, planModules, current]);

  const handleLogout = async () => {
    if (!authInstance) return;
    try {
      await signOut(authInstance);
    } catch (err) {
      console.error("Firebase signOut error:", err);
    }

    try {
      await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("API logout error:", err);
    }

    window.location.href = "/login";
  };

  useEffect(() => {
    let active = true;

    getFirebaseAuth()
      .then((instance) => {
        if (active) {
          setAuthInstance(instance);
        }
      })
      .catch((err) => {
        console.error("Failed to initialize Firebase auth", err);
        if (active) {
          setAuthError(err?.message || "Unable to start authentication.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (!authInstance) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-[#0f0f11] text-gray-900 dark:text-gray-100">
        <p className="text-sm font-medium">{authError || "Loading sales manager console…"}</p>
      </div>
    );
  }

  return (
    <RequireAuth allowed={["sales_manager"]}>
      <div className="admin-shell flex min-h-screen transition-colors">
        <aside
          className={clsx(
            "admin-sidebar h-screen sticky top-0 transition-all duration-300 flex flex-col",
            collapsed ? "w-20" : "w-64"
          )}
        >
          <div className="flex flex-col flex-1">
            <div className="flex items-center justify-between p-4">
              {!collapsed && (
                <div className="flex items-center gap-3">
                  {tenantContext?.tenant?.brand?.logoUrl ? (
                    <img
                      src={tenantContext.tenant.brand.logoUrl}
                      alt={tenantContext.tenant.brand.name || "Tenant logo"}
                      className="h-10 w-10 rounded-lg object-contain bg-[var(--surface-muted)] p-1"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-[var(--surface-muted)] flex items-center justify-center text-xs font-semibold">
                      {(tenantContext?.tenant?.brand?.name || "ERP").slice(0, 2)}
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-semibold">
                      {tenantContext?.tenant?.brand?.name || "LA CREATIVO"}
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">Sales Manager</div>
                  </div>
                </div>
              )}
              <button
                className="p-2 rounded-md hover:bg-[var(--surface-muted)]"
                onClick={() => setCollapsed(!collapsed)}
              >
                <Menu size={20} />
              </button>
            </div>

            <nav className="flex flex-1 flex-col gap-1 px-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const itemPath = normalize(item.path);
                const isOverview = itemPath === "/sales_manager";
                const active = isOverview
                  ? current === "/sales_manager"
                  : current === itemPath || current.startsWith(itemPath + "/");
                const disabled = isPlanDisabled(item.planKey);

                return disabled ? (
                  <span
                    key={item.path}
                    title="Upgrade Required"
                    className={clsx(
                      "admin-link flex items-center gap-3 px-3 py-2 rounded-md transition-colors opacity-60 cursor-not-allowed"
                    )}
                  >
                    <Icon size={18} />
                    {!collapsed && <span className="font-medium">{item.label}</span>}
                  </span>
                ) : (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={clsx(
                      "admin-link flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                      active && "active"
                    )}
                  >
                    <Icon size={18} />
                    {!collapsed && <span className="font-medium">{item.label}</span>}
                  </Link>
                );
              })}
            </nav>
          </div>
          <SidebarFooter
            collapsed={collapsed}
            name={userName}
            email={tenantContext?.user?.email}
            role="Sales Manager"
            notificationsEnabled={notificationsEnabled}
            onLogout={handleLogout}
          />
        </aside>

        <div className="flex-1 flex flex-col">
          <header className="admin-header h-16 flex items-center justify-between px-6">
            <h1 className="text-lg font-semibold">Sales Manager</h1>
          </header>

          <main className="p-6">{children}</main>
        </div>

      </div>
    </RequireAuth>
  );
}
