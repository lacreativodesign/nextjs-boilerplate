"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const tabs = [
  { label: "Overview", path: "/admin/reports" },
  { label: "Revenue & AR", path: "/admin/reports/revenue" },
  { label: "Delivery Performance", path: "/admin/reports/delivery" },
  { label: "Production Analytics", path: "/admin/reports/production" },
  { label: "Client Insights", path: "/admin/reports/clients" },
  { label: "Settings", path: "/admin/reports/settings" },
];

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="w-full">
      <div className="mb-5">
        <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>Reports & Analytics</h2>
        <p style={{ fontSize: 15, color: "var(--sidebar-text)" }}>
          Executive-ready dashboards spanning delivery, production, finance, HR, and client health.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b mb-6" style={{ borderColor: "var(--border)" }}>
        {tabs.map((t) => {
          const isActive = pathname === t.path || (pathname.startsWith(t.path + "/") && t.path !== "/admin/reports");

          return (
            <Link
              key={t.path}
              href={t.path}
              className={clsx(
                "px-4 py-2 text-sm font-semibold rounded-t-md transition-colors",
                isActive
                  ? "text-white"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              )}
              style={{
                background: isActive ? "var(--primary)" : "transparent",
                border: isActive ? "1px solid var(--primary)" : "1px solid transparent",
              }}
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
