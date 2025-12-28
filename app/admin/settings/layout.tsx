"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const tabs = [
  { label: "General", path: "/admin/settings" },
  { label: "Workflows", path: "/admin/settings/workflows" },
  { label: "Sales", path: "/admin/settings/sales" },
  { label: "Finance", path: "/admin/settings/finance" },
  { label: "Notifications & Email", path: "/admin/settings/notifications" },
  { label: "Roles & Permissions", path: "/admin/settings/roles" },
  { label: "Integrations", path: "/admin/settings/integrations" },
  { label: "Security", path: "/admin/settings/security" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="w-full">

      {/* TITLE */}
      <div className="mb-4">
        <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>
          System Settings
        </h2>
        <p style={{ fontSize: 15, color: "var(--sidebar-text)" }}>
          Manage global workflows, sales, finance, notifications, and security policies.
        </p>
      </div>

      {/* TABS — BLUE PILL UNIVERSAL STYLE */}
      <div
        className="flex gap-2 border-b mb-6"
        style={{ borderColor: "var(--border)" }}
      >
        {tabs.map((t) => {
          const isActive =
            pathname === t.path ||
            (pathname.startsWith(t.path + "/") &&
              t.path !== "/admin/settings");

          return (
            <Link
              key={t.path}
              href={t.path}
              className={clsx(
                "px-4 py-2 text-sm font-semibold rounded-t-md transition-colors",
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <div>{children}</div>
    </div>
  );
          }
