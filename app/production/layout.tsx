"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";
import { ModuleErrorBoundary } from "@/components/errors/ModuleErrorBoundary";

const TABS = [
  { href: "/production", label: "Overview" },
  { href: "/production/jobs", label: "Jobs" },
  { href: "/production/workload", label: "Workload" },
  { href: "/production/qa", label: "QA" },
  { href: "/production/files", label: "Files" },
];

export default function ProductionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <RequireAuth allowed={["production", "production_manager", "admin", "super_admin"]}>
      <ModuleErrorBoundary moduleName="Production">
        <AppShell>
          <div>
            <div className="mb-6">
              <h1 className="page-title">Production</h1>
              <p className="page-subtitle">Execution board for production and delivery.</p>
            </div>
            <div className="tabs-bar">
              {TABS.map((tab) => {
                const isActive = pathname === tab.href || (tab.href !== "/production" && pathname.startsWith(tab.href));
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
