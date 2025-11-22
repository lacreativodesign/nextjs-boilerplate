"use client";

import SubTabs from "@/components/ui/SubTabs";

const tabs = [
  { label: "General", path: "/admin/settings/general" },
  { label: "Email", path: "/admin/settings/email" },
  { label: "Integrations", path: "/admin/settings/integrations" },
  { label: "Security", path: "/admin/settings/security" },
];

export default function SettingsHome() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">System Settings</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Configure system-wide settings and integrations.
      </p>

      <SubTabs tabs={tabs} />

      <div className="text-gray-500 dark:text-gray-400">
        Select a tab above to continue.
      </div>
    </div>
  );
}
