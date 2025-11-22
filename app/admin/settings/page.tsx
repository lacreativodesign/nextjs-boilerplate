"use client";

import PageSection from "@/components/ui/PageSection";
import SubTabs from "@/components/ui/SubTabs";

const tabs = [
  { label: "General", path: "/admin/settings/general" },
  { label: "Email", path: "/admin/settings/email" },
  { label: "Integrations", path: "/admin/settings/integrations" },
  { label: "Security", path: "/admin/settings/security" },
];

export default function SettingsHome() {
  return (
    <PageSection
      title="System Settings"
      description="Configure system-wide settings and integrations."
    >
      <SubTabs tabs={tabs} />

      <div className="pt-6 text-gray-500 dark:text-gray-400">
        Select a tab above to continue.
      </div>
    </PageSection>
  );
}
