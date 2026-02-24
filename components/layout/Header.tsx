"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, LogOut } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/i18n/config";
import type { ReactNode } from "react";

type HeaderProps = {
  currentUser: { name: string; email: string; role: string; avatarUrl?: string };
  activityTrigger?: ReactNode;
};

export default function Header({ currentUser, activityTrigger }: HeaderProps) {
  const router = useRouter();
  const { locale, setLocale } = useI18n();
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  const currentLocale =
    SUPPORTED_LOCALES.find((l) => l.code === locale) || SUPPORTED_LOCALES[0];

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

  return (
    <header
      className="sticky top-0 z-30 border-b border-[var(--border-subtle)]
      bg-[var(--surface-card)] px-4 shadow-sm"
    >
      <div className="flex h-[var(--header-height)] items-center justify-between">
        {/* Left: empty / breadcrumbs area */}
        <div className="flex-1" />

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          {activityTrigger || null}

          {/* Bell notification */}
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("bizosto:notifications-open"))
            }
            className="flex h-9 w-9 items-center justify-center rounded-full
              border border-[var(--border-subtle)] bg-[var(--surface-card)]
              hover:bg-[var(--surface-muted)] transition-colors"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4 text-[var(--text-soft)]" />
          </button>

          {/* Language switcher - flag only, dropdown with names */}
          <div className="relative" ref={langRef}>
            <button
              type="button"
              onClick={() => setLangOpen((p) => !p)}
              className="flex h-9 w-9 items-center justify-center rounded-full
                border border-[var(--border-subtle)] bg-[var(--surface-card)]
                hover:bg-[var(--surface-muted)] transition-colors text-base"
              aria-label="Language"
            >
              {currentLocale.flag}
            </button>

            {langOpen && (
              <div
                className="absolute right-0 mt-2 w-44 overflow-hidden rounded-xl
                border border-[var(--border-subtle)] bg-[var(--surface-card)]
                shadow-lg z-50"
              >
                {SUPPORTED_LOCALES.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => {
                      setLocale(item.code as SupportedLocale);
                      setLangOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm
                      hover:bg-[var(--surface-muted)] transition-colors text-left
                      ${
                        locale === item.code
                          ? "text-[var(--erp-blue)] font-semibold"
                          : "text-[var(--text-primary)]"
                      }`}
                  >
                    <span>{item.flag}</span>
                    <span>{item.nativeName}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Direct Logout button */}
          <button
            type="button"
            onClick={handleLogout}
            className="flex h-9 items-center gap-2 rounded-full
              border border-[var(--border-subtle)] bg-[var(--surface-card)]
              px-3 hover:bg-red-500/10 hover:border-red-500/30
              hover:text-red-500 transition-colors text-sm
              text-[var(--text-soft)]"
            aria-label="Logout"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}
