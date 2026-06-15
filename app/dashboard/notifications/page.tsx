"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api/client";
import type { NotificationCategory } from "@/types/notifications";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  type: string;
  category: NotificationCategory;
  priority: string;
  isRead: boolean;
  actionUrl?: string;
  actionLabel?: string;
  createdAt?: string | Date;
};

function formatTimestamp(value?: string | Date) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  system: "System",
  financial: "Financial",
  sales: "Sales",
  operations: "Operations",
  security: "Security",
  team: "Team",
  custom: "Custom",
};

const CATEGORIES: Array<"all" | NotificationCategory> = [
  "all",
  "system",
  "financial",
  "sales",
  "operations",
  "security",
  "team",
  "custom",
];

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [category, setCategory] = useState<"all" | NotificationCategory>("all");
  const [page, setPage] = useState(1);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        unreadOnly: String(filter === "unread"),
        page: String(page),
        limit: "25",
      });
      if (category !== "all") params.set("category", category);

      const res = await apiFetch(`/api/notifications?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } finally {
      setLoading(false);
    }
  }, [filter, category, page]);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = async (id: string) => {
    await apiFetch(`/api/notifications/${id}/read`, { method: "POST" });
    void fetchNotifications();
  };

  const markAllAsRead = async () => {
    await apiFetch("/api/notifications/mark-all-read", { method: "POST" });
    void fetchNotifications();
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="rounded-lg border border-[var(--border-subtle)] px-4 py-2 text-sm hover:bg-[var(--surface-muted)]"
          >
            Mark all as read
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "unread"] as const).map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(1); }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === f
                ? "bg-[var(--erp-blue)] text-white"
                : "bg-[var(--surface-muted)] text-[var(--text-muted)] hover:bg-[var(--surface-card)]"
            }`}
          >
            {f === "all" ? "All" : `Unread (${unreadCount})`}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => { setCategory(cat); setPage(1); }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              category === cat
                ? "bg-[var(--erp-blue-soft)] text-[var(--erp-blue)]"
                : "bg-[var(--surface-muted)] text-[var(--text-muted)] hover:bg-[var(--surface-card)]"
            }`}
          >
            {cat === "all" ? "All Categories" : CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)]">
        {loading ? (
          <div className="p-12 text-center text-[var(--text-muted)]">Loading…</div>
        ) : notifications.length === 0 ? (
          <div className="p-12 text-center text-[var(--text-muted)]">No notifications</div>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {notifications.map((n) => (
              <li
                key={n.id}
                onClick={() => !n.isRead && markAsRead(n.id)}
                className={`flex cursor-pointer gap-4 p-4 hover:bg-[var(--table-row-hover)] ${
                  !n.isRead ? "bg-blue-50/50" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium leading-tight">{n.title}</p>
                    {!n.isRead && (
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    )}
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">{n.message}</p>
                  {n.actionUrl && (
                    <a
                      href={n.actionUrl}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-2 inline-block text-sm text-blue-600 hover:underline"
                    >
                      {n.actionLabel || "View"}
                    </a>
                  )}
                  <p className="mt-2 text-xs text-[var(--text-soft)]">
                    {formatTimestamp(n.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="rounded border border-[var(--border-subtle)] px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Previous
        </button>
        <button
          disabled={notifications.length < 25}
          onClick={() => setPage((p) => p + 1)}
          className="rounded border border-[var(--border-subtle)] px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
