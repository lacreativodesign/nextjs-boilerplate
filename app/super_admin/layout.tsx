"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  Activity,
  Building2,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Shield,
  Users,
} from "lucide-react";
import RequireAuth from "@/components/RequireAuth";
import { getFirebaseAuth } from "@/lib/firebaseClient";
import { signOut, type Auth } from "firebase/auth";
import NotificationBell from "@/components/notifications/NotificationBell";

type TenantOption = { id: string; name: string };
const navItems = [
  { label: "Platform Overview", path: "/super_admin", icon: LayoutDashboard },
  { label: "Reports", path: "/super_admin/reports", icon: FileText },
  { label: "Tenants", path: "/super_admin/tenants", icon: Building2 },
  { label: "Users", path: "/super_admin/users", icon: Users },
  { label: "Activity", path: "/super_admin/activity", icon: FileText },
  { label: "System Health", path: "/super_admin/system-health", icon: Activity },
  { label: "Migration", path: "/super_admin/migration", icon: ClipboardCheck },
];

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [authInstance, setAuthInstance] = useState<Auth | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [activeTenantId, setActiveTenantId] = useState<string>("");
  const [activeTenantName, setActiveTenantName] = useState<string>("Platform");

  const normalize = (p: string) => p.replace(/\/+$/, "") || "/";
  const current = normalize(pathname);

  useEffect(() => {
    let active = true;

    getFirebaseAuth()
      .then((instance) => {
        if (active) setAuthInstance(instance);
      })
      .catch((err) => {
        console.error("Failed to initialize Firebase auth", err);
        if (active) setAuthError(err?.message || "Unable to start authentication.");
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

  useEffect(() => {
    let active = true;

    async function loadTenants() {
      try {
        const [tenantsRes, contextRes] = await Promise.all([
          fetch("/api/super-admin/tenants", { cache: "no-store", credentials: "include" }),
          fetch("/api/tenant/context", { cache: "no-store", credentials: "include" }),
        ]);

        const tenantsJson = await tenantsRes.json().catch(() => null);
        const contextJson = await contextRes.json().catch(() => null);

        if (active && tenantsJson?.ok) {
          const options = (tenantsJson.tenants || []).map((tenant: any) => ({
            id: tenant.id,
            name: tenant.name || tenant.slug || tenant.id,
          }));
          setTenants(options);
        }

        if (active && contextJson?.ok && contextJson?.tenant) {
          setActiveTenantId(contextJson.tenant.id || "");
          setActiveTenantName(contextJson.tenant.name || "Platform");
        }
      } catch (err) {
        console.error("Failed to load tenants:", err);
      }
    }

    loadTenants();
    return () => {
      active = false;
    };
  }, []);

  const activeTenantLabel = useMemo(() => {
    const match = tenants.find((t) => t.id === activeTenantId);
    return match?.name || activeTenantName || "Platform";
  }, [tenants, activeTenantId, activeTenantName]);

  const handleTenantSwitch = async (tenantId: string) => {
    setActiveTenantId(tenantId);
    const match = tenants.find((t) => t.id === tenantId);
    setActiveTenantName(match?.name || tenantId);

    try {
      await fetch("/api/super-admin/tenant/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tenantId }),
      });
    } catch (err) {
      console.error("Tenant switch error:", err);
    }
  };

  if (!authInstance) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-[#0f0f11] text-gray-900 dark:text-gray-100">
        <p className="text-sm font-medium">{authError || "Loading platform console…"}</p>
      </div>
    );
  }

  return (
    <RequireAuth allowed={["super_admin"]}>
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
                <div className="h-10 w-10 rounded-lg bg-[var(--surface-muted)] flex items-center justify-center">
                  <Shield size={18} />
                </div>
                <div>
                  <div className="text-sm font-semibold">Bizosto Platform</div>
                  <div className="text-xs text-[var(--text-muted)]">Super Admin</div>
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
              const isOverview = itemPath === "/super_admin";
              const active = isOverview
                ? current === "/super_admin"
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
        </aside>

        <div className="flex-1 flex flex-col">
          <header className="admin-header h-16 flex items-center justify-between px-6">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Active Tenant</div>
              <div className="text-lg font-semibold">{activeTenantLabel}</div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex flex-col text-right">
                <span className="text-xs text-[var(--text-muted)]">Switch tenant</span>
                <select
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-1 text-sm"
                  value={activeTenantId}
                  onChange={(e) => handleTenantSwitch(e.target.value)}
                >
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
                </select>
              </div>

              <NotificationBell />

              <button onClick={handleLogout} className="p-2 rounded-md bg-red-500 text-white hover:bg-red-600">
                <LogOut size={18} />
              </button>
            </div>
          </header>

          <div className="p-6">{children}</div>
        </div>

      </div>
    </RequireAuth>
  );
}
