'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, X } from 'lucide-react';

type ToastNotification = {
  id: string;
  title: string;
  body: string;
  type: string;
  deepLink: string | null;
  createdAt: string | null;
};

type ToastItem = ToastNotification & { toastId: string };

const TYPE_COLOR: Record<string, string> = {
  success: 'var(--success)',
  warning: '#f59e0b',
  error: 'var(--danger)',
  approval_requested: '#f59e0b',
  new_lead: 'var(--erp-blue)',
  change_request: '#8b5cf6',
  deal_paid: 'var(--success)',
  info: 'var(--erp-blue)',
  system: 'var(--text-muted)',
};

function getColor(type: string) {
  return TYPE_COLOR[type] || 'var(--erp-blue)';
}

export default function NotificationToast() {
  const router = useRouter();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seenIds = useRef<Set<string>>(new Set());
  const initialised = useRef(false);

  const dismiss = useCallback((toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.toastId !== toastId));
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/list?filter=unread&limit=10', {
        cache: 'no-store',
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (!data?.ok || !Array.isArray(data.notifications)) return;

      const incoming: ToastNotification[] = data.notifications;

      // On first load, seed seen IDs without showing toasts
      if (!initialised.current) {
        incoming.forEach((n) => seenIds.current.add(n.id));
        initialised.current = true;
        return;
      }

      // Find genuinely new ones
      const newOnes = incoming.filter((n) => !seenIds.current.has(n.id));
      if (!newOnes.length) return;

      newOnes.forEach((n) => seenIds.current.add(n.id));

      // Show up to 3 at a time
      const toShow = newOnes.slice(0, 3);
      const newToasts: ToastItem[] = toShow.map((n) => ({
        ...n,
        toastId: `${n.id}-${Date.now()}`,
      }));

      setToasts((prev) => [...newToasts, ...prev].slice(0, 5));

      // Auto-dismiss each after 4.5s
      newToasts.forEach((t) => {
        setTimeout(() => dismiss(t.toastId), 4500);
      });
    } catch {
      // silently fail
    }
  }, [dismiss]);

  // Poll every 8 seconds — same cadence as bell
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 8000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  if (!toasts.length) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 72,
        right: 16,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        width: 320,
        maxWidth: 'calc(100vw - 32px)',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.toastId}
          className="notification-toast-card"
          style={{ pointerEvents: 'auto' }}
          onClick={() => {
            if (toast.deepLink) router.push(toast.deepLink);
            dismiss(toast.toastId);
          }}
        >
          {/* Colour accent bar */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 4,
              borderRadius: '12px 0 0 12px',
              background: getColor(toast.type),
            }}
          />

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, paddingLeft: 12 }}>
            {/* Icon */}
            <div
              style={{
                flexShrink: 0,
                width: 32,
                height: 32,
                borderRadius: 8,
                background: getColor(toast.type) + '22',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 2,
              }}
            >
              <Bell style={{ width: 15, height: 15, color: getColor(toast.type) }} />
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  lineHeight: 1.3,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {toast.title}
              </p>
              {toast.body && (
                <p
                  style={{
                    margin: '3px 0 0',
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    lineHeight: 1.4,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {toast.body}
                </p>
              )}
            </div>

            {/* Dismiss */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dismiss(toast.toastId);
              }}
              style={{
                flexShrink: 0,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 2,
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X style={{ width: 13, height: 13 }} />
            </button>
          </div>

          {/* Progress bar */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 2,
              borderRadius: '0 0 12px 12px',
              overflow: 'hidden',
            }}
          >
            <div className="notification-toast-progress" />
          </div>
        </div>
      ))}
    </div>
  );
}
