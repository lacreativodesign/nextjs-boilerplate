"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Bell, Search, Menu } from "lucide-react";
import { useSidebar } from "@/lib/context/SidebarContext";

type Item = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const ITEMS: Item[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/search", label: "Search", icon: Search },
  { href: "/dashboard/notifications", label: "Alerts", icon: Bell },
  { href: "#menu", label: "Menu", icon: Menu },
];

export default function MobileBottomNav({ onMenuTap }: { onMenuTap: () => void }) {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-subtle)] bg-[var(--surface-card)] px-2 md:hidden"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 6px)", paddingTop: "8px" }}
    >
      <ul className="grid grid-cols-4 gap-1">
        {ITEMS.map((item) => {
          const active = item.href !== "#menu" && item.href !== "/" && pathname.startsWith(item.href);
          const isHome = item.href === "/" && pathname === "/";
          const Icon = item.icon;

          if (item.href === "#menu") {
            return (
              <li key={item.label}>
                <button
                  onClick={onMenuTap}
                  className="flex w-full flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-medium text-[var(--text-muted)]"
                  style={{ minHeight: "52px" }}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </button>
              </li>
            );
          }

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex w-full flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-medium transition-colors ${
                  active || isHome
                    ? "bg-[var(--erp-blue-soft)] text-[var(--erp-blue)]"
                    : "text-[var(--text-muted)]"
                }`}
                style={{ minHeight: "52px" }}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
