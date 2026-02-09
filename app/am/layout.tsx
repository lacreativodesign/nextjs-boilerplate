import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";

export default function AccountManagementLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["am"]}>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
