'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import RequireAuth from '@/components/RequireAuth';
import AppShell from '@/components/layout/AppShell';
import { ModuleErrorBoundary } from '@/components/errors/ModuleErrorBoundary';
import { apiFetch } from '@/lib/api/client';
function SuperAdminAccessAuditLogger({ pathname }: { pathname: string }) {
  useEffect(() => {
    try {
      void apiFetch('/api/audit/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'super_admin_page_access',
          path: pathname,
          timestamp: Date.now(),
        }),
      }).catch((error) => {
        console.error('Failed to log super_admin page access', error);
      });
    } catch (error) {
      console.error('Failed to log super_admin page access', error);
    }
  }, [pathname]);

  return null;
}

const TABS = [
  { href: '/super_admin', label: 'Overview' },
  { href: '/super_admin/tenants', label: 'Tenants' },
  { href: '/super_admin/users', label: 'All Users' },
  { href: '/super_admin/payments', label: 'Revenue' },
  { href: '/super_admin/activation', label: 'Activation' },
  { href: '/super_admin/tax', label: 'Tax Filing' },
  { href: '/super_admin/monitoring', label: 'Monitoring' },
  { href: '/super_admin/system-health', label: 'System Health' },
  { href: '/super_admin/tickets', label: 'Support Tickets' },
  { href: '/super_admin/audit', label: 'Audit Logs' },
  { href: '/super_admin/backups', label: 'Backups' },
  { href: '/super_admin/demo', label: 'Demo' },
  { href: '/super_admin/migration', label: 'Migration' },
  { href: '/super_admin/security', label: 'Security' },
  { href: '/super_admin/maintenance', label: 'Maintenance' },
  { href: '/super_admin/activity', label: 'Activity' },
  { href: '/super_admin/settings', label: 'Platform Settings' },
];
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <RequireAuth allowed={['super_admin']}>
      <SuperAdminAccessAuditLogger pathname={pathname} />
      <ModuleErrorBoundary moduleName="Super Admin">
        <AppShell>
          <div>
            {/* The tab bar is the section identity. Every child page renders its own
                page-title, so a generic "Super Admin" heading here stacked a second
                h1 above the real one on 14 of 19 pages. Navigation chrome lives in
                the layout; the heading belongs to the page. */}
            <div className="tabs-bar">
              {TABS.map((tab) => {
                const isActive =
                  pathname === tab.href ||
                  (tab.href !== '/super_admin' && pathname.startsWith(tab.href));
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`tab-pill ${isActive ? 'active' : ''}`}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </div>
            <div className="mt-8">{children}</div>
          </div>
        </AppShell>
      </ModuleErrorBoundary>
    </RequireAuth>
  );
}
