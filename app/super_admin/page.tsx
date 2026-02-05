import RoleDashboardPage from "@/components/dashboard/RoleDashboardPage";

export default function SuperAdminPage() {
  return (
    <RoleDashboardPage
      heading="Super Admin Dashboard"
      subtitle="Platform-wide governance boundary and tenant-agnostic control center."
      kpis={["Total Tenants", "Active Modules", "Platform MRR", "Open Platform Alerts"]}
      tableTitle="Platform Control Queue"
    />
  );
}
