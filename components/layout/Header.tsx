"use client";
import BizostoSplash from "@/components/ui/BizostoSplash";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogOut, Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useI18n } from "@/components/i18n/I18nProvider";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/i18n/config";
import type { ReactNode } from "react";

type HeaderProps = {
  currentUser: { name: string; email: string; role: string; avatarUrl?: string };
  activityTrigger?: ReactNode;
  onMenuToggle?: () => void;
};

export default function Header({ currentUser, activityTrigger }: HeaderProps) {
  const router = useRouter();
  const { locale, setLocale, t } = useI18n();
  const { isDark, toggle } = useTheme();
  const [langOpen, setLangOpen] = useState(false);
  const [showLogoutSplash, setShowLogoutSplash] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

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
    setShowLogoutSplash(true);
  };

  const doLogout = async () => {
    await fetch("/api/logout", { method: "POST", credentials: "include" });
    window.location.href = "/login";
  };

  const iconBtn =
    "relative flex h-11 w-11 items-center justify-center rounded-xl border " +
    "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] " +
    "shadow-sm hover:bg-[var(--surface-muted)] transition-colors";

  return (
    <>
    <header className="fixed top-0 left-0 right-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 shadow-sm">
      <div className="flex h-[var(--header-height)] items-center justify-between">

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {activityTrigger || null}

          <button
            type="button"
            onClick={toggle}
            className={iconBtn}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            title={isDark ? "Light mode" : "Dark mode"}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <div className="relative" ref={langRef}>
            <button
              type="button"
              onClick={() => setLangOpen((p) => !p)}
              className={`${iconBtn} text-base`}
              aria-label={t("common.language")}
            >
              {currentLocale.flag}
            </button>

            {langOpen && (
              <div className="absolute right-0 mt-2 w-14 overflow-hidden rounded-xl
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
                      "flex w-full items-center justify-center py-2.5 text-base",
                      "hover:bg-[var(--surface-muted)] transition-colors",
                      locale === item.code
                        ? "bg-[var(--erp-blue-soft)]"
                        : "",
                    ].join(" ")}
                  >
                    <span>{item.flag}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className={iconBtn}
            aria-label={t("common.logout")}
            title={t("common.logout")}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

      </div>
    </header>
    {showLogoutSplash && (
      <BizostoSplash
        duration={2000}
        onDone={doLogout}
      />
    )}
    </>
  );
}
