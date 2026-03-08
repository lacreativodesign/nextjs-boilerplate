import RoleDashboardPage from "@/components/dashboard/RoleDashboardPage";

export default function AdminPage() {
  return (
    <RoleDashboardPage
      heading="Admin Dashboard"
      subtitle="Tenant operations snapshot for leadership and coordination."
      kpis={["Total Clients", "Active Projects", "Open Tickets", "Team Utilization"]}
      tableTitle="Operational Watchlist"
    />
  );
}
