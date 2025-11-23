"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const tabs = [
  { label: "All Clients", path: "/admin/clients" },
  { label: "Add Client", path: "/admin/clients/add" },
  { label: "Key Accounts", path: "/admin/clients/key-accounts" },
  { label: "Client Segments", path: "/admin/clients/segments" },
];

export default function ClientsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="w-full">
      {/* PAGE TITLE */}
      <div className="mb-4">
        <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>
          Clients
        </h2>
        <p style={{ fontSize: 15, color: "var(--sidebar-text)" }}>
          Manage clients, segments and key accounts.
        </p>
      </div>

      {/* LOCKED TAB STYLE (same as Sales & Pipeline) */}
      <div
        className="flex gap-2 border-b mb-6"
        style={{ borderColor: "var(--border)" }}
      >
        {tabs.map((t) => {
          const active = pathname === t.path;

          return (
            <Link
              key={t.path}
              href={t.path}
              className={clsx(
                "px-4 py-2 text-sm font-semibold rounded-t-md transition-colors",
                active
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
