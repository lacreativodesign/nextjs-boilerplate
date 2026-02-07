import RoleDashboardPage from "@/components/dashboard/RoleDashboardPage";

export default function FinancePage() {
  return (
    <RoleDashboardPage
      heading="Finance Dashboard"
      subtitle="Financial posture and receivables visibility for operations."
      kpis={["Outstanding Invoices", "This Month Revenue", "Due Payments", "Expense Run Rate"]}
      tableTitle="Collections & Payment Table"
    />
  );
}
