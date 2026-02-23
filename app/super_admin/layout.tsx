"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";
import { ModuleErrorBoundary } from "@/components/errors/ModuleErrorBoundary";

const TABS = [
  { href: "/super_admin", label: "Overview" },
  { href: "/super_admin/tenants", label: "Tenants" },
  { href: "/super_admin/users", label: "All Users" },
  { href: "/super_admin/system-health", label: "System Health" },
  { href: "/super_admin/audit", label: "Audit Logs" },
  { href: "/super_admin/activity", label: "Activity" },
  { href: "/super_admin/backups", label: "Backups" },
];

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <RequireAuth allowed={["super_admin"]}>
      <ModuleErrorBoundary moduleName="Super Admin">
        <AppShell>
          <div>
            <div className="mb-6">
              <h1 className="page-title">Super Admin</h1>
              <p className="page-subtitle">
                Platform governance, tenant management, and system control.
              </p>
            </div>
            <div className="tabs-bar">
              {TABS.map((tab) => {
                const isActive =
                  pathname === tab.href ||
                  (tab.href !== "/super_admin" && pathname.startsWith(tab.href));
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
            <div className="mt-6">{children}</div>
          </div>
        </AppShell>
      </ModuleErrorBoundary>
    </RequireAuth>
  );
}
