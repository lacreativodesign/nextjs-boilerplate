import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";
import { ModuleErrorBoundary } from "@/components/errors/ModuleErrorBoundary";

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["sales"]}>
      <ModuleErrorBoundary moduleName="Sales">
        <AppShell>{children}</AppShell>
      </ModuleErrorBoundary>
    </RequireAuth>
  );
}
