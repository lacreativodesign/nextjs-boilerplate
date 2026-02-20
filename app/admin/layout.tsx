import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";
import { ErrorBoundary } from "@/components/errors/ErrorBoundary";
import { PageErrorFallback } from "@/components/errors/ErrorFallback";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["admin", "super_admin"]}>
      <ErrorBoundary fallbackComponent={PageErrorFallback}>
        <AppShell>{children}</AppShell>
      </ErrorBoundary>
    </RequireAuth>
  );
}
