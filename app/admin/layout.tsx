import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";
import { ErrorBoundary } from "@/components/errors/ErrorBoundary";
import { ErrorFallback } from "@/components/errors/ErrorFallback";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["admin"]}>
      <ErrorBoundary
        fallback={(error, resetError) => (
          <ErrorFallback
            error={error ?? new Error("Admin module failed to render")}
            context="page"
            resetError={resetError}
          />
        )}
      >
        <AppShell>{children}</AppShell>
      </ErrorBoundary>
    </RequireAuth>
  );
}
