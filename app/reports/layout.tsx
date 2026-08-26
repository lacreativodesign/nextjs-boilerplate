'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import RequireAuth from '@/components/RequireAuth';
import AppShell from '@/components/layout/AppShell';
import { ModuleErrorBoundary } from '@/components/errors/ModuleErrorBoundary';

const TABS = [
  { href: '/reports', label: 'Overview' },
  { href: '/reports/sales', label: 'Sales' },
  { href: '/reports/projects', label: 'Projects' },
  { href: '/reports/team', label: 'Team' },
  { href: '/reports/finance', label: 'Finance' },
  { href: '/reports/ai', label: '🤖 AI Reports' },
];

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <RequireAuth
      allowed={[
        'admin',
        'super_admin',
        'finance',
        'hr',
        'sales_manager',
        'am_manager',
        'production_manager',
      ]}
    >
      <ModuleErrorBoundary moduleName="Reports">
        <AppShell>
          <div>
            <div className="tabs-bar">
              {TABS.map((tab) => {
                const isActive =
                  pathname === tab.href ||
                  (tab.href !== '/reports' && pathname.startsWith(tab.href));
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
            <div className="mt-6">{children}</div>
          </div>
        </AppShell>
      </ModuleErrorBoundary>
    </RequireAuth>
  );
}
