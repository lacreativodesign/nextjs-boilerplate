import RoleDashboardPage from "@/components/dashboard/RoleDashboardPage";

export default function ClientPage() {
  return (
    <RoleDashboardPage
      heading="Client Dashboard"
      subtitle="Client portal for project and billing visibility."
      kpis={["Active Projects", "Milestones This Month", "Open Invoices", "Support Tickets"]}
      tableTitle="Project Status Table"
    />
  );
}
