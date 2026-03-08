"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const tabs = [
  { label: "General", path: "/admin/settings" },
  { label: "Security", path: "/admin/settings/security" },
  { label: "Finance", path: "/admin/settings/finance" },
  { label: "Sales", path: "/admin/settings/sales" },
  { label: "Notifications", path: "/admin/settings/notifications" },
  { label: "Email Templates", path: "/admin/settings/email-templates" },
  { label: "Branding", path: "/admin/settings/branding" },
  { label: "Workflows", path: "/admin/settings/workflows" },
  { label: "Integrations", path: "/admin/settings/integrations" },
  { label: "API Usage", path: "/admin/settings/api-usage" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="w-full">
      <div className="mb-4">
        <h2 className="section-title mb-1">Admin Settings</h2>
        <p className="section-subtitle">Configure platform-wide settings, automation, and security policies.</p>
      </div>

      <div className="tabs-bar">
        {tabs.map((t) => {
          const active = pathname === t.path;
          return (
            <Link key={t.path} href={t.path} className={clsx("tab-pill", active && "active")}>
              {t.label}
            </Link>
          );
        })}
      </div>

      <div>{children}</div>
    </div>
  );
}
