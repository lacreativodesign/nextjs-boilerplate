import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/layout/AppShell";

export default function HrLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["hr"]}>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
