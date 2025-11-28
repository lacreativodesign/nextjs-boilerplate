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
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 text-sm dark:border-neutral-800 dark:bg-neutral-900">
          {tabs.map((t) => {
            const isActive = pathname === t.path;

            return (
              <Link
                key={t.path}
                href={t.path}
                className={clsx(
                  "px-3 py-1.5 rounded-md transition-colors whitespace-nowrap",
                  isActive
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-neutral-800"
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>

      {children}
    </div>
  );
}
