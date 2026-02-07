import RequireAuth from "@/components/RequireAuth";
import DashboardLayout from "@/components/DashboardLayout";

export default function ProductionManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["production_manager"]}>
      <DashboardLayout role="production_manager" title="Production Manager Dashboard">
        {children}
      </DashboardLayout>
    </RequireAuth>
  );
}
