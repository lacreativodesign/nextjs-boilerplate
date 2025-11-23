"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const tabs = [
  { label: "All Users", path: "/admin/users" },
  { label: "Create User", path: "/admin/users/create" },
  { label: "View User Details", path: "/admin/users/view" },
  { label: "Activity Log", path: "/admin/users/activity" },
];

export default function UsersLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="w-full">

      {/* TITLE */}
      <div className="mb-4">
        <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>
          User Management
        </h2>
        <p style={{ fontSize: 15, color: "var(--sidebar-text)" }}>
          Manage all users, roles and user activity.
        </p>
      </div>

      {/* BLUE PILL TABS (LOCKED STYLE) */}
      <div
        className="flex gap-2 border-b mb-6"
        style={{ borderColor: "var(--border)" }}
      >
        {tabs.map((t) => {
          const active =
            pathname === t.path || pathname.startsWith(t.path + "/");

          return (
            <Link
              key={t.path}
              href={t.path}
              className={clsx(
                "px-4 py-2 text-sm font-semibold rounded-t-md transition-colors",
                active
                  ? "bg-blue-600 text-white"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* TAB CONTENT */}
      <div>{children}</div>
    </div>
  );
      }
