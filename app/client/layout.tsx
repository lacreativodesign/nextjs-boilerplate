"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";
import { ModuleErrorBoundary } from "@/components/errors/ModuleErrorBoundary";
const TABS = [
  { href: "/client", label: "Dashboard" },
  { href: "/client/projects", label: "My Projects" },
  { href: "/client/files", label: "Files" },
  { href: "/client/change-requests", label: "Change Requests" },
  { href: "/client/profile", label: "Profile" },
];
export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <RequireAuth allowed={["client"]}>
      <ModuleErrorBoundary moduleName="Client Portal">
        <AppShell>
          <div>
            <div className="mb-6">
              <h1 className="page-title">Client Portal</h1>
              <p className="page-subtitle">Your projects, files, and change requests.</p>
            </div>
            <div className="tabs-bar">
              {TABS.map((tab) => {
                const isActive = pathname === tab.href || (tab.href !== "/client" && pathname.startsWith(tab.href));
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
