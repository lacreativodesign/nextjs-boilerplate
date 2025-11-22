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
  );
}
