"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";
import { ModuleErrorBoundary } from "@/components/errors/ModuleErrorBoundary";
const TABS = [
  { href: "/users", label: "All Users" },
  { href: "/users/add", label: "Add User" },
  { href: "/users/roles", label: "Roles" },
];
export default function UsersLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <RequireAuth allowed={["admin", "super_admin", "hr"]}>
      <ModuleErrorBoundary moduleName="Users">
        <AppShell>
          <div>
            <div className="mb-6">
              <h1 className="page-title">User Management</h1>
              <p className="page-subtitle">Manage platform users, roles, and permissions.</p>
            </div>
            <div className="tabs-bar">
              {TABS.map((tab) => {
                const isActive = pathname === tab.href || (tab.href !== "/users" && pathname.startsWith(tab.href));
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
