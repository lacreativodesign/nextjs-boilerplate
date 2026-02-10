import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";
import { ModuleErrorBoundary } from "@/components/errors/ModuleErrorBoundary";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["finance"]}>
      <ModuleErrorBoundary moduleName="Finance">
        <AppShell>{children}</AppShell>
      </ModuleErrorBoundary>
    </RequireAuth>
  );
}
