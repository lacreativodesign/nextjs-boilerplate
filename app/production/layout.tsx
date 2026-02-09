import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";

export default function ProductionLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["production"]}>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
