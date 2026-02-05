import RoleDashboardPage from "@/components/dashboard/RoleDashboardPage";

export default function HrPage() {
  return (
    <RoleDashboardPage
      heading="HR Dashboard"
      subtitle="Workforce coverage and people operations snapshot."
      kpis={["Headcount", "Open Roles", "Onboarding in Progress", "Attendance Alerts"]}
      tableTitle="People Operations Table"
    />
  );
}
