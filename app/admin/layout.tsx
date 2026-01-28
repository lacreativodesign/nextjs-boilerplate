"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  Activity,
  LayoutDashboard,
  Users,
  Briefcase,
  TrendingUp,
  FolderKanban,
  PackageCheck,
  Wallet,
  UserCog,
  BarChart3,
  Settings as SettingsIcon,
  Menu,
  LogOut,
} from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebaseClient";
import { signOut, type Auth } from "firebase/auth";
import RequireAuth from "@/components/RequireAuth";
import { useTenantContext } from "@/lib/tenant/useTenantContext";
import { canAccessPlanModule, isSuperAdminRole } from "@/lib/tenant/plan-access";
import NotificationBell from "@/components/notifications/NotificationBell";

const navItems = [
  { label: "Overview", path: "/admin", icon: LayoutDashboard, moduleKey: "dashboard" },
  { label: "Users", path: "/admin/users", icon: Users, moduleKey: "users" },
  { label: "Clients", path: "/admin/clients", icon: Briefcase, moduleKey: "clients" },
  { label: "Sales & Pipeline", path: "/admin/sales", icon: TrendingUp, moduleKey: "sales" },
  { label: "Projects & Delivery", path: "/admin/projects", icon: FolderKanban, moduleKey: "accountManager" },
  { label: "Production", path: "/admin/production", icon: PackageCheck, moduleKey: "production" },
  { label: "Finance", path: "/admin/finance", icon: Wallet, moduleKey: "finance" },
  { label: "HR & Team", path: "/admin/hr", icon: UserCog, moduleKey: "humanResource" },
  { label: "Reports", path: "/admin/reports", icon: BarChart3, moduleKey: "dashboard" },
  { label: "Activity", path: "/admin/activity", icon: Activity, moduleKey: "admin" },
  { label: "Settings", path: "/admin/settings", icon: SettingsIcon, moduleKey: "admin" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [authInstance, setAuthInstance] = useState<Auth | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const { data: tenantContext, loading: tenantLoading, error: tenantError } = useTenantContext();

  // Always correct URL (prevents Overview from staying highlighted)
  const [realPath, setRealPath] = useState(pathname);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setRealPath(window.location.pathname);
    }
  }, [pathname]);

  const normalize = (p: string) => p.replace(/\/+$/, "") || "/";

  const current = normalize(realPath);

  const role = tenantContext?.user?.role || "";
  const isSuperAdmin = isSuperAdminRole(role);
  const moduleMap = useMemo(() => tenantContext?.tenant?.modulesEnabled || {}, [tenantContext?.tenant?.modulesEnabled]);
  const planModules = tenantContext?.tenant?.modules || {};
  const notificationsEnabled = canAccessPlanModule({ modules: planModules, moduleKey: "notifications", role });

  const isPlanDisabled = (path: string) => {
    if (path.startsWith("/admin/finance")) {
      return !canAccessPlanModule({ modules: planModules, moduleKey: "finance", role });
    }
    if (path.startsWith("/admin/hr")) {
      return !canAccessPlanModule({ modules: planModules, moduleKey: "hr", role });
    }
    if (path.startsWith("/admin/reports")) {
      return !canAccessPlanModule({ modules: planModules, moduleKey: "reports", role });
    }
    return false;
  };

  useEffect(() => {
    if (tenantLoading) return;
    if (tenantError === "Tenant suspended" || tenantContext?.tenant?.status === "suspended") {
      router.replace("/suspended");
      return;
    }

    const activeItem = navItems.find((item) => current.startsWith(item.path));
    const legacyDisabled =
      !isSuperAdmin && moduleMap[activeItem?.moduleKey as keyof typeof moduleMap] === false;
    if (activeItem && (isPlanDisabled(activeItem.path) || legacyDisabled)) {
      router.replace("/module-disabled");
    }
  }, [tenantLoading, tenantContext, tenantError, moduleMap, current, router, planModules, isSuperAdmin, role]);

  const navEntries = useMemo(
    () =>
      navItems.map((item) => {
        const legacyDisabled = !isSuperAdmin && moduleMap[item.moduleKey as keyof typeof moduleMap] === false;
        const planDisabled = isPlanDisabled(item.path);
        const visible = !legacyDisabled || planDisabled;
        return {
          ...item,
          visible,
          disabled: planDisabled,
        };
      }),
    [moduleMap, planModules]
  );

  const handleLogout = async () => {
    if (!authInstance) return;
    try {
      // 1) Sign out from Firebase (RequireAuth listens to this)
      await signOut(authInstance);
    } catch (err) {
      console.error("Firebase signOut error:", err);
    }

    try {
      // 2) Tell backend to clear the 'session' cookie
      await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("API logout error:", err);
    }

    // 3) Hard redirect to login
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
        <p className="text-sm font-medium">
          {authError || "Loading admin console…"}
        </p>
      </div>
    );
  }

  return (
    <RequireAuth allowed={["admin", "super_admin"]}>
      <div className="admin-shell flex min-h-screen transition-colors">
      {/* SIDEBAR */}
      <aside
        className={clsx(
          "admin-sidebar h-screen sticky top-0 transition-all duration-300",
          collapsed ? "w-20" : "w-64"
        )}
      >
        {/* HEADER */}
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
                <div className="text-xs text-[var(--text-muted)]">Admin Console</div>
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

        {/* NAVIGATION */}
        <nav className="flex flex-col gap-1 px-2">
          {navEntries
            .filter((item) => item.visible)
            .map((item) => {
            const Icon = item.icon;

            const itemPath = normalize(item.path);
            const isOverview = itemPath === "/admin";

            const active = isOverview
              ? current === "/admin"
              : current === itemPath || current.startsWith(itemPath + "/");

            return (
              item.disabled ? (
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
              )
            );
          })}
        </nav>
      </aside>

      {/* MAIN SECTION */}
      <div className="flex-1 flex flex-col">
        {/* TOP HEADER */}
        <header className="admin-header h-16 flex items-center justify-between px-6">
          <h1 className="text-lg font-semibold">Admin Dashboard</h1>

          <div className="flex items-center gap-3">
            <NotificationBell enabled={notificationsEnabled} />

            {/* LOGOUT */}
            <button
              onClick={handleLogout}
              className="p-2 rounded-md bg-red-500 text-white hover:bg-red-600"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="p-6">{children}</main>
      </div>
      </div>
    </RequireAuth>
  );
}
