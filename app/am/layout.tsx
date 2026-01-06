"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  Bell,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  UsersRound,
  ListChecks,
} from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebaseClient";
import { signOut, type Auth } from "firebase/auth";
import RequireAuth from "@/components/RequireAuth";
import { useTenantContext } from "@/lib/tenant/useTenantContext";
import { ROUTE_ROLE_ACCESS } from "@/lib/auth/roles";

const navItems = [
  { label: "Overview", path: "/am", icon: LayoutDashboard },
  { label: "My Projects", path: "/am/projects", icon: ListChecks },
  { label: "Delivery Pipeline", path: "/am/pipeline", icon: FolderKanban },
  { label: "Change Requests", path: "/am/change-requests", icon: FileText },
  { label: "Global Files", path: "/am/files", icon: FileText },
  { label: "Clients", path: "/am/clients", icon: UsersRound },
];

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

export default function AMLayout({ children }: { children: React.ReactNode }) {
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
  const [realPath, setRealPath] = useState(pathname);

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
    if (moduleMap.accountManager === false) {
      router.replace("/module-disabled");
    }
  }, [tenantLoading, tenantContext, moduleMap, router]);

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

    const baseLink = item.deepLink || "";
    const isAmLink = baseLink.startsWith("/am");
    if (isAmLink) {
      router.push(baseLink);
      return;
    }

    const titleBody = `${item.title || ""} ${item.body || ""}`.toLowerCase();
    if (item.entityType === "change_request") {
      router.push("/am/change-requests");
      return;
    }
    if (item.entityType === "client") {
      router.push("/am/clients");
      return;
    }
    if (item.entityType === "project" && titleBody.includes("file")) {
      router.push("/am/files");
      return;
    }
    if (item.entityType === "project") {
      router.push("/am/projects");
      return;
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
        <p className="text-sm font-medium">{authError || "Loading account manager console…"}</p>
      </div>
    );
  }

  return (
    <RequireAuth allowed={ROUTE_ROLE_ACCESS["/am"]}>
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
                  <div className="text-xs text-[var(--text-muted)]">Account Manager</div>
                </div>
              </div>
            )}
            <button className="p-2 rounded-md hover:bg-[var(--surface-muted)]" onClick={() => setCollapsed(!collapsed)}>
              <Menu size={18} />
            </button>
          </div>
          <nav className="flex flex-col gap-1 px-2">
            {navItems.map((item) => {
              const active = current === item.path || (item.path !== "/am" && current.startsWith(item.path));
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={clsx(
                    "sidebar-link flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium",
                    active && "active"
                  )}
                >
                  <span className={clsx("sidebar-link-icon", active && "active")}>
                    <Icon size={18} />
                  </span>
                  {!collapsed && <span className="font-medium">{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="flex-1 flex flex-col">
          <header className="admin-header h-16 flex items-center justify-between px-6">
            <h1 className="text-lg font-semibold">Account Manager Dashboard</h1>
            <div className="flex items-center gap-3">
              {notificationsEnabled && (
                <button
                  className="notification-bell"
                  onClick={() => {
                    setDrawerOpen(true);
                    fetchNotifications("full");
                  }}
                >
                  <Bell size={18} />
                  {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
                </button>
              )}
              <button className="p-2 rounded-md bg-red-500 text-white hover:bg-red-600" onClick={handleLogout}>
                <LogOut size={16} />
              </button>
            </div>
          </header>

          <main className="p-6">{children}</main>
        </div>

        {drawerOpen && (
          <div className="drawer-overlay" onClick={() => setDrawerOpen(false)}>
            <div
              className="drawer-panel drawer-panel--md notification-drawer"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="notification-drawer__header">
                <div>
                  <div className="drawer-title">Notifications</div>
                  <div className="drawer-subtitle">{unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}</div>
                </div>
                <button className="btn ghost" onClick={handleMarkAllRead} style={{ height: 34, borderRadius: 999 }}>
                  Mark all read
                </button>
              </div>
              <div className="notification-list">
                {notifications.map((item) => (
                  <button
                    key={item.id}
                    className={clsx("notification-row", !item.isRead && "notification-row--unread")}
                    onClick={() => handleNotificationClick(item)}
                  >
                    <div className="notification-row__title">{item.title || "Update"}</div>
                    <div className="notification-row__body">{item.body || "New update available."}</div>
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
