import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["admin", "super_admin"]}>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
