"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Activity,
  BarChart3,
  Settings,
  Menu,
  Sun,
  Moon,
  LogOut
} from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";
import clsx from "clsx";

// Sidebar items WITH icons (REQUIRED FIX)
const navItems = [
  { label: "Overview", path: "/admin", icon: <LayoutDashboard size={18} /> },
  { label: "Users", path: "/admin/users", icon: <Users size={18} /> },
  { label: "Activity", path: "/admin/activity", icon: <Activity size={18} /> },
  { label: "Reports", path: "/admin/reports", icon: <BarChart3 size={18} /> },
  { label: "Settings", path: "/admin/settings", icon: <Settings size={18} /> },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  const [collapsed, setCollapsed] = useState(false);
  const [realPath, setRealPath] = useState(pathname);

  // Get REAL browser path to fix Overview highlight
  useEffect(() => {
    if (typeof window !== "undefined") {
      setRealPath(window.location.pathname);
    }
  }, [pathname]);

  // Normalize paths
  const normalize = (p: string) => p.replace(/\/+$/, "") || "/";
  const current = normalize(realPath);

  return (
    <div className="admin-shell flex min-h-screen transition-colors">

      {/* SIDEBAR */}
      <aside
        className={clsx(
          "admin-sidebar h-screen sticky top-0 transition-all duration-300",
          collapsed ? "w-20" : "w-64"
        )}
      >
        <div className="flex items-center justify-between p-4">
          {!collapsed && <h2 className="text-xl font-bold tracking-tight">ADMIN</h2>}
          <button
            className="p-2 rounded-md hover:bg-[var(--surface-muted)]"
            onClick={() => setCollapsed(!collapsed)}
          >
            <Menu />
          </button>
        </div>

        <nav className="flex flex-col gap-1 px-2">
          {navItems.map((item) => {
            const itemPath = normalize(item.path);
            const isOverview = itemPath === "/admin";

            const active = isOverview
              ? current === "/admin"
              : current.startsWith(itemPath);

            return (
              <Link
                key={item.path}
                href={item.path}
                className={clsx(
                  "admin-link flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                  active && "active"
                )}
              >
                {/* ICON ALWAYS */}
                <span
                  className={clsx(
                    "flex items-center",
                    active ? "text-white" : "text-gray-500 dark:text-gray-400"
                  )}
                >
                  {item.icon}
                </span>

                {/* LABEL visible only if not collapsed */}
                {!collapsed && <span>{item.label}</span>}

                {/* Collapsed - Only First Letter */}
                {collapsed && (
                  <span className="text-sm font-semibold">{item.label[0]}</span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* MAIN AREA */}
      <div className="flex-1 flex flex-col">

        {/* HEADER */}
        <header className="admin-header h-16 flex items-center justify-between px-6">
          <h1 className="text-lg font-semibold">Admin Dashboard</h1>

          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <button
              className="p-2 rounded-md bg-gray-100 dark:bg-gray-800"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon /> : <Sun />}
            </button>

            {/* Logout */}
            <button
              onClick={async () => {
                await fetch("/api/logout", {
                  method: "POST",
                  credentials: "include",
                });
                window.location.href = "/login";
              }}
              className="p-2 rounded-md bg-red-500 text-white hover:bg-red-600"
            >
              <LogOut />
            </button>
          </div>
        </header>

        {/* MAIN CONTENT */}
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
