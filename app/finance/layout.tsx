"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  LayoutDashboard,
  FileText,
  CreditCard,
  Wallet,
  BarChart3,
  Settings as SettingsIcon,
  Menu,
} from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebaseClient";
import { signOut, type Auth } from "firebase/auth";
import RequireAuth from "@/components/RequireAuth";
import { useTenantContext } from "@/lib/tenant/useTenantContext";
import { canAccessPlanModule } from "@/lib/tenant/plan-access";
import SidebarFooter from "@/components/layouts/SidebarFooter";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [authInstance, setAuthInstance] = useState<Auth | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const { data: tenantContext, loading: tenantLoading, error: tenantError } = useTenantContext();
  const [realPath, setRealPath] = useState(pathname);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setRealPath(window.location.pathname);
    }
  }, [pathname]);

  const normalize = (p: string) => p.replace(/\/+$/, "") || "/";
  const current = normalize(realPath);

  const role = tenantContext?.user?.role || "";
  const planModules = tenantContext?.tenant?.modules || {};
  const notificationsEnabled = canAccessPlanModule({ modules: planModules, moduleKey: "notifications", role });
  const financeEnabled = canAccessPlanModule({ modules: planModules, moduleKey: "finance", role });
  const userName = tenantContext?.user?.displayName || tenantContext?.user?.email || "Finance User";

  useEffect(() => {
    if (tenantLoading) return;
    if (tenantError === "Tenant suspended" || tenantContext?.tenant?.status === "suspended") {
      router.replace("/suspended");
      return;
    }
    if (!financeEnabled) {
      router.replace("/module-disabled");
    }
  }, [tenantLoading, tenantContext, financeEnabled, router]);

  const navItems = [
    { label: "Overview", path: "/finance", icon: LayoutDashboard },
    { label: "Invoices", path: "/finance/invoices", icon: FileText },
    { label: "Payments", path: "/finance/payments", icon: CreditCard },
    { label: "Payroll", path: "/finance/payroll", icon: Wallet },
    { label: "Reports", path: "/finance/reports", icon: BarChart3 },
    { label: "Settings", path: "/finance/settings", icon: SettingsIcon },
  ];

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

  if (authError) {
    return <div style={{ padding: 24 }}>Auth error: {authError}</div>;
  }

  return (
    <RequireAuth allowed={["finance", "admin", "super_admin"]}>
      <div className="flex min-h-screen bg-[var(--main-bg)]">
        <aside className={clsx("admin-sidebar flex flex-col", collapsed && "collapsed")}>
          <div className="flex flex-col flex-1">
            <div className="flex items-center justify-between px-3 py-3">
              {!collapsed && (
                <div className="flex items-center gap-3">
                  {tenantContext?.tenant?.brand?.logoUrl ? (
                    <img
                      src={tenantContext.tenant.brand.logoUrl}
                      alt={tenantContext.tenant.brand.name || "Tenant logo"}
                      className="h-9 w-9 rounded-lg object-contain bg-[var(--surface-muted)] p-1"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-lg bg-[var(--surface-muted)] flex items-center justify-center text-xs font-semibold">
                      {(tenantContext?.tenant?.brand?.name || "ERP").slice(0, 2)}
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-semibold">
                      {tenantContext?.tenant?.brand?.name || "LA CREATIVO"}
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">Finance</div>
                  </div>
                </div>
              )}
              <button
                className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md"
                onClick={() => setCollapsed((prev) => !prev)}
              >
                <Menu size={18} />
              </button>
            </div>

            <nav className="flex flex-1 flex-col gap-1 px-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const itemPath = normalize(item.path);
                const isOverview = itemPath === "/finance";

                const active = isOverview
                  ? current === "/finance"
                  : current === itemPath || current.startsWith(itemPath + "/");

                return (
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
            role="Finance"
            notificationsEnabled={notificationsEnabled}
            onLogout={handleLogout}
          />
        </aside>

        <div className="flex-1 flex flex-col">
          <header className="admin-header h-16 flex items-center justify-between px-6">
            <h1 className="text-lg font-semibold">Finance Dashboard</h1>
          </header>

          <main className="p-6">
            <div className="page-frame">{children}</div>
          </main>
        </div>

      </div>
    </RequireAuth>
  );
}
