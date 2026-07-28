'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Clock3,
  MessageSquare,
  Pencil,
  PlusCircle,
  Trash2,
  UserRoundPlus,
  X,
} from 'lucide-react';
import type { ActivityRecord, PresenceRecord } from '@/types/activity-feed';
import { apiFetch } from '@/lib/api/client';

type Props = { open: boolean; onClose: () => void };

const ICON_BY_ACTION: Record<string, React.ElementType> = {
  created: PlusCircle,
  updated: Pencil,
  deleted: Trash2,
  commented: MessageSquare,
  assigned: UserRoundPlus,
};

const ACTION_LABEL: Record<string, string> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
  commented: 'commented on',
  assigned: 'assigned',
};

function timeAgo(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export default function ActivityFeedSidebar({ open, onClose }: Props) {
  const [items, setItems] = useState<ActivityRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moduleFilter, setModuleFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [presence, setPresence] = useState<PresenceRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const fetchUnread = useCallback(async () => {
    try {
      const r = await apiFetch('/api/activities/unread-count', { cache: 'no-store' });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.ok) setUnreadCount(Number(d.count || 0));
    } catch {}
  }, []);

  const fetchPresence = useCallback(async () => {
    try {
      const r = await apiFetch('/api/activities/presence', { cache: 'no-store' });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.ok && Array.isArray(d.users)) setPresence(d.users);
    } catch {}
  }, []);

  const sendPresence = useCallback(async (online: boolean) => {
    try {
      await apiFetch('/api/activities/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ online }),
      });
    } catch {}
  }, []);

  const load = useCallback(
    async (cursor?: string, append?: boolean) => {
      const p = new URLSearchParams({ limit: '20' });
      if (cursor) p.set('cursor', cursor);
      if (moduleFilter.trim()) p.set('module', moduleFilter.trim());
      if (userFilter.trim()) p.set('userId', userFilter.trim());
      if (fromDate) p.set('from', new Date(fromDate).toISOString());
      if (toDate) p.set('to', new Date(`${toDate}T23:59:59.999Z`).toISOString());
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const r = await apiFetch(`/api/activities/feed?${p}`, { cache: 'no-store' });
        const d = await r.json().catch(() => null);
        if (!r.ok || !d?.ok) {
          setLoadError(String(d?.error || 'Unable to load activity feed.'));
          return;
        }
        setLoadError(null);
        const fetched: ActivityRecord[] = Array.isArray(d.items) ? d.items : [];
        setItems((prev) => {
          if (!append) return fetched;
          const map = new Map(prev.map((i) => [i.id, i]));
          fetched.forEach((i) => map.set(i.id, i));
          return [...map.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        });
        setNextCursor(d.nextCursor || null);
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
    void fetchPresence();
  }, [load, fetchUnread, fetchPresence]);

  useEffect(() => {
    void sendPresence(true);
    // NOT-05: reduce idle polling cost. The unread count no longer needs 8s cadence here — the
    // bell's realtime listener is authoritative — so poll the activity feed less aggressively.
    const t1 = setInterval(() => void fetchUnread(), 30000);
    const t2 = setInterval(() => void load(), 30000);
    const t3 = setInterval(() => {
      void sendPresence(true);
      void fetchPresence();
    }, 30000);
    const bye = () =>
      navigator.sendBeacon('/api/activities/presence', JSON.stringify({ online: false }));
    window.addEventListener('beforeunload', bye);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
      clearInterval(t3);
      window.removeEventListener('beforeunload', bye);
      void sendPresence(false);
    };
  }, [fetchPresence, fetchUnread, load, sendPresence]);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!endRef.current || !nextCursor) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore) void load(nextCursor, true);
      },
      { threshold: 0.2 },
    );
    obs.observe(endRef.current);
    return () => obs.disconnect();
  }, [nextCursor, loadingMore, load]);

  const modules = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => s.add(i.metadata.module));
    return [...s].sort();
  }, [items]);

  const markRead = useCallback(async (id: string) => {
    const r = await apiFetch(`/api/activities/${id}/read`, { method: 'PUT' });
    if (r.ok) setUnreadCount((p) => Math.max(0, p - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    setMarkingAll(true);
    try {
      await apiFetch('/api/activities/mark-all-read', { method: 'POST' });
      setUnreadCount(0);
    } finally {
      setMarkingAll(false);
    }
  }, []);

  return (
    // position:relative here anchors the dropdown directly below the bell button
    <div className="relative" ref={wrapRef}>
      {/* Bell button */}
      <button
        type="button"
        onClick={onClose}
        className="notification-bell"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {/* Dropdown — sits directly under bell, right-aligned */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 'min(380px, 96vw)',
            maxHeight: 'calc(100dvh - 80px)',
            background: 'var(--surface-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 16,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 9999,
          }}
        >
          {/* Arrow pointer */}
          <div
            style={{
              position: 'absolute',
              top: -7,
              right: 16,
              width: 14,
              height: 14,
              background: 'var(--surface-card)',
              border: '1px solid var(--border-subtle)',
              borderRight: 'none',
              borderBottom: 'none',
              transform: 'rotate(45deg)',
              zIndex: 1,
            }}
          />

          {/* Header */}
          <div
            className="flex flex-shrink-0 items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center gap-2">
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 15,
                  color: 'var(--text-primary)',
                }}
              >
                Notifications
              </span>
              {unreadCount > 0 && (
                <span
                  style={{
                    background: 'var(--danger)',
                    color: '#fff',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '1px 7px',
                    lineHeight: '18px',
                  }}
                >
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                title="Toggle filters"
                onClick={() => setShowFilters((f) => !f)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-muted)]"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <line x1="4" y1="6" x2="20" y2="6" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                  <line x1="12" y1="18" x2="12" y2="18" />
                </svg>
              </button>
              <button
                onClick={onClose}
                aria-label="Close notifications"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-muted)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Collapsible filters */}
          {showFilters && (
            <div
              className="grid grid-cols-2 gap-2 px-4 py-3 flex-shrink-0"
              style={{
                borderBottom: '1px solid var(--border-subtle)',
                background: 'var(--surface-muted)',
              }}
            >
              <select
                className="input"
                style={{ fontSize: 12 }}
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
              >
                <option value="">All modules</option>
                {modules.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <input
                className="input"
                style={{ fontSize: 12 }}
                placeholder="Filter by user"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
              />
              <input
                className="input"
                style={{ fontSize: 12 }}
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
              <input
                className="input"
                style={{ fontSize: 12 }}
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          )}

          {/* Online presence strip */}
          {presence.length > 0 && (
            <div
              className="flex flex-shrink-0 flex-wrap items-center gap-1.5 px-4 py-2 text-xs text-[var(--text-muted)]"
              style={{
                borderBottom: '1px solid var(--border-subtle)',
                background: 'var(--surface-muted)',
              }}
            >
              <span className="h-2 w-2 rounded-full bg-green-500" />
              <span>{presence.length} online</span>
              {presence.slice(0, 3).map((u) => (
                <span
                  key={u.uid}
                  className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2 py-0.5"
                >
                  {u.name}
                </span>
              ))}
            </div>
          )}

          {/* Notification list */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="space-y-1 p-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="skeleton-shimmer h-16 rounded-xl" />
                ))}
              </div>
            )}

            {!loading && loadError && (
              <div
                className="mx-1 my-3 rounded-lg px-3 py-2 text-xs"
                style={{
                  background: 'rgba(220, 38, 38, 0.08)',
                  border: '1px solid rgba(220, 38, 38, 0.25)',
                  color: 'var(--danger-deep)',
                }}
                role="status"
              >
                {loadError} Please try again or contact support if this persists.
              </div>
            )}

            {!loading && !loadError && items.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-2xl"
                  style={{
                    background: 'var(--surface-muted)',
                    border: '1.5px dashed var(--border-strong)',
                  }}
                >
                  <Bell className="h-5 w-5 text-[var(--text-muted)]" />
                </div>
                <p className="text-sm font-medium text-[var(--text-muted)]">No notifications yet</p>
                <p className="text-xs text-[var(--text-soft)]">Team activity will appear here.</p>
              </div>
            )}

            {items.map((item) => {
              const Icon = ICON_BY_ACTION[item.action] || Clock3;
              return (
                <button
                  key={item.id}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-muted)]"
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  onClick={() => void markRead(item.id)}
                >
                  <div
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
                    style={{ background: 'var(--erp-blue-soft, rgba(102,146,249,0.12))' }}
                  >
                    <Icon className="h-4 w-4 text-[var(--erp-blue)]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug text-[var(--text-primary)]">
                      <span className="font-semibold">{item.actor.name}</span>{' '}
                      {ACTION_LABEL[item.action] || item.action}{' '}
                      <span className="text-[var(--erp-blue)]">{item.entity.type}</span>
                    </p>
                    {item.metadata.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-muted)]">
                        {item.metadata.description}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-[var(--text-soft)]">
                      {item.metadata.module} · {timeAgo(item.createdAt)}
                    </p>
                  </div>
                  <span className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-[var(--erp-blue)]" />
                </button>
              );
            })}

            <div ref={endRef} className="py-2 text-center text-xs text-[var(--text-muted)]">
              {loadingMore ? 'Loading…' : nextCursor ? 'Scroll for more ↓' : ''}
            </div>
          </div>

          {/* Footer */}
          <div
            className="flex-shrink-0 px-4 py-3"
            style={{ borderTop: '1px solid var(--border-subtle)' }}
          >
            <button
              className="btn ghost w-full"
              style={{ fontSize: 13, height: 36 }}
              onClick={markAllRead}
              disabled={markingAll || unreadCount === 0}
            >
              {markingAll
                ? 'Marking…'
                : unreadCount > 0
                  ? `Mark all as read (${unreadCount})`
                  : 'All caught up ✓'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
