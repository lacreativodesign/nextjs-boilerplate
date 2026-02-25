"use client";
import BizostoSplash from "@/components/ui/BizostoSplash";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";
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
  const { locale, setLocale } = useI18n();
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
    {showLogoutSplash && (
      <BizostoSplash
        duration={2000}
        onDone={doLogout}
      />
    )}
    </>
  );
}
