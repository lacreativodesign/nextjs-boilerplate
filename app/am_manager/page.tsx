import RoleDashboardPage from "@/components/dashboard/RoleDashboardPage";

export default function AmManagerPage() {
  return (
    <RoleDashboardPage
      heading="Account Manager Lead Dashboard"
      subtitle="Delivery health and account ownership overview."
      kpis={["Accounts Managed", "At-Risk Accounts", "Renewals Due", "Escalations"]}
      tableTitle="Account Health Table"
    />
  );
}
