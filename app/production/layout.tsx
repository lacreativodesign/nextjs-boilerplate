import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";
import { ModuleErrorBoundary } from "@/components/errors/ModuleErrorBoundary";

export default function ProductionLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["production"]}>
      <ModuleErrorBoundary moduleName="Production">
        <AppShell>{children}</AppShell>
      </ModuleErrorBoundary>
    </RequireAuth>
  );
}
