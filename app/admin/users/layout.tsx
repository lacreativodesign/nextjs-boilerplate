"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const tabs = [
  { label: "All Users", path: "/admin/users" },
  { label: "Roles", path: "/admin/users/roles" },
];

export default function UsersLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="w-full">
      <div className="mb-4">
        <h2 className="section-title mb-1">Users</h2>
        <p className="section-subtitle">Manage staff access, roles, and onboarding status.</p>
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
