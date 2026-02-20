import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";
import { ModuleErrorBoundary } from "@/components/errors/ModuleErrorBoundary";

export default function HrLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["hr", "super_admin"]}>
      <ModuleErrorBoundary moduleName="HR">
        <AppShell>{children}</AppShell>
      </ModuleErrorBoundary>
    </RequireAuth>
  );
}
