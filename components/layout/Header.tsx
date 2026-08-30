"use client";

import Image, { type ImageLoaderProps } from "next/image";
import BizostoSplash from "@/components/ui/BizostoSplash";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  LayoutList,
  LogOut,
  Menu,
  Moon,
  Rows3,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useDensity } from "@/components/providers/DensityProvider";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import type { ReactNode } from "react";

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
  notificationBell?: ReactNode;
  onMenuToggle?: () => void;
};

type DayPeriod = "morning" | "afternoon" | "evening";

const imageLoader = ({ src }: ImageLoaderProps) => src;

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
  return trimmed ? trimmed.split(/\s+/)[0] || null : null;
}

function getUserInitials(name?: string | null, email?: string | null) {
  const trimmedName = name?.trim();
  if (trimmedName) {
    const parts = trimmedName.split(/\s+/).filter(Boolean);
    const firstInitial = parts[0]?.charAt(0) || "";
    const lastInitial =
      parts.length > 1 ? parts[parts.length - 1]?.charAt(0) || "" : "";
    return `${firstInitial}${lastInitial}`.toUpperCase() || "U";
  }
  return (email?.trim().charAt(0) || "U").toUpperCase();
}

export default function Header({
  currentUser,
  activityTrigger,
  notificationBell,
  onMenuToggle,
}: HeaderProps) {
  const router = useRouter();
  const { isDark, toggle } = useTheme();
  const { density, toggleDensity } = useDensity();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLogoutSplash, setShowLogoutSplash] = useState(false);
  const [dayPeriod, setDayPeriod] = useState<DayPeriod>(() =>
    getDayPeriod(new Date()),
  );
  const menuRef = useRef<HTMLDivElement>(null);
  const roleKey = normalizeRoleKey(currentUser.role);
  const roleLabel = formatRoleLabel(currentUser.role);
  const fullName =
    currentUser.displayName?.trim() ||
    currentUser.name?.trim() ||
    currentUser.email;
  const firstName = useMemo(
    () => getFirstName(currentUser.displayName),
    [currentUser.displayName],
  );
  const greeting = firstName
    ? `Good ${dayPeriod}, ${firstName}`
    : "Welcome back";
  const userInitials = useMemo(
    () => getUserInitials(fullName, currentUser.email),
    [fullName, currentUser.email],
  );
  const profileSettingsPath =
    roleKey === "admin" || roleKey === "super_admin"
      ? "/admin/settings"
      : roleKey === "client"
        ? "/client/profile"
        : "/settings";

  useEffect(() => {
    const updateDayPeriod = () => setDayPeriod(getDayPeriod(new Date()));
    const intervalId = window.setInterval(updateDayPeriod, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node))
        setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const openSearch = () =>
    window.dispatchEvent(new CustomEvent("bizosto:search-open"));

  const navigateFromMenu = (path: string) => {
    setMenuOpen(false);
    router.push(path);
  };

  const doLogout = async () => {
    await apiFetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <>
      <header className="workspace-header">
        <div className="workspace-header__left">
          <button
            type="button"
            className="workspace-icon-button md:hidden"
            onClick={onMenuToggle}
            aria-label="Open navigation"
          >
            <Menu className="h-[18px] w-[18px]" />
          </button>

          <button
            type="button"
            className="workspace-command-search"
            onClick={openSearch}
            aria-label="Search Bizosto"
          >
            <Search className="h-[18px] w-[18px]" />
            <span className="hidden sm:inline">
              Search people, work, finance and settings
            </span>
            <kbd className="hidden lg:inline-flex">Ctrl K</kbd>
          </button>

          <p className="workspace-header__greeting hidden xl:block">
            {greeting}
          </p>
        </div>

        <div className="workspace-header__right">
          {notificationBell || null}
          {activityTrigger || null}

          <button
            type="button"
            onClick={toggle}
            className="workspace-icon-button hidden sm:inline-flex"
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            title={isDark ? "Light mode" : "Dark mode"}
          >
            {isDark ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="workspace-profile-trigger"
              title={fullName || currentUser.email || greeting}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="workspace-profile-trigger__avatar">
                {currentUser.avatarUrl ? (
                  <Image
                    loader={imageLoader}
                    unoptimized
                    src={currentUser.avatarUrl}
                    alt={
                      currentUser.displayName ||
                      currentUser.email ||
                      "Current user"
                    }
                    width={32}
                    height={32}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  userInitials
                )}
              </span>
              <span className="hidden max-w-[180px] text-left lg:block">
                <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
                  {fullName || "User"}
                </span>
                <span className="block truncate text-[11px] text-[var(--text-muted)]">
                  {roleLabel}
                </span>
              </span>
            </button>

            {menuOpen ? (
              <div className="workspace-profile-menu" role="menu">
                <div className="workspace-profile-menu__identity">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                    {fullName || "User"}
                  </p>
                  <p className="truncate text-xs text-[var(--text-muted)]">
                    {currentUser.email}
                  </p>
                  <span className="workspace-role-chip">{roleLabel}</span>
                </div>

                <div className="workspace-profile-menu__divider" />

                <button
                  type="button"
                  onClick={() => navigateFromMenu(profileSettingsPath)}
                  className="workspace-profile-menu__item"
                  role="menuitem"
                >
                  <Settings className="h-4 w-4" />
                  <span>Profile settings</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigateFromMenu("/settings/preferences")}
                  className="workspace-profile-menu__item"
                  role="menuitem"
                >
                  <Bell className="h-4 w-4" />
                  <span>Notification preferences</span>
                </button>

                <div className="workspace-profile-menu__divider" />

                <button
                  type="button"
                  onClick={() => {
                    toggleDensity();
                    setMenuOpen(false);
                  }}
                  className="workspace-profile-menu__item"
                  role="menuitem"
                >
                  {density === "comfortable" ? (
                    <Rows3 className="h-4 w-4" />
                  ) : (
                    <LayoutList className="h-4 w-4" />
                  )}
                  <span>
                    {density === "comfortable"
                      ? "Use compact density"
                      : "Use comfortable density"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    toggle();
                    setMenuOpen(false);
                  }}
                  className="workspace-profile-menu__item"
                  role="menuitem"
                >
                  {isDark ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                  <span>
                    {isDark ? "Switch to light mode" : "Switch to dark mode"}
                  </span>
                </button>

                <div className="workspace-profile-menu__divider" />

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setShowLogoutSplash(true);
                  }}
                  className="workspace-profile-menu__item workspace-profile-menu__item--danger"
                  role="menuitem"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Log out</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      {showLogoutSplash ? (
        <BizostoSplash duration={2000} onDone={doLogout} />
      ) : null}
    </>
  );
}
