'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { ModuleErrorBoundary } from '@/components/errors/ModuleErrorBoundary';

const tabs = [
  { label: 'Overview', path: '/admin/hr' },
  { label: 'Employees', path: '/admin/hr/employees' },
  { label: 'Onboarding', path: '/admin/hr/onboarding' },
  { label: 'Performance', path: '/admin/hr/performance' },
  { label: 'Documents', path: '/admin/hr/documents' },
  { label: 'Activity', path: '/admin/hr/activity' },
  { label: 'Settings', path: '/admin/hr/settings' },
];

export default function HRLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <ModuleErrorBoundary moduleName="HR">
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
