"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/i18n/config";

type HeaderProps = {
  currentUser: { name: string; email: string; role: string; avatarUrl?: string };
  activityTrigger?: ReactNode;
};

const roleBasePaths: Record<string, string> = {
  super_admin: "/super_admin",
  admin: "/dashboard",
  sales: "/sales",
  sales_manager: "/sales_manager",
  am: "/am",
  am_manager: "/am_manager",
  production: "/production",
  production_manager: "/production_manager",
  client: "/client",
  hr: "/hr",
  finance: "/finance",
};

const profileEnabledRoles = new Set(["sales", "client"]);

const getBasePath = (role: string) => roleBasePaths[role] || "/";

export default function Header({ currentUser, activityTrigger }: HeaderProps) {
  const router = useRouter();
  const { locale, setLocale, t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const basePath = useMemo(() => getBasePath(currentUser.role), [currentUser.role]);
  const profileHref = profileEnabledRoles.has(currentUser.role) ? `${basePath}/profile` : basePath;
  const settingsHref = currentUser.role === "admin" || currentUser.role === "super_admin" ? `${basePath}/settings` : basePath;
  const sessionsHref = currentUser.role === "admin" || currentUser.role === "super_admin" ? `${basePath}/settings/security` : profileHref;

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!menuRef.current || !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST", credentials: "include" });
    router.replace("/login");
  };

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-[var(--page-padding-x)] py-2 shadow-sm">
      <div className="flex h-[var(--header-height)] items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-base font-semibold text-[var(--text-primary)] md:hidden">{t("common.appName")}</div>
        </div>

        <div className="hidden flex-1 items-center justify-center md:flex">
          <div className="w-full max-w-md">
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("bizosto:search-open"))} className="flex w-full items-center justify-between rounded-full border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-2 text-sm text-[var(--text-soft)]">
              <span>{t("common.search")}</span>
              <span className="rounded border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] font-semibold">⌘K</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">{activityTrigger || null}
          <select
            value={locale}
            onChange={(event) => setLocale(event.target.value as SupportedLocale)}
            className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2 py-1 text-xs text-[var(--text-primary)]"
            aria-label={t("common.language")}
          >
            {SUPPORTED_LOCALES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.flag} {item.nativeName}
              </option>
            ))}
          </select>

          <div className="relative" ref={menuRef}>
            <button type="button" onClick={() => setMenuOpen((prev) => !prev)} className="flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-1.5 text-sm shadow-sm" aria-haspopup="menu" aria-expanded={menuOpen}>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-muted)] text-sm font-semibold">{currentUser.name.slice(0, 1).toUpperCase()}</div>
              <span className="hidden text-sm font-semibold md:inline">{currentUser.name}</span>
              <ChevronDown className="h-4 w-4 text-[var(--text-soft)]" />
            </button>

            {menuOpen && (
              <div role="menu" className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] text-sm shadow-lg">
                <div className="border-b border-[var(--border-subtle)] px-4 py-3">
                  <div className="font-semibold text-[var(--text-primary)]">{currentUser.name}</div>
                  <div className="text-xs text-[var(--text-muted)]">{currentUser.email}</div>
                </div>
                <div className="flex flex-col">
                  <Link href={profileHref} className="px-4 py-2 hover:bg-[var(--surface-muted)]" role="menuitem">{t("common.profile")}</Link>
                  <Link href={settingsHref} className="px-4 py-2 hover:bg-[var(--surface-muted)]" role="menuitem">{t("common.settings")}</Link>
                  <Link href={sessionsHref} className="px-4 py-2 hover:bg-[var(--surface-muted)]" role="menuitem">{t("common.activeSessions")}</Link>
                </div>
                <div className="border-t border-[var(--border-subtle)] px-4 py-2">
                  <button type="button" onClick={handleLogout} className="w-full text-left text-[var(--danger)]" role="menuitem">{t("common.logout")}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
