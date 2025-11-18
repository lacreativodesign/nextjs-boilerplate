"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, Moon, Menu } from "lucide-react";

export default function ProductionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(false);

  const navItems = [
    { label: "Overview", path: "/production" },
    { label: "Queue", path: "/production/queue" },
    { label: "Projects", path: "/production/projects" },
    { label: "Files", path: "/production/files" },
    { label: "Activity", path: "/production/activity" },
    { label: "Reports", path: "/production/reports" },
    { label: "Settings", path: "/production/settings" },
  ];

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen flex bg-gray-50 dark:bg-gray-900 transition-all">

        {/* SIDEBAR */}
        <aside
          className={`h-screen bg-white dark:bg-gray-800 border-r dark:border-gray-700 shadow-sm transition-all
          ${collapsed ? "w-20" : "w-60"}`}
        >
          <div className="p-5 flex items-center justify-between">
            {!collapsed && (
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
                PRODUCTION
              </h2>
            )}

            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition"
            >
              <Menu size={20} className="text-gray-700 dark:text-gray-200" />
            </button>
          </div>

          {/* NAV */}
          <div className="mt-4 flex flex-col gap-1">
            {navItems.map((item) => {
              const active = pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`flex items-center gap-3 px-4 py-3 text-sm rounded-md transition
                    ${active 
                      ? "bg-gray-900 text-white dark:bg-gray-700" 
                      : "text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                >
                  {/* ICON PLACEHOLDER (you can add real icons later) */}
                  <div className="w-2 h-2 rounded-full bg-gray-400"></div>

                  {!collapsed && item.label}
                </Link>
              );
            })}
          </div>
        </aside>

        {/* MAIN PANEL */}
        <div className="flex-1 flex flex-col">

          {/* TOP NAV */}
          <header className="w-full bg-white dark:bg-gray-800 border-b dark:border-gray-700 p-5 flex justify-between items-center">
            <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
              Production Dashboard
            </h1>

            <div className="flex items-center gap-3">
              {/* THEME SWITCH */}
              <button
                onClick={() => setDark(!dark)}
                className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                {dark ? (
                  <Sun size={20} className="text-yellow-300" />
                ) : (
                  <Moon size={20} className="text-gray-700" />
                )}
              </button>

              {/* LOGOUT */}
              <button
                onClick={async () => {
                  await fetch("/api/logout", { method: "POST", credentials: "include" });
                  window.location.href = "/login";
                }}
                className="px-4 py-2 bg-red-500 text-white rounded-md font-semibold hover:bg-red-600"
              >
                Logout
              </button>
            </div>
          </header>

          {/* CONTENT */}
          <main className="p-8">{children}</main>
        </div>
      </div>
    </div>
  );
                  }
