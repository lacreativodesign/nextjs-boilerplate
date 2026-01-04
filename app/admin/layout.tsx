"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import {
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
  Bell,
} from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebaseClient";
import { signOut, type Auth } from "firebase/auth";
import RequireAuth from "@/components/RequireAuth";
import { useTenantContext } from "@/lib/tenant/useTenantContext";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  type: "info" | "warning" | "success" | "system";
  entityType: string | null;
  entityId: string | null;
  deepLink: string | null;
  isRead: boolean;
  createdAt: string | null;
  priority: string;
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [authInstance, setAuthInstance] = useState<Auth | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
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

  useEffect(() => {
    if (tenantLoading) return;
    if (tenantError === "Tenant suspended" || tenantContext?.tenant?.status === "suspended") {
      router.replace("/suspended");
      return;
    }

    const activeItem = navItems.find((item) => current.startsWith(item.path));
    if (activeItem && moduleMap[activeItem.moduleKey as keyof typeof moduleMap] === false) {
      router.replace("/module-disabled");
    }
  }, [tenantLoading, tenantContext, moduleMap, current, router]);

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
    { label: "Settings", path: "/admin/settings", icon: SettingsIcon, moduleKey: "admin" },
  ];

  const moduleMap = tenantContext?.tenant?.modulesEnabled || {};
  const notificationsEnabled = moduleMap.notifications !== false;
  const filteredNavItems = useMemo(
    () => navItems.filter((item) => moduleMap[item.moduleKey as keyof typeof moduleMap] !== false),
    [moduleMap]
  );

  const formatTimestamp = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) return "Just now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const fetchNotifications = async (mode: "badge" | "full") => {
    if (mode === "full") {
      setNotificationsLoading(true);
    }

    try {
      const res = await fetch(`/api/notifications/list${mode === "badge" ? "?unreadOnly=true" : ""}`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("Notification fetch error:", data?.error || res.statusText);
        return;
      }

      if (Array.isArray(data?.notifications) && mode === "full") {
        setNotifications(data.notifications);
      }

      if (typeof data?.unreadCount === "number") {
        setUnreadCount(data.unreadCount);
      }
    } catch (err) {
      console.error("Notification fetch error:", err);
    } finally {
      if (mode === "full") {
        setNotificationsLoading(false);
      }
    }
  };

  const handleNotificationClick = async (item: NotificationItem) => {
    try {
      await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: item.id }),
      });
    } catch (err) {
      console.error("Notification mark read error:", err);
    }

    setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
    setUnreadCount((prev) => Math.max(prev - (item.isRead ? 0 : 1), 0));
    setDrawerOpen(false);

    if (item.deepLink) {
      router.push(item.deepLink);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await fetch("/api/notifications/mark-all-read", {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("Notification mark all read error:", err);
    } finally {
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    }
  };

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

  useEffect(() => {
    if (!notificationsEnabled) return;
    fetchNotifications("badge");
    const interval = window.setInterval(() => {
      fetchNotifications("badge");
    }, 60000);
    return () => window.clearInterval(interval);
  }, [notificationsEnabled]);

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
          {filteredNavItems.map((item) => {
            const Icon = item.icon;

            const itemPath = normalize(item.path);
            const isOverview = itemPath === "/admin";

            const active = isOverview
              ? current === "/admin"
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

      {/* MAIN SECTION */}
      <div className="flex-1 flex flex-col">
        {/* TOP HEADER */}
        <header className="admin-header h-16 flex items-center justify-between px-6">
          <h1 className="text-lg font-semibold">Admin Dashboard</h1>

          <div className="flex items-center gap-3">
            {notificationsEnabled && (
              <button
                type="button"
                className="notification-bell"
                onClick={() => {
                  const nextOpen = !drawerOpen;
                  setDrawerOpen(nextOpen);
                  if (nextOpen) {
                    fetchNotifications("full");
                  }
                }}
              >
                <Bell size={18} />
                {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
              </button>
            )}

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

      {drawerOpen && (
        <div className="drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="drawer-panel drawer-panel--md notification-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="notification-drawer__header">
              <div>
                <div className="drawer-title">Notifications</div>
                <div className="drawer-subtitle">{unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}</div>
              </div>
              <button className="btn ghost" onClick={handleMarkAllRead} style={{ height: 34, borderRadius: 999 }}>
                Mark all as read
              </button>
            </div>

            <div className="notification-list">
              {notifications.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={clsx("notification-row", !item.isRead && "notification-row--unread")}
                  onClick={() => handleNotificationClick(item)}
                >
                  <div>
                    <div className="notification-row__title">{item.title || "Update"}</div>
                    <div className="notification-row__body">{item.body || "New update available."}</div>
                  </div>
                  <div className="notification-row__time">{formatTimestamp(item.createdAt)}</div>
                </button>
              ))}
              {notificationsLoading && <div className="notification-empty">Loading notifications...</div>}
              {!notificationsLoading && notifications.length === 0 && (
                <div className="notification-empty">You're all caught up. We'll keep watch for updates.</div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </RequireAuth>
  );
}
