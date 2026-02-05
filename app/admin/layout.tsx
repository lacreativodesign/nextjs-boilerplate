import RequireAuth from "@/components/RequireAuth";
import DashboardLayout from "@/components/DashboardLayout";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["admin"]}>
      <DashboardLayout role="admin" title="Admin Dashboard">
        {children}
      </DashboardLayout>
    </RequireAuth>
  );
}
