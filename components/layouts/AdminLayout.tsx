"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Sun, Moon, LogOut, LayoutDashboard, Users, UserPlus, ListTree, Activity } from "lucide-react";
import { useThemeContext } from "@/components/theme/ThemeProvider";
import clsx from "clsx";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, setTheme } = useThemeContext();
  const [collapsed, setCollapsed] = useState(false);

  const navItems = [
    { label: "Overview", path: "/admin", icon: <LayoutDashboard size={18} /> },
    { label: "Users", path: "/admin/users", icon: <Users size={18} /> },
    { label: "Create User", path: "/admin/users/create", icon: <UserPlus size={18} /> },
    { label: "View Users", path: "/admin/view-users", icon: <ListTree size={18} /> },
    { label: "Activity", path: "/admin/activity", icon: <Activity size={18} /> },
  ];

  return (
    <div className={clsx(
      "flex min-h-screen transition-colors",
      theme === "light"
        ? "bg-white text-gray-900"
        : "bg-[#0d0d10] text-gray-200"
    )}>
      
      {/* SIDEBAR */}
      <aside
        className={clsx(
          "border-r transition-all duration-300 h-screen sticky top-0",
          theme === "light"
            ? "border-gray-200 bg-white"
            : "border-gray-800 bg-[#111113]",
          collapsed ? "w-20" : "w-64"
        )}
      >
        <div className="flex items-center justify-between p-4">
          {!collapsed && (
            <h2 className="text-xl font-bold tracking-tight text-blue-600">
              ADMIN
            </h2>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <Menu size={18} />
          </button>
        </div>

        <nav className="flex flex-col gap-1 px-2">
          {navItems.map((item) => {
            const active = pathname === item.path;

            return (
              <Link
                key={item.path}
                href={item.path}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2 rounded-md transition-all",
                  active
                    ? "bg-blue-600 text-white"
                    : theme === "light"
                      ? "text-gray-700 hover:bg-gray-100"
                      : "text-gray-300 hover:bg-gray-800"
                )}
              >
                {/* ICON ALWAYS VISIBLE */}
                <span>{item.icon}</span>

                {/* LABEL ONLY IN EXPANDED MODE */}
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* MAIN SECTION */}
      <div className="flex-1 flex flex-col">

        {/* HEADER */}
        <header
          className={clsx(
            "h-16 flex items-center justify-between px-6 border-b backdrop-blur-md",
            theme === "light"
              ? "bg-white/70 border-gray-200"
              : "bg-[#111113]/80 border-gray-800"
          )}
        >
          <h1 className="text-lg font-semibold">Admin Dashboard</h1>

          <div className="flex items-center gap-3">
            {/* THEME TOGGLE */}
            <button
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              className="p-2 rounded-md bg-gray-100 dark:bg-gray-800"
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>

            {/* LOGOUT */}
            <button
              onClick={async () => {
                await fetch("/api/logout", { method: "POST", credentials: "include" });
                window.location.href = "/login";
              }}
              className="p-2 rounded-md bg-red-500 text-white hover:bg-red-600"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* MAIN CONTENT */}
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
                }
