"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  FolderKanban,
  Handshake,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  UserPlus,
} from "lucide-react";
import { signOut, type Auth } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebaseClient";
import RequireAuth from "@/components/RequireAuth";
import { useTenantContext } from "@/lib/tenant/useTenantContext";
import NotificationBell from "@/components/notifications/NotificationBell";

const navItems = [
  { label: "Overview", path: "/sales", icon: LayoutDashboard },
  { label: "Leads", path: "/sales/leads", icon: UserPlus },
  { label: "Inbox", path: "/sales/inbox", icon: Mail },
  { label: "Pipeline", path: "/sales/pipeline", icon: FolderKanban },
  { label: "Deals", path: "/sales/deals", icon: Handshake },
  { label: "Follow-Ups", path: "/sales/follow-ups", icon: ListChecks },
  { label: "Campaigns", path: "/sales/campaigns", icon: Megaphone },
];

export default function SalesLayout({ children }: { children: React.ReactNode }) {
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

  const moduleMap = tenantContext?.tenant?.modulesEnabled || {};
  const notificationsEnabled = moduleMap.notifications !== false;

  useEffect(() => {
    if (tenantLoading) return;
    if (tenantError === "Tenant suspended" || tenantContext?.tenant?.status === "suspended") {
      router.replace("/suspended");
      return;
    }
    if (moduleMap.sales === false) {
      router.replace("/module-disabled");
    }
  }, [tenantLoading, tenantContext, moduleMap, router]);

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
        <p className="text-sm font-medium">{authError || "Loading sales console…"}</p>
      </div>
    );
  }

  return (
    <RequireAuth allowed={["sales"]}>
      <div className="admin-shell flex min-h-screen transition-colors">
        <aside
          className={clsx(
            "admin-sidebar h-screen sticky top-0 transition-all duration-300",
            collapsed ? "w-20" : "w-64"
          )}
        >
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
                  <div className="text-xs text-[var(--text-muted)]">Sales Hub</div>
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

          <nav className="flex flex-col gap-1 px-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const itemPath = normalize(item.path);
              const isOverview = itemPath === "/sales";
              const active = isOverview ? current === "/sales" : current === itemPath || current.startsWith(itemPath + "/");

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
        </aside>

        <div className="flex-1 flex flex-col">
          <header className="admin-header h-16 flex items-center justify-between px-6">
            <h1 className="text-lg font-semibold">Sales</h1>

          <div className="flex items-center gap-3">
            <NotificationBell enabled={notificationsEnabled} />

            <button onClick={handleLogout} className="p-2 rounded-md bg-red-500 text-white hover:bg-red-600">
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
