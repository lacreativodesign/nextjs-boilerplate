"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";
import { ModuleErrorBoundary } from "@/components/errors/ModuleErrorBoundary";

const TABS = [
  { href: "/finance", label: "Overview" },
  { href: "/finance/invoices", label: "Invoices" },
  { href: "/finance/payments", label: "Payments" },
  { href: "/finance/payroll", label: "Payroll" },
  { href: "/finance/reports", label: "Reports" },
  { href: "/finance/settings", label: "Settings" },
];

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <RequireAuth allowed={["finance", "super_admin"]}>
      <ModuleErrorBoundary moduleName="Finance">
        <AppShell>
          <div>
            <div className="mb-6">
              <h1 className="page-title">Finance</h1>
              <p className="page-subtitle">Monitor revenue, cash flow, payroll, and finance operations.</p>
            </div>

            <div className="tabs-bar">
              {TABS.map((tab) => {
                const isActive = pathname === tab.href || (tab.href !== "/finance" && pathname.startsWith(tab.href));
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`tab-pill ${isActive ? "active" : ""}`}
                  >
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
