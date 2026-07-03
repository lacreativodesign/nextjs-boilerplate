'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import RequireAuth from '@/components/RequireAuth';
import AppShell from '@/components/layout/AppShell';
import { ModuleErrorBoundary } from '@/components/errors/ModuleErrorBoundary';
const TABS = [
  { href: '/am', label: 'Dashboard' },
  { href: '/am/clients', label: 'My Clients' },
  { href: '/am/projects', label: 'Projects' },
  { href: '/am/pipeline', label: 'Pipeline' },
  { href: '/am/change-requests', label: 'Change Requests' },
  { href: '/am/files', label: 'Files' },
];
export default function AmLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <RequireAuth allowed={['am']}>
      <ModuleErrorBoundary moduleName="Account Management">
        <AppShell>
          <div>
            <div className="mb-6">
              <h1 className="page-title">Account Management</h1>
              <p className="page-subtitle">Your clients, projects, and pipeline.</p>
            </div>
            <div className="tabs-bar">
              {TABS.map((tab) => {
                const isActive =
                  pathname === tab.href || (tab.href !== '/am' && pathname.startsWith(tab.href));
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
