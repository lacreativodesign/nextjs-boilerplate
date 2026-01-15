"use client";

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
  priority: string;
};

type NotificationDrawerProps = {
  open: boolean;
  unreadCount: number;
  notifications: NotificationItem[];
  loading: boolean;
  onClose: () => void;
  onMarkAllRead: () => void;
  onSelect: (item: NotificationItem) => void;
  formatTimestamp: (value?: string | null) => string;
};

export default function NotificationDrawer({
  open,
  unreadCount,
  notifications,
  loading,
  onClose,
  onMarkAllRead,
  onSelect,
  formatTimestamp,
}: NotificationDrawerProps) {
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

        <div className="notification-list">
          {notifications.map((item) => (
            <button
              key={item.id}
              type="button"
              className={clsx("notification-row", !item.isRead && "notification-row--unread")}
              onClick={() => onSelect(item)}
            >
              <div>
                <div className="notification-row__title">{item.title || "Update"}</div>
                <div className="notification-row__body">{item.body || "New update available."}</div>
              </div>
              <div className="notification-row__time">
                {formatTimestamp(item.createdAt)}
                {item.deepLink && <span className="notification-row__link">Open</span>}
              </div>
            </button>
          ))}
          {loading && <div className="notification-empty">Loading notifications...</div>}
          {!loading && notifications.length === 0 && <div className="notification-empty">No notifications yet.</div>}
        </div>
      </div>
    </div>
  );
}
