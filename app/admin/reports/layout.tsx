"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const tabs = [
  { label: "Sales Reports", path: "/admin/reports" },
  { label: "Client Reports", path: "/admin/reports/clients" },
  { label: "Project Reports", path: "/admin/reports/projects" },
  { label: "Finance Reports", path: "/admin/reports/finance" },
  { label: "Team Performance", path: "/admin/reports/team" },
];

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="w-full">
      {/* TITLE */}
      <div className="mb-4">
        <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>
          Reports & Analytics
        </h2>
        <p style={{ fontSize: 15, color: "var(--sidebar-text)" }}>
          Company-wide performance insights across all departments.
        </p>
      </div>

      {/* BLUE TABS */}
      <div
        className="flex gap-2 border-b mb-6"
        style={{ borderColor: "var(--border)" }}
      >
        {tabs.map((t) => {
          const active =
            pathname === t.path ||
            pathname.startsWith(t.path + "/");

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
