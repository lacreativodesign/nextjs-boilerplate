"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, CheckCircle2, Clock3, MessageSquare, Pencil, PlusCircle, Trash2, UserRoundPlus, Users } from "lucide-react";
import type { ActivityRecord, PresenceRecord } from "@/types/activity-feed";
import { setUserPresence, subscribeToActivityUpdates, subscribeToPresence } from "@/lib/realtime/activity-sync";

type Props = {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  user: { uid: string; name: string; email?: string | null; role?: string | null };
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
  return parsed.toLocaleString();
}

export default function ActivityFeedSidebar({ open, onClose, tenantId, user }: Props) {
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

  const fetchUnread = useCallback(async () => {
    const res = await fetch("/api/activities/unread-count", { cache: "no-store" });
    const payload = await res.json().catch(() => null);
    if (res.ok && payload?.ok) {
      setUnreadCount(Number(payload.count || 0));
    }
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
    [moduleFilter, userFilter, fromDate, toDate],
  );

  useEffect(() => {
    void load();
    void fetchUnread();
  }, [load, fetchUnread]);

  useEffect(() => {
    const stop = subscribeToActivityUpdates({
      tenantId,
      onActivity: (activity) => {
        setItems((prev) => {
          const map = new Map(prev.map((item) => [item.id, item]));
          map.set(activity.id, activity);
          return Array.from(map.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        });
        setUnreadCount((prev) => prev + 1);
      },
    });

    return () => stop();
  }, [tenantId]);

  useEffect(() => {
    const stopPresence = subscribeToPresence(tenantId, setPresence);
    let stopOwnPresence: null | (() => void) = null;
    setUserPresence({ tenantId, uid: user.uid, name: user.name, email: user.email || null, role: user.role || null })
      .then((cleanup) => {
        stopOwnPresence = cleanup;
      })
      .catch((err) => {
        console.error("presence init failed", err);
      });

    return () => {
      stopPresence();
      stopOwnPresence?.();
    };
  }, [tenantId, user.uid, user.name, user.email, user.role]);

  useEffect(() => {
    if (!endRef.current || !nextCursor) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore) {
          void load(nextCursor, true);
        }
      },
      { threshold: 0.2 },
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
    if (res.ok) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm"
        aria-label="Activity Feed"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[11px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <aside className="fixed right-0 top-[var(--header-height)] z-40 h-[calc(100vh-var(--header-height))] w-full max-w-[420px] border-l border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold">Activity Feed</h3>
              <div className="text-xs text-[var(--text-muted)]">Live updates across modules</div>
            </div>
            <button className="btn ghost" onClick={onClose}>Close</button>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <select className="input" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
              <option value="">All modules</option>
              {modules.map((module) => (
                <option key={module} value={module}>{module}</option>
              ))}
            </select>
            <input className="input" placeholder="User ID" value={userFilter} onChange={(e) => setUserFilter(e.target.value)} />
            <input className="input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <input className="input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>

          <div className="mb-3 flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <Users className="h-4 w-4" />
            <span>{presence.length} online</span>
            <div className="flex items-center gap-1">
              {presence.slice(0, 5).map((entry) => (
                <span key={entry.uid} className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-muted)] px-2 py-1">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  {entry.name}
                </span>
              ))}
            </div>
          </div>

          <div className="h-[calc(100%-180px)] overflow-y-auto pr-1">
            {loading && <div className="text-sm text-[var(--text-muted)]">Loading activities…</div>}
            {!loading && items.length === 0 && <div className="text-sm text-[var(--text-muted)]">No activity found.</div>}
            <div className="space-y-2">
              {items.map((item) => {
                const Icon = iconByAction[item.action] || Clock3;
                return (
                  <article key={item.id} className="rounded-xl border border-[var(--border-subtle)] p-3">
                    <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                      <Icon className="h-4 w-4" />
                      {item.actor.name} {item.action} {item.entity.type}
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">{item.metadata.module} · {formatDate(item.createdAt)}</div>
                    {item.metadata.description && <div className="mt-1 text-sm">{item.metadata.description}</div>}
                    <button className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--text-soft)]" onClick={() => void markRead(item.id)}>
                      <CheckCircle2 className="h-3 w-3" /> Mark read
                    </button>
                  </article>
                );
              })}
            </div>
            <div ref={endRef} className="py-2 text-center text-xs text-[var(--text-muted)]">
              {loadingMore ? "Loading more…" : nextCursor ? "Scroll for more" : "End of feed"}
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
