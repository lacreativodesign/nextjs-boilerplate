"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";
import { ModuleErrorBoundary } from "@/components/errors/ModuleErrorBoundary";

const TABS = [
  { href: "/settings", label: "General" },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/integrations", label: "Integrations" },
  { href: "/settings/email", label: "Email" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <RequireAuth allowed={["admin", "super_admin"]}>
      <ModuleErrorBoundary moduleName="Settings">
        <AppShell>
          <div>
            <div className="mb-6">
              <h1 className="page-title">Settings</h1>
              <p className="page-subtitle">System configuration and workspace preferences.</p>
            </div>
            <div className="tabs-bar">
              {TABS.map((tab) => {
                const isActive = pathname === tab.href || (tab.href !== "/settings" && pathname.startsWith(tab.href));
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
