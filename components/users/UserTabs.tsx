"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export default function UserTabs() {
  const pathname = usePathname();

  const tabs = [
    { label: "All Users", path: "/admin/users" },
    { label: "Create User", path: "/admin/users/create" },
    { label: "Activity Log", path: "/admin/users/activity" },
    { label: "Disabled Users", path: "/admin/users/disabled" },
    { label: "Roles", path: "/admin/users/roles" }
  ];

  return (
    <div className="tabs-bar">
      {tabs.map((t) => {
        const active = pathname === t.path;
        return (
          <Link
            key={t.path}
            href={t.path}
            className={`tab-pill ${active ? "active" : ""}`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
