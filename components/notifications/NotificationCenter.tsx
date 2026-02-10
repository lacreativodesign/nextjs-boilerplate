"use client";

import { useEffect, useMemo, useState } from "react";
import type { Notification } from "@/types/notifications";

type NotificationItem = Omit<Notification, "createdAt" | "readAt" | "archivedAt"> & {
  createdAt?: string | Date;
  readAt?: string | Date;
  archivedAt?: string | Date;
};

function formatTimestamp(value?: string | Date) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      unreadOnly: (filter === "unread").toString(),
    });
    return params.toString();
  }, [filter]);

  useEffect(() => {
    let isMounted = true;

    const fetchNotifications = async () => {
      const response = await fetch(`/api/notifications?${queryString}`);
      const data = await response.json();
      if (!isMounted) return;
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [queryString]);

  const markAsRead = async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    const response = await fetch(`/api/notifications?${queryString}`);
    const data = await response.json();
    setNotifications(data.notifications || []);
    setUnreadCount(data.unreadCount || 0);
  };

  const markAllAsRead = async () => {
    await fetch("/api/notifications/mark-all-read", { method: "POST" });
    const response = await fetch(`/api/notifications?${queryString}`);
    const data = await response.json();
    setNotifications(data.notifications || []);
    setUnreadCount(data.unreadCount || 0);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative rounded-full p-2 hover:bg-gray-100"
        aria-label="Notifications"
      >
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-96 rounded-lg bg-white shadow-xl">
          <div className="border-b p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Notifications</h3>
              <button onClick={markAllAsRead} className="text-sm text-blue-600 hover:underline">
                Mark all as read
              </button>
            </div>

            <div className="mt-2 flex gap-2">
              <button
                onClick={() => setFilter("all")}
                className={`rounded px-3 py-1 ${
                  filter === "all" ? "bg-blue-100 text-blue-600" : "bg-gray-100"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter("unread")}
                className={`rounded px-3 py-1 ${
                  filter === "unread" ? "bg-blue-100 text-blue-600" : "bg-gray-100"
                }`}
              >
                Unread ({unreadCount})
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No notifications</div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => !notification.isRead && markAsRead(notification.id)}
                  className={`cursor-pointer border-b p-4 hover:bg-gray-50 ${
                    !notification.isRead ? "bg-blue-50" : ""
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium">{notification.title}</h4>
                      <p className="mt-1 text-sm text-gray-600">{notification.message}</p>
                      {notification.actionUrl && (
                        <a
                          href={notification.actionUrl}
                          className="mt-2 inline-block text-sm text-blue-600 hover:underline"
                        >
                          {notification.actionLabel || "View"}
                        </a>
                      )}
                    </div>
                    {!notification.isRead && <span className="ml-2 h-2 w-2 rounded-full bg-blue-600" />}
                  </div>
                  <p className="mt-2 text-xs text-gray-400">{formatTimestamp(notification.createdAt)}</p>
                </div>
              ))
            )}
          </div>

          <div className="border-t p-4 text-center">
            <a href="/dashboard/notifications" className="text-sm text-blue-600 hover:underline">
              View all notifications
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
