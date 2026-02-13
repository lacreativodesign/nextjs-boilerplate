"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Bell, Search, Menu } from "lucide-react";

type Item = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const ITEMS: Item[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/search", label: "Search", icon: Search },
  { href: "/dashboard/notifications", label: "Alerts", icon: Bell },
  { href: "#menu", label: "Menu", icon: Menu },
];

export default function MobileBottomNav({ onMenuTap }: { onMenuTap: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-subtle)] bg-[var(--surface-card)] px-2 pb-[calc(env(safe-area-inset-bottom)+6px)] pt-2 md:hidden">
      <ul className="grid grid-cols-4 gap-2">
        {ITEMS.map((item) => {
          const active = item.href !== "#menu" && pathname.startsWith(item.href);
          const Icon = item.icon;

          if (item.href === "#menu") {
            return (
              <li key={item.label}>
                <button onClick={onMenuTap} className="flex min-h-11 w-full flex-col items-center justify-center rounded-lg text-xs font-medium text-[var(--text-muted)]">
                  <Icon className="mb-1 h-5 w-5" />
                  {item.label}
                </button>
              </li>
            );
          }

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex min-h-11 w-full flex-col items-center justify-center rounded-lg text-xs font-medium ${
                  active ? "bg-[var(--erp-blue-soft)] text-[var(--erp-blue)]" : "text-[var(--text-muted)]"
                }`}
              >
                <Icon className="mb-1 h-5 w-5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
