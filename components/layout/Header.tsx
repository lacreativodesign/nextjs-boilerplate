"use client";
import BizostoSplash from "@/components/ui/BizostoSplash";

import { useEffect, useMemo, useRef, useState } from "react";
import { LogOut, Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useI18n } from "@/components/i18n/I18nProvider";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/i18n/config";
import type { CSSProperties, ReactNode } from "react";

type HeaderUser = {
  name: string;
  email: string;
  role: string;
  avatarUrl?: string;
  displayName?: string | null;
};

type HeaderProps = {
  currentUser: HeaderUser;
  activityTrigger?: ReactNode;
  onMenuToggle?: () => void;
};

type DayPeriod = "morning" | "afternoon" | "evening";

const ROLE_BADGE_STYLES: Record<string, CSSProperties> = {
  super_admin: { backgroundColor: "var(--color-purple)", color: "#ffffff" },
  admin: { backgroundColor: "var(--color-blue)", color: "#ffffff" },
  finance: { backgroundColor: "var(--color-green)", color: "#ffffff" },
  hr: { backgroundColor: "var(--color-teal)", color: "#ffffff" },
  sales: { backgroundColor: "var(--color-orange)", color: "#ffffff" },
  sales_manager: { backgroundColor: "var(--color-orange)", color: "#ffffff" },
  production: { backgroundColor: "var(--color-yellow)", color: "#111827" },
  production_manager: { backgroundColor: "var(--color-yellow)", color: "#111827" },
  am: { backgroundColor: "var(--color-cyan)", color: "#0f172a" },
  am_manager: { backgroundColor: "var(--color-cyan)", color: "#0f172a" },
  client: { backgroundColor: "var(--color-gray)", color: "#ffffff" },
};

function normalizeRoleKey(role?: string | null) {
  return String(role || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/^account_manager$/, "am");
}

function formatRoleLabel(role?: string | null) {
  const normalized = normalizeRoleKey(role);
  if (!normalized) return "User";

  return normalized
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getDayPeriod(date: Date): DayPeriod {
  const hour = date.getHours();
  if (hour >= 5 && hour <= 11) return "morning";
  if (hour >= 12 && hour <= 17) return "afternoon";
  return "evening";
}

function getFirstName(displayName?: string | null) {
  const trimmed = displayName?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] || null;
}

export default function Header({ currentUser, activityTrigger }: HeaderProps) {
  const { locale, setLocale, t } = useI18n();
  const { isDark, toggle } = useTheme();
  const [langOpen, setLangOpen] = useState(false);
  const [showLogoutSplash, setShowLogoutSplash] = useState(false);
  const [dayPeriod, setDayPeriod] = useState<DayPeriod>(() => getDayPeriod(new Date()));
  const langRef = useRef<HTMLDivElement>(null);
  const roleKey = normalizeRoleKey(currentUser.role);
  const roleBadgeStyle = ROLE_BADGE_STYLES[roleKey] || ROLE_BADGE_STYLES.admin;
  const roleLabel = formatRoleLabel(currentUser.role);
  const firstName = useMemo(() => getFirstName(currentUser.displayName), [currentUser.displayName]);
  const greeting = firstName ? `Good ${dayPeriod}, ${firstName}` : "Welcome back";
  const userInitial = (firstName || currentUser.email || "U").charAt(0).toUpperCase();

  const currentLocale =
    SUPPORTED_LOCALES.find((l) => l.code === locale) ?? SUPPORTED_LOCALES[0];

  useEffect(() => {
    const updateDayPeriod = () => setDayPeriod(getDayPeriod(new Date()));
    updateDayPeriod();
    const intervalId = window.setInterval(updateDayPeriod, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

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

          <div className="hidden items-center gap-2 sm:flex">
            <div
              className="flex h-11 items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 text-[var(--text-primary)] shadow-sm"
              title={currentUser.displayName || currentUser.email || greeting}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--erp-blue-soft)] text-xs font-bold text-[var(--erp-blue)]">
                {currentUser.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentUser.avatarUrl}
                    alt={currentUser.displayName || currentUser.email || "Current user"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  userInitial
                )}
              </span>
              <span className="max-w-[220px] truncate text-sm font-semibold">{greeting}</span>
            </div>

            <span
              className="rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide shadow-sm"
              style={roleBadgeStyle}
            >
              {roleLabel}
            </span>
          </div>

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
