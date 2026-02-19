"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export default function UserTabs() {
  const pathname = usePathname();

  const tabs = [
    { label: "All Users", path: "/admin/users" },
    { label: "Create User", path: "/admin/users/create" },
    { label: "Activity Log", path: "/admin/users/activity" },
    { label: "Disabled Users", path: "/admin/users/disabled" },
    { label: "Roles", path: "/admin/users/roles" }
  ];

  return (
    <div className="flex gap-4 border-b border-gray-200 dark:border-gray-800 mb-6">
      {tabs.map((t) => {
        const active = pathname === t.path;
        return (
          <Link
            key={t.path}
            href={t.path}
            className={clsx(
              "pb-3 text-sm font-semibold transition-colors",
              active
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
