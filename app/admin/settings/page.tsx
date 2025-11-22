"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const tabs = [
  { label: "General", path: "/admin/settings/general" },
  { label: "Notifications", path: "/admin/settings/notifications" },
  { label: "Integrations", path: "/admin/settings/integrations" },
  { label: "Security", path: "/admin/settings/security" },
];

export default function SettingsHome() {
  const pathname = usePathname();

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">System Settings</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Configure company settings, notifications, integrations and security.
      </p>

      {/* Horizontal Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-800 mb-6">
        {tabs.map((tab) => {
          const active = pathname === tab.path;
          return (
            <Link
              key={tab.path}
              href={tab.path}
              className={clsx(
                "px-4 py-2 text-sm font-medium rounded-t-md transition-colors",
                active
                  ? "bg-blue-600 text-white"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Default empty state */}
      <div className="text-gray-500 dark:text-gray-400">
        Select a settings tab above to manage configuration.
      </div>
    </div>
  );
}
