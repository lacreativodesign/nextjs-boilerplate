"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Sun, Moon, LogOut } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";
import clsx from "clsx";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  // ✅ ONLY THREE ITEMS NOW
  const navItems = [
    { label: "Overview", path: "/admin" },
    { label: "Users", path: "/admin/users" },
    { label: "Activity", path: "/admin/activity" }
  ];

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-[#0f0f11] text-gray-900 dark:text-gray-100 transition-colors">
      
      {/* SIDEBAR */}
      <aside
        className={clsx(
          "border-r border-gray-200 dark:border-gray-800 h-screen sticky top-0 transition-all duration-300",
          collapsed ? "w-20" : "w-64"
        )}
      >
        <div className="flex items-center justify-between p-4">
          {!collapsed && (
            <h2 className="text-xl font-bold tracking-tight">ADMIN</h2>
          )}
          <button
            className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={() => setCollapsed(!collapsed)}
          >
            <Menu />
          </button>
        </div>

        <nav className="flex flex-col gap-1 px-2">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.path);
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
                {!collapsed && <span>{item.label}</span>}
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
        <header className="h-16 flex items-center justify-between px-6 border-b border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-[#111113]/80 backdrop-blur-sm">
          <h1 className="text-lg font-semibold">Admin Dashboard</h1>

          <div className="flex items-center gap-3">
            {/* THEME TOGGLE */}
            <button
              className="p-2 rounded-md bg-gray-100 dark:bg-gray-800"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon /> : <Sun />}
            </button>

            {/* LOGOUT */}
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
