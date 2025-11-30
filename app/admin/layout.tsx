"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  Sun,
  Moon,
  LogOut
} from "lucide-react";

import { useTheme } from "@/components/theme/ThemeProvider";
import { auth } from "@/lib/firebaseClient";
import { signOut } from "firebase/auth";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  const [realPath, setRealPath] = useState(pathname);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setRealPath(window.location.pathname);
    }
  }, [pathname]);

  const normalize = (p: string) => p.replace(/\/+$/, "") || "/";

  const current = normalize(realPath);

  const navItems = [
    { label: "Overview", path: "/admin", icon: LayoutDashboard },
    { label: "Users", path: "/admin/users", icon: Users },
    { label: "Clients", path: "/admin/clients", icon: Briefcase },
    { label: "Sales & Pipeline", path: "/admin/sales", icon: TrendingUp },
    { label: "Projects & Delivery", path: "/admin/projects", icon: FolderKanban },
    { label: "Production", path: "/admin/production", icon: PackageCheck },
    { label: "Finance", path: "/admin/finance", icon: Wallet },
    { label: "HR & Team", path: "/admin/hr", icon: UserCog },
    { label: "Reports", path: "/admin/reports", icon: BarChart3 },
    { label: "Settings", path: "/admin/settings", icon: SettingsIcon },
  ];

  return (
    <div
      className={clsx(
        "flex min-h-screen transition-colors",
        theme === "dark"
          ? "dark:bg-[#0f0f11] dark:text-gray-100"
          : "bg-gray-50 text-gray-900"
      )}
    >
      {/* SIDEBAR */}
      <aside
        className={clsx(
          "border-r border-gray-200 dark:border-gray-800 h-screen sticky top-0 transition-all duration-300",
          collapsed ? "w-20" : "w-64"
        )}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between p-4">
          {!collapsed && (
            <h2 className="text-xl font-bold tracking-tight">ADMIN</h2>
          )}
          <button
            className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={() => setCollapsed(!collapsed)}
          >
            <Menu size={20} />
          </button>
        </div>

        {/* NAVIGATION */}
        <nav className="flex flex-col gap-1 px-2">
          {navItems.map((item) => {
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
                  "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                  active
                    ? "bg-blue-600 text-white"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
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
        <header className="h-16 flex items-center justify-between px-6 border-b border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-[#111113]/80 backdrop-blur-sm">
          <h1 className="text-lg font-semibold">Admin Dashboard</h1>

          <div className="flex items-center gap-3">
            {/* THEME TOGGLE */}
            <button
              className="p-2 rounded-md bg-gray-100 dark:bg-gray-800"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>

            {/* LOGOUT */}
            <button
              onClick={async () => {
                try {
                  await signOut(auth);
                } catch (err) {
                  console.error("Firebase signOut error:", err);
                }

                await fetch("/api/logout", {
                  method: "POST",
                  credentials: "include",
                });

                window.location.href = "/login";
              }}
              className="p-2 rounded-md bg-red-500 text-white hover:bg-red-600"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
