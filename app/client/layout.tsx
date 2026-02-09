import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["client"]}>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
