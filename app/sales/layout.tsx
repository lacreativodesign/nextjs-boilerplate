"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";
import { ModuleErrorBoundary } from "@/components/errors/ModuleErrorBoundary";

const TABS = [
  { href: "/sales", label: "Overview" },
  { href: "/sales/leads", label: "Leads" },
  { href: "/sales/deals", label: "Deals" },
  { href: "/sales/pipeline", label: "Pipeline" },
  { href: "/sales/follow-ups", label: "Follow-ups" },
];

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <RequireAuth allowed={["sales", "sales_manager", "admin", "super_admin"]}>
      <ModuleErrorBoundary moduleName="Sales">
        <AppShell>
          <div>
            <div className="mb-6">
              <h1 className="page-title">Sales & Pipeline</h1>
              <p className="page-subtitle">Track leads, deals, and revenue pipeline.</p>
            </div>
            <div className="tabs-bar">
              {TABS.map((tab) => {
                const isActive = pathname === tab.href || (tab.href !== "/sales" && pathname.startsWith(tab.href));
                return (
                  <Link key={tab.href} href={tab.href} className={`tab-pill ${isActive ? "active" : ""}`}>
                    {tab.label}
                  </Link>
                );
              })}
            </div>
            <div>{children}</div>
          </div>
        </AppShell>
      </ModuleErrorBoundary>
    </RequireAuth>
  );
}
