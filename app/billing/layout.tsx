"use client";

import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";
import { ModuleErrorBoundary } from "@/components/errors/ModuleErrorBoundary";

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["admin", "super_admin"]}>
      <ModuleErrorBoundary moduleName="Billing">
        <AppShell>
          {children}
        </AppShell>
      </ModuleErrorBoundary>
    </RequireAuth>
  );
}
