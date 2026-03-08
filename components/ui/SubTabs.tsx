"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export default function SubTabs({
  tabs,
}: {
  tabs: { label: string; path: string }[];
}) {
  const pathname = usePathname();

  return (
    <div className="tabs-bar">
      {tabs.map((tab) => {
        const active = pathname === tab.path;
        return (
          <Link
            key={tab.path}
            href={tab.path}
            className={clsx("tab-pill", active && "active")}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
