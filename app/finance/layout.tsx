import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["finance"]}>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
