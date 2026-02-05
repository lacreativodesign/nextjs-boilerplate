import RequireAuth from "@/components/RequireAuth";
import DashboardLayout from "@/components/DashboardLayout";

export default function AmLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["am"]}>
      <DashboardLayout role="am" title="Account Manager Dashboard">
        {children}
      </DashboardLayout>
    </RequireAuth>
  );
}
