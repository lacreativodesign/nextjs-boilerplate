import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["sales"]}>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
