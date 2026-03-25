"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";
import { ModuleErrorBoundary } from "@/components/errors/ModuleErrorBoundary";
import { useTenantContext } from "@/lib/tenant/useTenantContext";

const TABS_BY_ROLE: Record<string, { href: string; label: string }[]> = {
  super_admin: [
    { href: "/settings", label: "Profile" },
    { href: "/settings/security", label: "Security" },
    { href: "/settings/payments", label: "Payments" },
    { href: "/settings/preferences", label: "Preferences" },
    { href: "/settings/system", label: "System" },
  ],
  admin: [
    { href: "/settings", label: "Profile" },
    { href: "/settings/security", label: "Security" },
    { href: "/settings/payments", label: "Payments" },
    { href: "/settings/preferences", label: "Preferences" },
  ],
  default: [
    { href: "/settings", label: "Profile" },
    { href: "/settings/security", label: "Security" },
    { href: "/settings/preferences", label: "Preferences" },
  ],
};

const ALL_ROLES = [
  "super_admin", "admin", "sales", "sales_manager",
  "am", "am_manager", "production", "production_manager",
  "finance", "hr", "client",
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data } = useTenantContext();
  const role = data?.user?.role || "default";
  const TABS = TABS_BY_ROLE[role] ?? TABS_BY_ROLE.default;

  return (
    <RequireAuth allowed={ALL_ROLES}>
      <ModuleErrorBoundary moduleName="Settings">
        <AppShell>
          <div>
            <div className="mb-6">
              <h1 className="page-title">Settings</h1>
              <p className="page-subtitle">
                Manage your profile, security, and preferences.
              </p>
            </div>
            <div className="tabs-bar">
              {TABS.map((tab) => {
                const isActive =
                  pathname === tab.href ||
                  (tab.href !== "/settings" && pathname.startsWith(tab.href));
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
