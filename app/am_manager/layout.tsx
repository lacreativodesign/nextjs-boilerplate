"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { LayoutDashboard, ListChecks, Menu } from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebaseClient";
import { signOut, type Auth } from "firebase/auth";
import RequireAuth from "@/components/RequireAuth";
import { useTenantContext } from "@/lib/tenant/useTenantContext";
import SidebarFooter from "@/components/layouts/SidebarFooter";

const navItems = [
  { label: "Overview", path: "/am_manager", icon: LayoutDashboard },
  { label: "Approvals", path: "/am_manager/approvals", icon: ListChecks, planKey: "approvals" },
];

export default function AmManagerLayout({ children }: { children: React.ReactNode }) {
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
  const current = normalize(realPath);

  const planModules = tenantContext?.tenant?.modules || {};
  const moduleMap = tenantContext?.tenant?.modulesEnabled || {};
  const notificationsEnabled = planModules.notifications !== false;
  const approvalsEnabled = planModules.approvals !== false;
  const userName = tenantContext?.user?.displayName || tenantContext?.user?.email || "AM Manager";

  useEffect(() => {
    if (tenantLoading) return;
    if (tenantError === "Tenant suspended" || tenantContext?.tenant?.status === "suspended") {
      router.replace("/suspended");
      return;
    }
    if (moduleMap.accountManager === false || !approvalsEnabled && current.startsWith("/am_manager/approvals")) {
      router.replace("/module-disabled");
    }
  }, [tenantLoading, tenantContext, moduleMap, router, tenantError, approvalsEnabled, current]);

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

  if (!authInstance) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-[#0f0f11] text-gray-900 dark:text-gray-100">
        <p className="text-sm font-medium">{authError || "Loading account console…"}</p>
      </div>
    );
  }

  return (
    <RequireAuth allowed={["am_manager"]}>
      <div className="flex min-h-screen bg-[var(--main-bg)]">
        <aside className={clsx("admin-sidebar flex flex-col", collapsed && "collapsed")}>
          <div className="flex flex-col flex-1">
            <div className="flex items-center justify-between px-3 py-3">
              {!collapsed && (
                <div>
                  <div className="text-sm font-semibold">{tenantContext?.tenant?.brand?.name || "Bizosto"}</div>
                  <div className="text-xs text-[var(--text-muted)]">AM Manager</div>
                </div>
              )}
              <button className="icon-button" onClick={() => setCollapsed((prev) => !prev)}>
                <Menu size={18} />
              </button>
            </div>
            <nav className="mt-3 flex flex-1 flex-col gap-1 px-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = current === item.path || current.startsWith(`${item.path}/`);
                const disabled = item.planKey === "approvals" && !approvalsEnabled;
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
                    className={clsx("admin-link flex items-center gap-3 px-3 py-2 rounded-md transition-colors", active && "active")}
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
            role="AM Manager"
            notificationsEnabled={notificationsEnabled}
            onLogout={handleLogout}
          />
        </aside>

        <div className="flex-1 flex flex-col">
          <header className="admin-header h-16 flex items-center justify-between px-6">
            <h1 className="text-lg font-semibold">AM Manager</h1>
          </header>

          <main className="p-6">{children}</main>
        </div>
      </div>
    </RequireAuth>
  );
}
