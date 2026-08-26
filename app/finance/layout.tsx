'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import RequireAuth from '@/components/RequireAuth';
import AppShell from '@/components/layout/AppShell';
import { ModuleErrorBoundary } from '@/components/errors/ModuleErrorBoundary';
import { useTenantContext } from '@/lib/tenant/useTenantContext';

const BASE_TABS = [
  { href: '/finance', label: 'Overview' },
  { href: '/finance/invoices', label: 'Invoices' },
  { href: '/finance/payments', label: 'Payments' },
  { href: '/finance/payroll', label: 'Payroll' },
  { href: '/finance/reports', label: 'Reports' },
  { href: '/finance/settings', label: 'Settings' },
];

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data } = useTenantContext();
  const taxEnabled = Boolean(data?.tenant?.modulesEnabled?.tax || data?.tenant?.modules?.tax);
  const tabs = taxEnabled ? [...BASE_TABS, { href: '/finance/tax', label: 'Tax' }] : BASE_TABS;

  return (
    <RequireAuth allowed={['finance', 'admin', 'super_admin']}>
      <ModuleErrorBoundary moduleName="Finance">
        <AppShell>
          <div>
            <div className="tabs-bar">
              {tabs.map((tab) => {
                const isActive =
                  pathname === tab.href ||
                  (tab.href !== '/finance' && pathname.startsWith(tab.href));
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

            <div>{children}</div>
          </div>
        </AppShell>
      </ModuleErrorBoundary>
    </RequireAuth>
  );
}
