'use client';

import RequireAuth from '@/components/RequireAuth';
import AppShell from '@/components/layout/AppShell';
import { ModuleErrorBoundary } from '@/components/errors/ModuleErrorBoundary';

const ALL_ROLES = [
  'super_admin',
  'admin',
  'sales',
  'sales_manager',
  'am',
  'am_manager',
  'production',
  'production_manager',
  'finance',
  'hr',
  'client',
];

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={ALL_ROLES}>
      <ModuleErrorBoundary moduleName="Notifications">
        <AppShell>{children}</AppShell>
      </ModuleErrorBoundary>
    </RequireAuth>
  );
}
