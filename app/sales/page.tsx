import RoleDashboardPage from "@/components/dashboard/RoleDashboardPage";

export default function SalesPage() {
  return (
    <RoleDashboardPage
      heading="Sales Dashboard"
      subtitle="Personal sales workspace for daily execution."
      kpis={["My Leads", "Deals in Negotiation", "Calls Scheduled", "Tasks Due"]}
      tableTitle="My Active Opportunities"
    />
  );
}
