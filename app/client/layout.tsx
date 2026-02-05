import RequireAuth from "@/components/RequireAuth";
import DashboardLayout from "@/components/DashboardLayout";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["client"]}>
      <DashboardLayout role="client" title="Client Dashboard">
        {children}
      </DashboardLayout>
    </RequireAuth>
  );
}
