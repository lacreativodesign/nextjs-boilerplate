import RoleDashboardPage from "@/components/dashboard/RoleDashboardPage";

export default function SalesManagerPage() {
  return (
    <RoleDashboardPage
      heading="Sales Manager Dashboard"
      subtitle="Pipeline oversight and team direction summary."
      kpis={["Team Leads", "Deals in Negotiation", "Forecast This Month", "Won This Week"]}
      tableTitle="Pipeline Review"
    />
  );
}
