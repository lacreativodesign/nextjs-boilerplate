"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { ModuleErrorBoundary } from "@/components/errors/ModuleErrorBoundary";

const tabs = [
  { label: "Overview", path: "/admin/sales" },
  { label: "Leads", path: "/admin/sales/leads" },
  { label: "Deals", path: "/admin/sales/deals" },
  { label: "Pipeline", path: "/admin/sales/pipeline" },
  { label: "Follow-Ups", path: "/admin/sales/follow-ups" },
  { label: "Campaigns", path: "/admin/sales/campaigns" },
];

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <ModuleErrorBoundary moduleName="Sales">
      <div className="w-full">
      <div className="mb-4">
        <h2 className="section-title mb-1">Sales & Pipeline</h2>
        <p className="section-subtitle">Track leads, deals, pipeline, and sales activity in one place.</p>
      </div>

      <div className="tabs-bar">
        {tabs.map((t) => {
          const active = pathname === t.path;
          return (
            <Link key={t.path} href={t.path} className={clsx("tab-pill", active && "active")}>
              {t.label}
            </Link>
          );
        })}
      </div>

      <div>{children}</div>
      </div>
    </ModuleErrorBoundary>
  );
}
