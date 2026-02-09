import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["super_admin"]}>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
