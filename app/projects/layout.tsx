'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import RequireAuth from '@/components/RequireAuth';
import AppShell from '@/components/layout/AppShell';
import { ModuleErrorBoundary } from '@/components/errors/ModuleErrorBoundary';
const TABS = [
  { href: '/projects', label: 'Overview' },
  { href: '/projects/pipeline', label: 'Pipeline' },
  { href: '/projects/change-requests', label: 'Change Requests' },
  { href: '/projects/files', label: 'Files' },
];
export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <RequireAuth
      allowed={['admin', 'super_admin', 'am', 'am_manager', 'production', 'production_manager']}
    >
      <ModuleErrorBoundary moduleName="Projects">
        <AppShell>
          <div>
            <div className="mb-6">
              <h1 className="page-title">Projects & Delivery</h1>
              <p className="page-subtitle">Project pipeline, change requests, and file delivery.</p>
            </div>
            <div className="tabs-bar">
              {TABS.map((tab) => {
                const isActive =
                  pathname === tab.href ||
                  (tab.href !== '/projects' && pathname.startsWith(tab.href));
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
