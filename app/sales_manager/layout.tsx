import RequireAuth from "@/components/RequireAuth";
import DashboardLayout from "@/components/DashboardLayout";

export default function SalesManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["sales_manager"]}>
      <DashboardLayout role="sales_manager" title="Sales Manager Dashboard">
        {children}
      </DashboardLayout>
    </RequireAuth>
  );
}
