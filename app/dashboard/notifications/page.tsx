"use client";

import { useEffect, useMemo, useState } from "react";
import type { Notification, NotificationCategory } from "@/types/notifications";

type NotificationItem = Omit<Notification, "createdAt" | "readAt" | "archivedAt"> & {
  createdAt?: string | Date;
  readAt?: string | Date;
  archivedAt?: string | Date;
};

const categories: NotificationCategory[] = [
  "system",
  "financial",
  "sales",
  "operations",
  "security",
  "team",
  "custom",
];

function formatTimestamp(value?: string | Date) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [category, setCategory] = useState<"all" | NotificationCategory>("all");
  const [unreadCount, setUnreadCount] = useState(0);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      unreadOnly: (filter === "unread").toString(),
    });
    if (category !== "all") {
      params.set("category", category);
    }
    return params.toString();
  }, [filter, category]);

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
    return () => {
      isMounted = false;
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
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">All Notifications</h1>
          <p className="text-sm text-gray-500">{unreadCount} unread notifications</p>
        </div>
        <button onClick={markAllAsRead} className="rounded bg-blue-600 px-4 py-2 text-white">
          Mark all as read
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`rounded px-3 py-1 ${filter === "all" ? "bg-blue-100 text-blue-600" : "bg-gray-100"}`}
        >
          All
        </button>
        <button
          onClick={() => setFilter("unread")}
          className={`rounded px-3 py-1 ${
            filter === "unread" ? "bg-blue-100 text-blue-600" : "bg-gray-100"
          }`}
        >
          Unread
        </button>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as "all" | NotificationCategory)}
          className="rounded border border-gray-200 px-3 py-1 text-sm"
        >
          <option value="all">All categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      <div className="divide-y rounded-lg border bg-white">
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No notifications</div>
        ) : (
          notifications.map((notification) => (
            <div
              key={notification.id}
              onClick={() => !notification.isRead && markAsRead(notification.id)}
              className={`cursor-pointer p-4 transition hover:bg-gray-50 ${
                !notification.isRead ? "bg-blue-50" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{notification.title}</h3>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {notification.category}
                    </span>
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                      {notification.priority}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-gray-600">{notification.message}</p>
                  {notification.actionUrl && (
                    <a
                      href={notification.actionUrl}
                      className="mt-2 inline-block text-sm text-blue-600 hover:underline"
                    >
                      {notification.actionLabel || "View"}
                    </a>
                  )}
                </div>
                <div className="text-right text-xs text-gray-400">
                  <p>{formatTimestamp(notification.createdAt)}</p>
                  {!notification.isRead && <p className="mt-2 font-semibold text-blue-600">Unread</p>}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
