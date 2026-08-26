'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import RequireAuth from '@/components/RequireAuth';
import AppShell from '@/components/layout/AppShell';
import { ModuleErrorBoundary } from '@/components/errors/ModuleErrorBoundary';
// T-1: Attendance and Payroll are deliberately not tabs here. They render from the `attendance`
// collection, which has no writer, so both screens were permanently empty. Deferred, not deleted.
const TABS = [
  { href: '/hr', label: 'Overview' },
  { href: '/hr/employees', label: 'Employees' },
  { href: '/hr/leave', label: 'Leave' },
  { href: '/hr/performance', label: 'Performance' },
];
export default function HrLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <RequireAuth allowed={['hr', 'admin', 'super_admin']}>
      <ModuleErrorBoundary moduleName="HR">
        <AppShell>
          <div>
            <div className="tabs-bar">
              {TABS.map((tab) => {
                const isActive =
                  pathname === tab.href || (tab.href !== '/hr' && pathname.startsWith(tab.href));
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
