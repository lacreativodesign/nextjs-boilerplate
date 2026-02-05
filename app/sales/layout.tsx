import RequireAuth from "@/components/RequireAuth";
import DashboardLayout from "@/components/DashboardLayout";

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["sales"]}>
      <DashboardLayout role="sales" title="Sales Dashboard">
        {children}
      </DashboardLayout>
    </RequireAuth>
  );
}
