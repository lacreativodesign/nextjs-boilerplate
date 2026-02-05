import RoleDashboardPage from "@/components/dashboard/RoleDashboardPage";

export default function ProductionPage() {
  return (
    <RoleDashboardPage
      heading="Production Dashboard"
      subtitle="Execution board for production team members."
      kpis={["My Assigned Jobs", "Due Today", "QA Rework", "Completed This Week"]}
      tableTitle="Work Item Queue"
    />
  );
}
