"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  type: "info" | "warning" | "success" | "system";
  entityType: string | null;
  entityId: string | null;
  deepLink: string | null;
  isRead: boolean;
  createdAt: string | null;
  createdBy?: Record<string, unknown> | null;
  priority: string;
  metadata?: Record<string, unknown> | null;
};

type NotificationDrawerProps = {
  open: boolean;
  unreadCount: number;
  notifications: NotificationItem[];
  loading: boolean;
  onClose: () => void;
  onMarkAllRead: () => void;
  onOpen: (item: NotificationItem) => void;
  onMarkRead: (item: NotificationItem) => void;
  formatTimestamp: (value?: string | null) => string;
  activeFilter: "all" | "unread" | "approvals" | "mentions";
  onFilterChange: (filter: "all" | "unread" | "approvals" | "mentions") => void;
};

export default function NotificationDrawer({
  open,
  unreadCount,
  notifications,
  loading,
  onClose,
  onMarkAllRead,
  onOpen,
  onMarkRead,
  formatTimestamp,
  activeFilter,
  onFilterChange,
}: NotificationDrawerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => notifications.find((item) => item.id === selectedId) || null,
    [notifications, selectedId]
  );

  const isApproval = (item: NotificationItem) => {
    const entityType = String(item.entityType || "").toLowerCase();
    if (["approval", "change_request"].includes(entityType)) return true;
    const hay = `${item.title} ${item.body}`.toLowerCase();
    return hay.includes("approval");
  };

  const metadataEntries = selected?.metadata ? Object.entries(selected.metadata) : [];

  if (!open) return null;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-panel drawer-panel--md notification-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="notification-drawer__header">
          <div>
            <div className="drawer-title">Notifications</div>
            <div className="drawer-subtitle">{unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}</div>
          </div>
          <button className="btn ghost" onClick={onMarkAllRead} style={{ height: 34, borderRadius: 999 }}>
            Mark all as read
          </button>
        </div>

        <div className="flex gap-2 px-5 pb-3">
          {(["all", "unread", "mentions", "approvals"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className={clsx("btn ghost", activeFilter === tab && "active")}
              onClick={() => onFilterChange(tab)}
              style={{ height: 32, borderRadius: 999, textTransform: "capitalize" }}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="notification-list">
          {notifications.map((item) => (
            <div
              key={item.id}
              className={clsx("notification-row", !item.isRead && "notification-row--unread")}
              onClick={() => {
                setSelectedId(item.id);
                if (!item.isRead) {
                  onMarkRead(item);
                }
              }}
            >
              <div style={{ flex: 1 }}>
                <div className="notification-row__title">{item.title || "Update"}</div>
                <div className="notification-row__body">{item.body || "New update available."}</div>
              </div>
              <div className="notification-row__time" style={{ alignItems: "flex-end" }}>
                <div>{formatTimestamp(item.createdAt)}</div>
                <div className="flex gap-2 mt-2">
                  {item.deepLink && (
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpen(item);
                      }}
                      style={{ height: 28, borderRadius: 999 }}
                    >
                      Open
                    </button>
                  )}
                  {isApproval(item) && (
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpen(item);
                      }}
                      style={{ height: 28, borderRadius: 999 }}
                    >
                      Jump to Approval
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {loading && <div className="notification-empty">Loading notifications...</div>}
          {!loading && notifications.length === 0 && <div className="notification-empty">No notifications yet.</div>}
        </div>

        {selected && (
          <div className="card" style={{ marginTop: 16, padding: 16 }}>
            <div className="text-sm font-semibold">Context</div>
            <div className="text-xs text-[var(--text-muted)]" style={{ marginTop: 4 }}>
              Entity: {selected.entityType || "Unknown"} {selected.entityId ? `• ${selected.entityId}` : ""}
            </div>
            {selected.createdBy && (
              <div className="text-xs text-[var(--text-muted)]" style={{ marginTop: 4 }}>
                Created by: {String(selected.createdBy?.name || selected.createdBy?.email || "System")}
              </div>
            )}
            {metadataEntries.length > 0 && (
              <div className="text-xs text-[var(--text-muted)]" style={{ marginTop: 8 }}>
                {metadataEntries.map(([key, value]) => (
                  <div key={key}>
                    <strong>{key}:</strong> {String(value)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
