'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { ModuleErrorBoundary } from '@/components/errors/ModuleErrorBoundary';

const tabs = [
  { label: 'Overview', path: '/admin/production' },
  { label: 'Queue', path: '/admin/production/queue' },
  { label: 'QA & Approvals', path: '/admin/production/qa' },
];

export default function ProductionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <ModuleErrorBoundary moduleName="Production">
      <div className="w-full">
        <div className="mb-4">
          <h2 className="section-title mb-1">Production</h2>
          <p className="section-subtitle">
            Monitor workloads, QA approvals, and delivery readiness.
          </p>
        </div>

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
