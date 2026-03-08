"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

type Tab = { label: string; path: string };

export default function ModuleSectionLayout({
  title,
  description,
  tabs,
  children,
}: {
  title: string;
  description?: string;
  tabs: Tab[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="w-full">
      {/* TITLE + DESC */}
      <div className="mb-4">
        <h2 className="section-title mb-1">{title}</h2>
        {description && <p className="section-subtitle">{description}</p>}
      </div>

      {/* BLUE-PILL TABS (LOCKED STYLE) */}
      <div className="tabs-bar">
        {tabs.map((t) => {
          const active = pathname === t.path;
          return (
            <Link
              key={t.path}
              href={t.path}
              className={clsx("tab-pill", active && "active")}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* CONTENT */}
      <div>{children}</div>
    </div>
  );
}
