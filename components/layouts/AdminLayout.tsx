"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const nav = [
  { label: "Overview", path: "/admin" },
  { label: "Users", path: "/admin/users" },
  { label: "Clients", path: "/admin/clients" },
  { label: "Sales & Pipeline", path: "/admin/sales" },
  { label: "Projects & Delivery", path: "/admin/projects" },
  { label: "Production", path: "/admin/production" },
  { label: "Finance", path: "/admin/finance" },
  { label: "HR & Team", path: "/admin/hr" },
  { label: "Reports", path: "/admin/reports" },
  { label: "Settings", path: "/admin/settings" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex w-full">
      {/* SIDEBAR */}
      <aside
        className="hidden md:flex flex-col w-60 border-r"
        style={{ background: "var(--sidebar-bg)", borderColor: "var(--border)" }}
      >
        <h2
          className="px-4 py-4 text-xl font-bold"
          style={{ color: "var(--text)" }}
        >
          ADMIN
        </h2>

        <nav className="flex flex-col gap-1 px-2">
          {nav.map((item) => {
            const active =
              pathname === item.path ||
              pathname.startsWith(item.path + "/");

            return (
              <Link
                key={item.path}
                href={item.path}
                className={clsx(
                  "px-3 py-2 rounded-md font-medium transition-colors",
                  active
                    ? "bg-blue-600 text-white"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
