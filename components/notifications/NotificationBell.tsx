"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
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
import { apiFetch } from "@/lib/api/client";
import NotificationDrawer, { type NotificationItem } from "@/components/notifications/NotificationDrawer";

type NotificationBellProps = {
  enabled?: boolean;
};

function normalizeNotification(data: DocumentData, id: string): NotificationItem {
  return {
    id,
    title: String(data.title || ""),
    body: String(data.message || data.body || ""),
    type: String(data.type || "system"),
    entityType: data.entityType ? String(data.entityType) : null,
    entityId: data.entityId ? String(data.entityId) : null,
    deepLink: data.deepLink ? String(data.deepLink) : null,
    isRead: Boolean(data.isRead ?? data.read ?? false),
    createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
    createdBy: (data.createdBy as Record<string, unknown>) || null,
    priority: String(data.priority || "normal"),
    metadata: (data.metadata as Record<string, unknown>) || null,
  };
}

export default function NotificationBell({ enabled = true }: NotificationBellProps) {
  const router = useRouter();
  const { data: ctx } = useTenantContext();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [allNotifications, setAllNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeFilter, setActiveFilter] = useState<"all" | "unread" | "approvals" | "mentions">("all");

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

  useEffect(() => {
    if (!enabled || !ctx?.user?.uid || !ctx?.user?.tenantId) return;

    const uid = ctx.user.uid;
    const tenantId = ctx.user.tenantId;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    setLoading(true);
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
          const items = snapshot.docs.map((doc) => normalizeNotification(doc.data(), doc.id));
          setAllNotifications(items);
          setUnreadCount(items.filter((n) => !n.isRead).length);
          setLoading(false);
        },
        (error) => {
          console.error("Notifications listener error:", error);
          setLoading(false);
        }
      );
    }).catch(() => {
      setLoading(false);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [enabled, ctx?.user?.uid, ctx?.user?.tenantId]);

  const isApproval = (item: NotificationItem) => {
    const entityType = String(item.entityType || "").toLowerCase();
    if (["approval", "change_request"].includes(entityType)) return true;
    const hay = `${item.title} ${item.body}`.toLowerCase();
    return hay.includes("approval");
  };

  const notifications = useMemo(() => {
    if (activeFilter === "unread") return allNotifications.filter((n) => !n.isRead);
    if (activeFilter === "approvals") return allNotifications.filter(isApproval);
    if (activeFilter === "mentions") {
      return allNotifications.filter((n) => {
        const hay = `${n.type} ${n.title} ${n.body}`.toLowerCase();
        return n.type === "mention" || hay.includes("mention") || hay.includes("@");
      });
    }
    return allNotifications;
  }, [allNotifications, activeFilter]);

  const handleMarkRead = async (item: NotificationItem) => {
    try {
      await apiFetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
    } catch (err) {
      console.error("Notification mark read error:", err);
    }
    setAllNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
    setUnreadCount((prev) => Math.max(prev - (item.isRead ? 0 : 1), 0));
  };

  const handleOpen = async (item: NotificationItem) => {
    await handleMarkRead(item);
    if (item.deepLink) {
      router.push(item.deepLink);
      setDrawerOpen(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiFetch("/api/notifications/mark-all-read", {
        method: "POST",
      });
    } catch (err) {
      console.error("Notification mark all read error:", err);
    } finally {
      setAllNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    }
  };

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        className="notification-bell"
        onClick={() => setDrawerOpen((prev) => !prev)}
      >
        <Bell size={18} />
        {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
      </button>
      <NotificationDrawer
        open={drawerOpen}
        unreadCount={unreadCount}
        notifications={notifications}
        loading={loading}
        onClose={() => setDrawerOpen(false)}
        onMarkAllRead={handleMarkAllRead}
        onOpen={handleOpen}
        onMarkRead={handleMarkRead}
        formatTimestamp={formatTimestamp}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
      />
    </>
  );
}
