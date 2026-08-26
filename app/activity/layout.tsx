'use client';

import RequireAuth from '@/components/RequireAuth';
import AppShell from '@/components/layout/AppShell';
import { ModuleErrorBoundary } from '@/components/errors/ModuleErrorBoundary';

/**
 * DS-14. This layout previously rendered its own application shell — a 250px dark
 * aside, a bespoke header and a logout button — while importing AppShell on line 7 and
 * never using it. It was the same template as the hierarchy/team layouts removed in
 * S10, except those held a layout and no page and so never rendered; this one has a
 * page, so /activity shipped with no Bizosto sidebar, breadcrumbs, notification bell
 * or theme toggle.
 *
 * Its five-item nav is gone rather than rebuilt as a .tabs-bar: only /activity has a
 * page. /activity/logs, /activity/actions, /activity/errors and /activity/notifications
 * were never created, so four of the five links were dead. AppShell's own sidebar is
 * the navigation for what is a single-page module.
 */
export default function ActivityLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={['admin', 'super_admin']}>
      <ModuleErrorBoundary moduleName="Activity">
        <AppShell>{children}</AppShell>
      </ModuleErrorBoundary>
    </RequireAuth>
  );
}
