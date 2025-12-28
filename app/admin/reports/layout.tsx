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
        <h2 className="section-title mb-1">Reports & Analytics</h2>
        <p className="section-subtitle">
          Executive-ready dashboards spanning delivery, production, finance, HR, and client health.
        </p>
      </div>

      <div className="tabs-bar">
        {tabs.map((t) => {
          const isActive = pathname === t.path || (pathname.startsWith(t.path + "/") && t.path !== "/admin/reports");

          return (
            <Link
              key={t.path}
              href={t.path}
              className={clsx("tab-pill", isActive && "active")}
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
