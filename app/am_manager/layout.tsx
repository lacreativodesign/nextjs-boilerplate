import RequireAuth from "@/components/RequireAuth";
import DashboardLayout from "@/components/DashboardLayout";

export default function AmManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth allowed={["am_manager"]}>
      <DashboardLayout role="am_manager" title="Account Manager Lead Dashboard">
        {children}
      </DashboardLayout>
    </RequireAuth>
  );
}
