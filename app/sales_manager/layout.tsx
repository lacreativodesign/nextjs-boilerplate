"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";
import { ModuleErrorBoundary } from "@/components/errors/ModuleErrorBoundary";
const TABS = [
  { href: "/sales_manager", label: "Dashboard" },
  { href: "/sales_manager/leads", label: "Leads" },
  { href: "/sales_manager/deals", label: "Deals" },
  { href: "/sales_manager/pipeline", label: "Pipeline" },
  { href: "/sales_manager/targets", label: "Targets" },
  { href: "/sales_manager/team", label: "Team" },
  { href: "/sales_manager/reports", label: "Reports" },
];
export default function SalesManagerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <RequireAuth allowed={["sales_manager"]}>
      <ModuleErrorBoundary moduleName="Sales Manager">
        <AppShell>
          <div>
            <div className="mb-6">
              <h1 className="page-title">Sales Manager</h1>
              <p className="page-subtitle">Team pipeline, targets, and performance.</p>
            </div>
            <div className="tabs-bar">
              {TABS.map((tab) => {
                const isActive = pathname === tab.href || (tab.href !== "/sales_manager" && pathname.startsWith(tab.href));
                return <Link key={tab.href} href={tab.href} className={`tab-pill ${isActive ? "active" : ""}`}>{tab.label}</Link>;
              })}
            </div>
            <div className="mt-6">{children}</div>
          </div>
        </AppShell>
      </ModuleErrorBoundary>
    </RequireAuth>
  );
}
