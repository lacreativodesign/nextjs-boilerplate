"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import NotificationDrawer, { type NotificationItem } from "@/components/notifications/NotificationDrawer";

type NotificationBellProps = {
  enabled?: boolean;
  pollIntervalMs?: number;
};

export default function NotificationBell({ enabled = true, pollIntervalMs = 60000 }: NotificationBellProps) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const formatTimestamp = useMemo(
    () => (value?: string | null) => {
      if (!value) return "";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";
      const diffMs = Date.now() - date.getTime();
      const diffMinutes = Math.floor(diffMs / 60000);
      if (diffMinutes < 1) return "Just now";
      if (diffMinutes < 60) return `${diffMinutes}m ago`;
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    },
    []
  );

  const fetchNotifications = async (mode: "badge" | "full") => {
    if (mode === "full") {
      setNotificationsLoading(true);
    }

    try {
      const res = await fetch(`/api/notifications/list${mode === "badge" ? "?unreadOnly=true" : ""}`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("Notification fetch error:", data?.error || res.statusText);
        return;
      }

      if (Array.isArray(data?.notifications) && mode === "full") {
        setNotifications(data.notifications);
      }

      if (typeof data?.unreadCount === "number") {
        setUnreadCount(data.unreadCount);
      }
    } catch (err) {
      console.error("Notification fetch error:", err);
    } finally {
      if (mode === "full") {
        setNotificationsLoading(false);
      }
    }
  };

  const handleNotificationClick = async (item: NotificationItem) => {
    try {
      await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: item.id }),
      });
    } catch (err) {
      console.error("Notification mark read error:", err);
    }

    setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
    setUnreadCount((prev) => Math.max(prev - (item.isRead ? 0 : 1), 0));
    setDrawerOpen(false);

    if (item.deepLink) {
      router.push(item.deepLink);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await fetch("/api/notifications/mark-all-read", {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("Notification mark all read error:", err);
    } finally {
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    }
  };

  useEffect(() => {
    if (!enabled) return;
    fetchNotifications("badge");
    const interval = window.setInterval(() => {
      fetchNotifications("badge");
    }, pollIntervalMs);
    return () => window.clearInterval(interval);
  }, [enabled, pollIntervalMs]);

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        className="notification-bell"
        onClick={() => {
          const nextOpen = !drawerOpen;
          setDrawerOpen(nextOpen);
          if (nextOpen) {
            fetchNotifications("full");
          }
        }}
      >
        <Bell size={18} />
        {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
      </button>
      <NotificationDrawer
        open={drawerOpen}
        unreadCount={unreadCount}
        notifications={notifications}
        loading={notificationsLoading}
        onClose={() => setDrawerOpen(false)}
        onMarkAllRead={handleMarkAllRead}
        onSelect={handleNotificationClick}
        formatTimestamp={formatTimestamp}
      />
    </>
  );
}
