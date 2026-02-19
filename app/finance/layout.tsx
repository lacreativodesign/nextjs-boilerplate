"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Overview", path: "/finance" },
  { label: "Invoices", path: "/finance/invoices" },
  { label: "Payments", path: "/finance/payments" },
  { label: "Payroll", path: "/finance/payroll" },
  { label: "Reports", path: "/finance/reports" },
  { label: "Settings", path: "/finance/settings" },
];

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="w-full">
      <div className="mb-4">
        <h2 className="section-title mb-1">Finance</h2>
        <p className="section-subtitle">Monitor revenue, cash flow, payroll, and finance operations.</p>
      </div>

      <div className="tabs-bar">
        {tabs.map((t) => {
          const active = pathname === t.path || (t.path !== "/finance" && pathname.startsWith(t.path));
          return (
            <Link
              key={t.path}
              href={t.path}
              className={`tab-pill ${active ? "active" : ""}`}
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
