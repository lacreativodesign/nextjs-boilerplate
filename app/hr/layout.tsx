import RequireAuth from "@/components/RequireAuth";
import DashboardLayout from "@/components/DashboardLayout";

export default function HrLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["hr"]}>
      <DashboardLayout role="hr" title="HR Dashboard">
        {children}
      </DashboardLayout>
    </RequireAuth>
  );
}
