import RoleDashboardPage from "@/components/dashboard/RoleDashboardPage";

export default function ProductionManagerPage() {
  return (
    <RoleDashboardPage
      heading="Production Manager Dashboard"
      subtitle="Capacity and delivery control for production streams."
      kpis={["Active Jobs", "Blocked Jobs", "Utilization", "QA Pending"]}
      tableTitle="Production Queue"
    />
  );
}
