import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["admin"]}>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
