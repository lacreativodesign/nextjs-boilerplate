'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { ModuleErrorBoundary } from '@/components/errors/ModuleErrorBoundary';

const tabs = [
  { label: 'Overview', path: '/admin/finance' },
  { label: 'Invoices', path: '/admin/finance/invoices' },
  { label: 'Payments', path: '/admin/finance/payments' },
  { label: 'Payroll', path: '/admin/finance/payroll' },
  { label: 'Reports', path: '/admin/finance/reports' },
  { label: 'Settings', path: '/admin/finance/settings' },
];

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <ModuleErrorBoundary moduleName="Finance">
      <div className="w-full">
        <div className="tabs-bar">
          {tabs.map((t) => {
            const active = pathname === t.path;
            return (
              <Link key={t.path} href={t.path} className={clsx('tab-pill', active && 'active')}>
                {t.label}
              </Link>
            );
          })}
        </div>

        <div>{children}</div>
      </div>
    </ModuleErrorBoundary>
  );
}
