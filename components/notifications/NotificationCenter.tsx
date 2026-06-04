"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebaseClient";
import { useTenantContext } from "@/lib/tenant/useTenantContext";
import type { Notification } from "@/types/notifications";

type NotificationItem = Omit<Notification, "createdAt" | "readAt" | "archivedAt"> & {
  createdAt?: string | Date;
  readAt?: string | Date;
  archivedAt?: string | Date;
};

const VALID_TYPES = new Set(["info", "success", "warning", "error", "action_required", "reminder"]);
const VALID_CATEGORIES = new Set(["system", "financial", "sales", "operations", "security", "team", "custom"]);
const VALID_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);

function toNotificationItem(data: DocumentData, id: string): NotificationItem {
  const rawType = String(data.type || "");
  const type = VALID_TYPES.has(rawType) ? (rawType as NotificationItem["type"]) : "info";
  const category = VALID_CATEGORIES.has(String(data.category || ""))
    ? (String(data.category) as NotificationItem["category"])
    : "system";
  const priority = VALID_PRIORITIES.has(String(data.priority || ""))
    ? (String(data.priority) as NotificationItem["priority"])
    : "medium";

  return {
    id,
    tenantId: String(data.tenantId || ""),
    userId: String(data.userId || data.recipientUid || data.toUserId || data.toUid || ""),
    userEmail: String(data.userEmail || ""),
    type,
    title: String(data.title || ""),
    message: String(data.message || data.body || ""),
    priority,
    category,
    isRead: Boolean(data.isRead ?? data.read ?? false),
    isArchived: Boolean(data.isArchived ?? false),
    channels: Array.isArray(data.channels) ? data.channels : ["in_app"],
    deliveryStatus: data.deliveryStatus ?? { inApp: "delivered" as const },
    actionUrl: data.actionUrl ? String(data.actionUrl) : undefined,
    actionLabel: data.actionLabel ? String(data.actionLabel) : undefined,
    relatedResourceType: data.entityType ? String(data.entityType) : undefined,
    relatedResourceId: data.entityId ? String(data.entityId) : undefined,
    metadata: data.metadata ?? undefined,
    createdAt: data.createdAt?.toDate?.() ?? undefined,
    readAt: data.readAt?.toDate?.() ?? undefined,
    archivedAt: data.archivedAt?.toDate?.() ?? undefined,
  } as NotificationItem;
}

function formatTimestamp(value?: string | Date) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

export function NotificationCenter() {
  const { data: ctx } = useTenantContext();
  const [allNotifications, setAllNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  useEffect(() => {
    if (!ctx?.user?.uid || !ctx?.user?.tenantId) return;

    const uid = ctx.user.uid;
    const tenantId = ctx.user.tenantId;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    getFirebaseDb().then((db) => {
      if (cancelled) return;
      const q = query(
        collection(db, "notifications"),
        where("userId", "==", uid),
        where("tenantId", "==", tenantId),
        orderBy("createdAt", "desc"),
        limit(20)
      );
      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const items = snapshot.docs.map((doc) => toNotificationItem(doc.data(), doc.id));
          setAllNotifications(items);
          setUnreadCount(items.filter((n) => !n.isRead).length);
        },
        (error) => {
          console.error("Notifications listener error:", error);
        }
      );
    }).catch((error) => {
      console.error("Notifications listener error:", error);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [ctx?.user?.uid, ctx?.user?.tenantId]);

  const notifications = useMemo(
    () => (filter === "unread" ? allNotifications.filter((n) => !n.isRead) : allNotifications),
    [allNotifications, filter]
  );

  const markAsRead = async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    setAllNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnreadCount((prev) => Math.max(prev - 1, 0));
  };

  const markAllAsRead = async () => {
    await fetch("/api/notifications/mark-all-read", { method: "POST" });
    setAllNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="notification-bell"
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
        <div className="absolute right-0 z-50 mt-2 w-96 rounded-2xl bg-[var(--surface-card)] shadow-xl border border-[var(--border-subtle)]">
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
                  filter === "all" ? "bg-[var(--erp-blue-soft)] text-[var(--erp-blue)]" : "bg-[var(--surface-muted)] text-[var(--text-muted)]"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter("unread")}
                className={`rounded px-3 py-1 ${
                  filter === "unread" ? "bg-[var(--erp-blue-soft)] text-[var(--erp-blue)]" : "bg-[var(--surface-muted)] text-[var(--text-muted)]"
                }`}
              >
                Unread ({unreadCount})
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-[var(--text-muted)]">No notifications</div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => !notification.isRead && markAsRead(notification.id)}
                  className={`cursor-pointer border-b border-[var(--border-subtle)] p-4 hover:bg-[var(--table-row-hover)] ${
                    !notification.isRead ? "bg-blue-50" : ""
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium">{notification.title}</h4>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">{notification.message}</p>
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
                  <p className="mt-2 text-xs text-[var(--text-soft)]">{formatTimestamp(notification.createdAt)}</p>
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
