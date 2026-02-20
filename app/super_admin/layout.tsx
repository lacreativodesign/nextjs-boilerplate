import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";
import { ModuleErrorBoundary } from "@/components/errors/ModuleErrorBoundary";

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["super_admin"]}>
      <ModuleErrorBoundary moduleName="Super Admin">
        <AppShell>{children}</AppShell>
      </ModuleErrorBoundary>
    </RequireAuth>
  );
}
