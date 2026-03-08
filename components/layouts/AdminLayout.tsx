"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Activity, BarChart3, Settings, Menu, LogOut } from "lucide-react";
import clsx from "clsx";

const navItems = [
  { label: "Overview", path: "/admin", icon: <LayoutDashboard size={18} /> },
  { label: "Users", path: "/admin/users", icon: <Users size={18} /> },
  { label: "Activity", path: "/admin/activity", icon: <Activity size={18} /> },
  { label: "Reports", path: "/admin/reports", icon: <BarChart3 size={18} /> },
  { label: "Settings", path: "/admin/settings", icon: <Settings size={18} /> },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const [collapsed, setCollapsed] = useState(false);
  const [realPath, setRealPath] = useState(pathname);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setRealPath(window.location.pathname);
    }
  }, [pathname]);

  const normalize = (p: string) => p.replace(/\/+$/, "") || "/";
  const current = normalize(realPath);

  return (
    <div className="admin-shell flex min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)] transition-colors">
      <aside
        className={clsx(
          "admin-sidebar sticky top-0 h-screen border-r border-[var(--border-subtle)] bg-[var(--surface-card)] transition-all duration-300",
          collapsed ? "w-20" : "w-64",
        )}
      >
        <div className="flex items-center justify-between p-4">
          {!collapsed && <h2 className="text-xl font-bold tracking-tight">ADMIN</h2>}
          <button className="rounded-md p-2 hover:bg-[var(--surface-muted)]" onClick={() => setCollapsed(!collapsed)}>
            <Menu />
          </button>
        </div>

        <nav className="flex flex-col gap-1 px-2">
          {navItems.map((item) => {
            const itemPath = normalize(item.path);
            const isOverview = itemPath === "/admin";

            const active = isOverview ? current === "/admin" : current.startsWith(itemPath);

            return (
              <Link
                key={item.path}
                href={item.path}
                className={clsx(
                  "admin-link flex items-center gap-3 rounded-md px-3 py-2 transition-colors",
                  active
                    ? "bg-[var(--sidebar-active)] text-[var(--sidebar-active-text)]"
                    : "text-[var(--sidebar-text)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]",
                )}
              >
                <span className="flex items-center">{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
                {collapsed && <span className="text-sm font-semibold">{item.label[0]}</span>}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="admin-header flex h-16 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-6">
          <h1 className="text-lg font-semibold">Admin Dashboard</h1>

          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                await fetch("/api/logout", {
                  method: "POST",
                  credentials: "include",
                });
                window.location.href = "/login";
              }}
              className="rounded-md bg-[var(--danger)] p-2 text-white hover:opacity-90"
            >
              <LogOut />
            </button>
          </div>
        </header>

        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
