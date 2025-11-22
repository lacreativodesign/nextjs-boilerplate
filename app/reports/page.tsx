"use client";

import SubTabs from "@/components/ui/SubTabs";

const tabs = [
  { label: "Sales", path: "/admin/reports/sales" },
  { label: "Clients", path: "/admin/reports/clients" },
  { label: "Projects", path: "/admin/reports/projects" },
  { label: "Finance", path: "/admin/reports/finance" },
  { label: "Team", path: "/admin/reports/team" },
];

export default function ReportsHome() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Reports & Analytics</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        View business performance metrics across all departments.
      </p>

      <SubTabs tabs={tabs} />

      <div className="text-gray-500 dark:text-gray-400">
        Select a tab above to continue.
      </div>
    </div>
  );
}
