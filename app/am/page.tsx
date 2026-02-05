import RoleDashboardPage from "@/components/dashboard/RoleDashboardPage";

export default function AmPage() {
  return (
    <RoleDashboardPage
      heading="Account Manager Dashboard"
      subtitle="Project/client coordination area for account execution."
      kpis={["My Accounts", "Open Tasks", "Pending Approvals", "Client Check-ins"]}
      tableTitle="Client Task Table"
    />
  );
}
