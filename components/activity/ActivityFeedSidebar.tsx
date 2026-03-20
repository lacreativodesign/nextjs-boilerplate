"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, CheckCircle2, Clock3, MessageSquare, Pencil, PlusCircle, Trash2, UserRoundPlus, X } from "lucide-react";
import type { ActivityRecord, PresenceRecord } from "@/types/activity-feed";

type Props = {
  open: boolean;
  onClose: () => void;
};

const iconByAction = {
  created: PlusCircle,
  updated: Pencil,
  deleted: Trash2,
  commented: MessageSquare,
  assigned: UserRoundPlus,
};

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  const now = new Date();
  const diff = now.getTime() - parsed.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return parsed.toLocaleDateString();
}

export default function ActivityFeedSidebar({ open, onClose }: Props) {
  const [items, setItems] = useState<ActivityRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moduleFilter, setModuleFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [presence, setPresence] = useState<PresenceRecord[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchUnread = useCallback(async () => {
    const res = await fetch("/api/activities/unread-count", { cache: "no-store" });
    const payload = await res.json().catch(() => null);
    if (res.ok && payload?.ok) setUnreadCount(Number(payload.count || 0));
  }, []);

  const fetchPresence = useCallback(async () => {
    const res = await fetch("/api/activities/presence", { cache: "no-store" });
    const payload = await res.json().catch(() => null);
    if (res.ok && payload?.ok && Array.isArray(payload.users)) setPresence(payload.users as PresenceRecord[]);
  }, []);

  const sendPresence = useCallback(async (online: boolean) => {
    await fetch("/api/activities/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ online }),
    });
  }, []);

  const load = useCallback(
    async (cursor?: string, append?: boolean) => {
      const params = new URLSearchParams();
      params.set("limit", "30");
      if (cursor) params.set("cursor", cursor);
      if (moduleFilter.trim()) params.set("module", moduleFilter.trim());
      if (userFilter.trim()) params.set("userId", userFilter.trim());
      if (fromDate) params.set("from", new Date(fromDate).toISOString());
      if (toDate) params.set("to", new Date(`${toDate}T23:59:59.999Z`).toISOString());

      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const res = await fetch(`/api/activities/feed?${params.toString()}`, { cache: "no-store" });
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload?.ok) return;
        const fetched = Array.isArray(payload.items) ? (payload.items as ActivityRecord[]) : [];
        setItems((prev) => {
          if (!append) return fetched;
          const map = new Map(prev.map((item) => [item.id, item]));
          for (const item of fetched) map.set(item.id, item);
          return Array.from(map.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        });
        setNextCursor(payload.nextCursor || null);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [moduleFilter, userFilter, fromDate, toDate]
  );

  useEffect(() => {
    void load();
    void fetchUnread();
    void fetchPresence();
  }, [load, fetchUnread, fetchPresence]);

  useEffect(() => {
    void sendPresence(true);
    const unreadInterval = window.setInterval(() => {
      void fetchUnread();
    }, 8000);
    const feedInterval = window.setInterval(() => {
      void load();
    }, 10000);
    const presenceInterval = window.setInterval(() => {
      void sendPresence(true);
      void fetchPresence();
    }, 30000);
    const onBeforeUnload = () => {
      navigator.sendBeacon("/api/activities/presence", JSON.stringify({ online: false }));
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.clearInterval(unreadInterval);
      window.clearInterval(feedInterval);
      window.clearInterval(presenceInterval);
      window.removeEventListener("beforeunload", onBeforeUnload);
      void sendPresence(false);
    };
  }, [fetchPresence, fetchUnread, load, sendPresence]);

  useEffect(() => {
    if (!endRef.current || !nextCursor) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore) void load(nextCursor, true);
      },
      { threshold: 0.2 }
    );
    observer.observe(endRef.current);
    return () => observer.disconnect();
  }, [nextCursor, loadingMore, load]);

  const modules = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => set.add(item.metadata.module));
    return Array.from(set).sort();
  }, [items]);

  const markRead = useCallback(async (id: string) => {
    const res = await fetch(`/api/activities/${id}/read`, { method: "PUT" });
    if (res.ok) setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    setMarkingAll(true);
    try {
      await fetch("/api/activities/mark-all-read", { method: "POST" });
      setUnreadCount(0);
    } finally {
      setMarkingAll(false);
    }
  }, []);

  return (
    <>
      {/* Bell button in header */}
      <button type="button" onClick={onClose} className="notification-bell" aria-label="Activity Feed">
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>

      {/* Overlay */}
      {open && <div className="drawer-overlay" onClick={onClose} />}

      {/* Panel */}
      {open && (
        <aside
          className="drawer-panel drawer-panel--sm"
          style={{
            top: "var(--header-height)",
            height: "calc(100dvh - var(--header-height))",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <div className="mb-4 flex flex-shrink-0 items-start justify-between gap-3">
            <div>
              <h2 className="drawer-title">Activity Feed</h2>
              <p className="drawer-subtitle">
                Live updates across modules
                {unreadCount > 0 && (
                  <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[11px] font-semibold text-white">
                    {unreadCount}
                  </span>
                )}
              </p>
            </div>
            <button
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--surface-muted)]"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="h-4 w-4 text-[var(--text-muted)]" />
            </button>
          </div>

          {/* Filters */}
          <div className="mb-3 grid flex-shrink-0 grid-cols-2 gap-2">
            <select className="input" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
              <option value="">All modules</option>
              {modules.map((module) => (
                <option key={module} value={module}>
                  {module}
                </option>
              ))}
            </select>
            <input
              className="input"
              placeholder="Filter by user"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
            />
            <input className="input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <input className="input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>

          {/* Online presence */}
          {presence.length > 0 && (
            <div className="mb-3 flex flex-shrink-0 flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              <span>{presence.length} online:</span>
              {presence.slice(0, 4).map((entry) => (
                <span key={entry.uid} className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5">
                  {entry.name}
                </span>
              ))}
            </div>
          )}

          {/* Feed — scrollable middle section */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {loading && (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="skeleton-shimmer h-16 rounded-xl" />
                ))}
              </div>
            )}

            {!loading && items.length === 0 && <div className="notification-empty">No activity found.</div>}

            <div className="notification-list" style={{ marginTop: 0 }}>
              {items.map((item) => {
                const Icon = iconByAction[item.action] || Clock3;
                return (
                  <button key={item.id} className="notification-row w-full text-left" onClick={() => void markRead(item.id)}>
                    <div className="min-w-0 flex-1">
                      <div className="notification-row__title flex items-center gap-2">
                        <Icon className="h-4 w-4 flex-shrink-0 text-[var(--erp-blue)]" />
                        <span className="truncate">
                          {item.actor.name} {item.action} {item.entity.type}
                        </span>
                      </div>
                      {item.metadata.description && <p className="notification-row__body">{item.metadata.description}</p>}
                      <span className="notification-row__time">
                        {item.metadata.module} · {formatDate(item.createdAt)}
                      </span>
                    </div>
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-[var(--text-soft)]" />
                  </button>
                );
              })}
            </div>

            <div ref={endRef} className="py-2 text-center text-xs text-[var(--text-muted)]">
              {loadingMore ? "Loading more…" : nextCursor ? "Scroll for more ↓" : ""}
            </div>
          </div>

          {/* Footer — Mark all as read */}
          <div className="mt-2 flex-shrink-0 border-t border-[var(--border-subtle)] pt-3">
            <button className="btn ghost w-full" onClick={markAllRead} disabled={markingAll || unreadCount === 0}>
              {markingAll
                ? "Marking all as read…"
                : unreadCount > 0
                  ? `Mark all as read (${unreadCount})`
                  : "All caught up ✓"}
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
