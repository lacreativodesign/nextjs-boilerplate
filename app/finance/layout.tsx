import RequireAuth from "@/components/RequireAuth";
import DashboardLayout from "@/components/DashboardLayout";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["finance"]}>
      <DashboardLayout role="finance" title="Finance Dashboard">
        {children}
      </DashboardLayout>
    </RequireAuth>
  );
}
