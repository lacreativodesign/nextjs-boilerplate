"use client";

import clsx from "clsx";
import { LogOut } from "lucide-react";
import NotificationBell from "@/components/notifications/NotificationBell";

type SidebarFooterProps = {
  collapsed: boolean;
  name?: string | null;
  role?: string | null;
  email?: string | null;
  notificationsEnabled?: boolean;
  onLogout: () => void;
};

const getInitials = (value: string) =>
  value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

export default function SidebarFooter({
  collapsed,
  name,
  role,
  email,
  notificationsEnabled = true,
  onLogout,
}: SidebarFooterProps) {
  const displayName = name || email || "User";
  const initialsSource = displayName.includes("@") ? displayName.split("@")[0] : displayName;
  const initials = getInitials(initialsSource);
  const roleLabel = role || "Member";

  return (
    <div className={clsx("sidebar-footer", collapsed && "sidebar-footer--collapsed")}>
      {collapsed ? (
        <div className="sidebar-avatar sidebar-avatar--collapsed">{initials}</div>
      ) : (
        <div className="sidebar-profile">
          <div className="sidebar-avatar">{initials}</div>
          <div className="sidebar-meta">
            <div className="sidebar-name">{displayName}</div>
            <div className="sidebar-role">{roleLabel}</div>
          </div>
        </div>
      )}

      <div className={clsx("sidebar-actions", collapsed && "sidebar-actions--collapsed")}>
        <NotificationBell enabled={notificationsEnabled} />
        <button
          type="button"
          onClick={onLogout}
          className={clsx("sidebar-action", collapsed && "sidebar-action--icon")}
          aria-label="Logout"
        >
          <LogOut size={16} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </div>
  );
}
