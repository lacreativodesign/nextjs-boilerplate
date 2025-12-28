"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const tabs = [
  { label: "Overview", path: "/admin/sales" },
  { label: "Leads", path: "/admin/sales/leads" },
  { label: "Pipeline", path: "/admin/sales/pipeline" },
  { label: "Deals", path: "/admin/sales/deals" },
  { label: "Follow-Ups", path: "/admin/sales/follow-ups" },
  { label: "Sources & Campaigns", path: "/admin/sales/campaigns" },
];

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="w-full">
      <div className="mb-4">
        <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>
          Sales & Pipeline
        </h2>
        <p style={{ fontSize: 15, color: "var(--sidebar-text)" }}>
          Manage leads, pipeline stages, deals & follow-ups.
        </p>
      </div>

      <div
        className="flex gap-2 border-b mb-6"
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
                  ? "bg-blue-600 text-white"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              )}
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
