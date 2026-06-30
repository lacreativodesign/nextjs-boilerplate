"use client";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";
import { ModuleErrorBoundary } from "@/components/errors/ModuleErrorBoundary";
import { apiFetch } from "@/lib/api/client";
function SuperAdminAccessAuditLogger({ pathname }: { pathname: string }) {
  useEffect(() => {
    try {
      void apiFetch("/api/audit/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "super_admin_page_access",
          path: pathname,
          timestamp: Date.now(),
        }),
      }).catch((error) => {
        console.error("Failed to log super_admin page access", error);
      });
    } catch (error) {
      console.error("Failed to log super_admin page access", error);
    }
  }, [pathname]);

  return null;
}

const TABS = [
  { href: "/super_admin",               label: "Overview"          },
  { href: "/super_admin/tenants",       label: "Tenants"           },
  { href: "/super_admin/users",         label: "All Users"         },
  { href: "/super_admin/payments",      label: "Revenue"           },
  { href: "/super_admin/activation",    label: "Activation"        },
  { href: "/super_admin/tax",           label: "Tax Filing"        },
  { href: "/super_admin/monitoring",    label: "Monitoring"        },
  { href: "/super_admin/system-health", label: "System Health"     },
  { href: "/super_admin/audit",         label: "Audit Logs"        },
  { href: "/super_admin/backups",       label: "Backups"           },
  { href: "/super_admin/demo",          label: "Demo"              },
  { href: "/super_admin/migration",     label: "Migration"         },
  { href: "/super_admin/settings",      label: "Platform Settings" },
];
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <RequireAuth allowed={["super_admin"]}>
      <SuperAdminAccessAuditLogger pathname={pathname} />
      <ModuleErrorBoundary moduleName="Super Admin">
        <AppShell>
          <div>
            <div className="mb-6">
              <h1 className="page-title">Super Admin</h1>
              <p className="page-subtitle">Platform management, tenants, system health, and audit logs.</p>
            </div>
            <div className="tabs-bar">
              {TABS.map((tab) => {
                const isActive = pathname === tab.href || (tab.href !== "/super_admin" && pathname.startsWith(tab.href));
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
