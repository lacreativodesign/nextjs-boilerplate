"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const tabs = [
  { label: "Overview", path: "/admin/production" },
  { label: "Queue", path: "/admin/production/queue" },
  { label: "QA & Approvals", path: "/admin/production/qa" },
];

export default function ProductionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="w-full">
      <div className="mb-4">
        <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>
          Production
        </h2>
        <p style={{ fontSize: 15, color: "var(--sidebar-text)" }}>
          Monitor production flow, assignments, and QA approvals.
        </p>
      </div>

      <div
        className="flex gap-2 border-b mb-6 flex-wrap"
        style={{ borderColor: "var(--border)" }}
      >
        {tabs.map((t) => {
          const active = pathname === t.path;
          return (
            <Link
              key={t.path}
              href={t.path}
              className={clsx(
                "px-4 py-2 text-sm font-semibold rounded-t-md transition-colors",
                active
                  ? "bg-gray-900 text-white dark:bg-gray-200 dark:text-gray-900"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              )}
              style={{ border: active ? "1px solid var(--border)" : "1px solid transparent" }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <div>{children}</div>
    </div>
  );
}
