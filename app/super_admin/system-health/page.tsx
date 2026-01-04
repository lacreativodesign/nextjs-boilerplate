"use client";

import { useEffect, useState } from "react";

type SystemHealth = {
  notifications: { total: number; unread: number; lastCreatedAt: string | null };
  emails: {
    total: number;
    statusCounts: Record<string, number>;
    lastCreatedAt: string | null;
  };
};

export default function SuperAdminSystemHealthPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const res = await fetch("/api/super-admin/system-health", { cache: "no-store", credentials: "include" });
      const json = await res.json().catch(() => null);
      if (active && json?.ok) {
        setHealth(json);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">System Health</h1>
          <p className="page-subtitle">Notification + email delivery telemetry.</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h3 className="section-title">Notifications</h3>
          <p className="section-subtitle">Unread by role + tenant is tracked per queue.</p>
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-[var(--border-subtle)] p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Total</div>
              <div className="text-3xl font-semibold mt-2">{health?.notifications?.total ?? 0}</div>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Unread</div>
              <div className="text-3xl font-semibold mt-2">{health?.notifications?.unread ?? 0}</div>
            </div>
            <div className="text-xs text-[var(--text-muted)]">
              Last event: {health?.notifications?.lastCreatedAt || "—"}
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="section-title">Email Queue</h3>
          <p className="section-subtitle">Queued, sent, and failed counts.</p>
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-[var(--border-subtle)] p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Total</div>
              <div className="text-3xl font-semibold mt-2">{health?.emails?.total ?? 0}</div>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Status</div>
              <div className="text-sm text-[var(--text-muted)] mt-2">
                {Object.entries(health?.emails?.statusCounts || {}).map(([status, count]) => (
                  <div key={status}>
                    {status}: {count}
                  </div>
                ))}
              </div>
            </div>
            <div className="text-xs text-[var(--text-muted)]">
              Last event: {health?.emails?.lastCreatedAt || "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
