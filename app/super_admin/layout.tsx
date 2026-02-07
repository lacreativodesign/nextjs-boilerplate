import RequireAuth from "@/components/RequireAuth";
import DashboardLayout from "@/components/DashboardLayout";

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["super_admin"]}>
      <DashboardLayout role="super_admin" title="Super Admin Dashboard">
        {children}
      </DashboardLayout>
    </RequireAuth>
  );
}
