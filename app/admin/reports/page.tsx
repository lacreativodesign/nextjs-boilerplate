"use client";

import PageSection from "@/components/ui/PageSection";
import SubTabs from "@/components/ui/SubTabs";

const tabs = [
  { label: "Sales Reports", path: "/admin/reports/sales" },
  { label: "Client Reports", path: "/admin/reports/clients" },
  { label: "Project Reports", path: "/admin/reports/projects" },
  { label: "Finance Reports", path: "/admin/reports/finance" },
  { label: "Team Productivity", path: "/admin/reports/team" },
];

export default function ReportsHome() {
  return (
    <PageSection
      title="Reports & Analytics"
      description="Company-wide performance, sales, clients, delivery and finance reporting."
    >
      <SubTabs tabs={tabs} />

      <div className="pt-6 text-gray-500 dark:text-gray-400">
        Select a report tab above to view details.
      </div>
    </PageSection>
  );
}
