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

const actionLabel: Record<string, string> = {
  created: "created",
  updated: "updated",
  deleted: "deleted",
  commented: "commented on",
  assigned: "assigned",
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
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
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
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

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
      params.set("limit", "20");
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
    }, 15000);
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

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

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
    <div className="relative" ref={dropdownRef}>
      {/* Bell trigger */}
      <button
        type="button"
        onClick={onClose}
        className="notification-bell"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="notification-badge">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 z-50 flex flex-col overflow-hidden"
          style={{
            top: "calc(100% + 10px)",
            width: "min(400px, 96vw)",
            maxHeight: "calc(100dvh - 80px)",
            background: "var(--surface-card)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 16,
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {/* Arrow pointer */}
          <div
            style={{
              position: "absolute",
              top: -7,
              right: 18,
              width: 14,
              height: 14,
              background: "var(--surface-card)",
              border: "1px solid var(--border-subtle)",
              borderRight: "none",
              borderBottom: "none",
              transform: "rotate(45deg)",
              zIndex: 1,
            }}
          />

          {/* Header */}
          <div
            className="flex flex-shrink-0 items-center justify-between px-4 pt-4 pb-3"
            style={{ borderBottom: "1px solid var(--border-subtle)" }}
          >
            <div className="flex items-center gap-2">
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
                Notifications
              </h3>
              {unreadCount > 0 && (
                <span className="notification-badge" style={{ position: "static", transform: "none" }}>
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowFilters((f) => !f)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
                aria-label="Toggle filters"
                title="Filter notifications"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="4" y1="6" x2="20" y2="6" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                  <line x1="12" y1="18" x2="12" y2="18" />
                </svg>
              </button>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-muted)]"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Filters (collapsible) */}
          {showFilters && (
            <div
              className="grid grid-cols-2 gap-2 flex-shrink-0 px-4 py-3"
              style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--surface-muted)" }}
            >
              <select className="input" style={{ fontSize: 13 }} value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
                <option value="">All modules</option>
                {modules.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <input
                className="input"
                style={{ fontSize: 13 }}
                placeholder="Filter by user"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
              />
              <input className="input" style={{ fontSize: 13 }} type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              <input className="input" style={{ fontSize: 13 }} type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
          )}

          {/* Online presence strip */}
          {presence.length > 0 && (
            <div
              className="flex flex-shrink-0 flex-wrap items-center gap-1.5 px-4 py-2 text-xs text-[var(--text-muted)]"
              style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--surface-muted)" }}
            >
              <span className="h-2 w-2 rounded-full bg-green-500" />
              <span>{presence.length} online</span>
              {presence.slice(0, 3).map((entry) => (
                <span key={entry.uid} className="rounded-full bg-[var(--surface-card)] px-2 py-0.5 border border-[var(--border-subtle)]">
                  {entry.name}
                </span>
              ))}
            </div>
          )}

          {/* Notification list — scrollable */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="space-y-1 p-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="skeleton-shimmer h-16 rounded-xl" />
                ))}
              </div>
            )}

            {!loading && items.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-2xl"
                  style={{ background: "var(--surface-muted)", border: "1.5px dashed var(--border-strong)" }}
                >
                  <Bell className="h-5 w-5 text-[var(--text-muted)]" />
                </div>
                <p className="text-sm font-medium text-[var(--text-muted)]">No notifications yet</p>
                <p className="text-xs text-[var(--text-soft)]">Activity from your team will appear here.</p>
              </div>
            )}

            {items.map((item) => {
              const Icon = iconByAction[item.action] || Clock3;
              return (
                <button
                  key={item.id}
                  className="notification-row w-full text-left"
                  style={{ borderRadius: 0, borderLeft: "none", borderRight: "none" }}
                  onClick={() => void markRead(item.id)}
                >
                  {/* Icon avatar */}
                  <div
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
                    style={{ background: "var(--erp-blue-soft)" }}
                  >
                    <Icon className="h-4 w-4 text-[var(--erp-blue)]" />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <p className="notification-row__title" style={{ lineHeight: 1.4 }}>
                      <span className="font-semibold">{item.actor.name}</span>
                      {" "}
                      {actionLabel[item.action] || item.action}{" "}
                      <span style={{ color: "var(--erp-blue)" }}>{item.entity.type}</span>
                    </p>
                    {item.metadata.description && (
                      <p className="notification-row__body line-clamp-2">{item.metadata.description}</p>
                    )}
                    <p className="notification-row__time">
                      {item.metadata.module} · {formatDate(item.createdAt)}
                    </p>
                  </div>

                  {/* Unread dot */}
                  <div className="ml-2 flex-shrink-0">
                    <span className="block h-2 w-2 rounded-full" style={{ background: "var(--erp-blue)", opacity: 0.9 }} />
                  </div>
                </button>
              );
            })}

            <div ref={endRef} className="py-2 text-center text-xs text-[var(--text-muted)]">
              {loadingMore ? "Loading…" : nextCursor ? "Scroll for more ↓" : ""}
            </div>
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-4 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <button
              className="btn ghost w-full"
              style={{ fontSize: 13, height: 36 }}
              onClick={markAllRead}
              disabled={markingAll || unreadCount === 0}
            >
              {markingAll
                ? "Marking all as read…"
                : unreadCount > 0
                  ? `Mark all as read (${unreadCount})`
                  : "All caught up ✓"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
