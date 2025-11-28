"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const tabs = [
  { label: "All Users", path: "/admin/users" },
  { label: "Create User", path: "/admin/users/create" },
  { label: "User Roles", path: "/admin/users/roles" },
];

export default function UsersLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="w-full">
      {/* PAGE TITLE */}
      <h2 className="text-[26px] font-bold mb-1">User Management</h2>
      <p className="text-[15px] text-gray-500 dark:text-gray-400 mb-4">
        Manage all users, roles and user activity.
      </p>

      {/* BLUE PILL TABS */}
      <div
        className="flex gap-2 border-b mb-6"
        style={{ borderColor: "var(--border)" }}
      >
        {tabs.map((t) => {
          const active =
            pathname === t.path ||
            (pathname.startsWith(t.path + "/") && t.path !== "/admin/users");

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

      {children}
    </div>
  );
}
