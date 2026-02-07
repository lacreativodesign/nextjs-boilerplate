import RequireAuth from "@/components/RequireAuth";
import DashboardLayout from "@/components/DashboardLayout";

export default function ProductionLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["production"]}>
      <DashboardLayout role="production" title="Production Dashboard">
        {children}
      </DashboardLayout>
    </RequireAuth>
  );
}
