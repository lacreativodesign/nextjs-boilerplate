"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/i18n/config";
import { useSidebar } from "@/lib/context/SidebarContext";
import { useTenantContext } from "@/lib/tenant/useTenantContext";
import type { ReactNode } from "react";

type HeaderProps = {
  currentUser: { name: string; email: string; role: string; avatarUrl?: string };
  activityTrigger?: ReactNode;
  onMenuToggle?: () => void;
};

export default function Header({ currentUser, activityTrigger }: HeaderProps) {
  const router = useRouter();
  const { locale, setLocale } = useI18n();
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  const { openMobile, isMobileOpen, closeMobile } = useSidebar();

  const { data } = useTenantContext();
  const tenantLogoUrl = data?.tenant?.whiteLabel?.logoUrl || null;
  const tenantName    = data?.tenant?.name || "Bizosto";
  const initials      = tenantName.slice(0, 2).toUpperCase();

  const currentLocale =
    SUPPORTED_LOCALES.find((l) => l.code === locale) ?? SUPPORTED_LOCALES[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST", credentials: "include" });
    router.replace("/login");
  };

  const iconBtn =
    "relative flex h-11 w-11 items-center justify-center rounded-xl border " +
    "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] " +
    "shadow-sm hover:bg-[var(--surface-muted)] transition-colors";

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 shadow-sm">
      <div className="flex h-[var(--header-height)] items-center justify-between">

        <button
          type="button"
          onClick={() => isMobileOpen ? closeMobile() : openMobile()}
          aria-label="Toggle navigation"
          className="md:hidden flex-shrink-0 flex h-10 w-10 items-center justify-center
            rounded-xl bg-[var(--erp-blue)] text-white font-bold text-sm shadow-md
            hover:opacity-90 transition-opacity"
        >
          {tenantLogoUrl ? (
            <img
              src={tenantLogoUrl}
              alt={tenantName}
              className="h-10 w-10 rounded-xl object-cover"
            />
          ) : (
            initials
          )}
        </button>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {activityTrigger || null}

          <div className="relative" ref={langRef}>
            <button
              type="button"
              onClick={() => setLangOpen((p) => !p)}
              className={`${iconBtn} text-base`}
              aria-label="Language"
            >
              {currentLocale.flag}
            </button>

            {langOpen && (
              <div className="absolute right-0 mt-2 w-44 overflow-hidden rounded-xl
                border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-lg z-50">
                {SUPPORTED_LOCALES.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => {
                      setLocale(item.code as SupportedLocale);
                      setLangOpen(false);
                    }}
                    className={[
                      "flex w-full items-center gap-3 px-4 py-2.5 text-sm",
                      "hover:bg-[var(--surface-muted)] transition-colors text-left",
                      locale === item.code
                        ? "text-[var(--erp-blue)] font-semibold"
                        : "text-[var(--text-primary)]",
                    ].join(" ")}
                  >
                    <span>{item.flag}</span>
                    <span>{item.nativeName}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className={iconBtn}
            aria-label="Logout"
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

      </div>
    </header>
  );
}
