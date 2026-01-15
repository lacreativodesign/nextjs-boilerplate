"use client";

import { useCallback, useEffect, useState } from "react";

type WorkloadStats = {
  openProjects: number;
  draftsPendingReview: number;
  revisionsInProgress: number;
  overdueItems: number;
};

type QueueItem = {
  id: string;
  projectName: string;
  stage: string;
  assignedTo: string;
  updatedAt: string | null;
};

type OverviewResponse = {
  ok: boolean;
  workload: WorkloadStats;
  queue: QueueItem[];
  sla: {
    onTimePct: number;
    avgDeliveryDays: number;
    overdueCount: number;
    agingBuckets: { "0-2": number; "3-7": number; "7+": number };
  };
  teamWorkload: Array<{ name: string; activeProjects: number }>;
  escalations: Array<{ id: string; title: string; description: string; createdAt: string | null }>;
};

export default function ProductionManagerOverview() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch("/api/production-manager/overview", { cache: "no-store" });
      const data = (await res.json()) as OverviewResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to load overview.");
      }
      setOverview(data);
    } catch (err: any) {
      console.error("Production manager overview error", err);
      setError(err?.message || "Unable to load overview.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    let active = true;
    async function loadApprovals() {
      try {
        const res = await fetch("/api/approvals/list", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data?.ok) return;
        const pending = Array.isArray(data.approvals)
          ? data.approvals.filter((item: any) => item.status === "pending").length
          : 0;
        if (active) setPendingApprovals(pending);
      } catch (err) {
        console.warn("Failed to load approvals", err);
      }
    }
    loadApprovals();
    return () => {
      active = false;
    };
  }, []);

  const workload = overview?.workload || {
    openProjects: 0,
    draftsPendingReview: 0,
    revisionsInProgress: 0,
    overdueItems: 0,
  };
  const queue = overview?.queue || [];
  const sla = overview?.sla || { onTimePct: 0, avgDeliveryDays: 0, overdueCount: 0, agingBuckets: { "0-2": 0, "3-7": 0, "7+": 0 } };
  const teamWorkload = overview?.teamWorkload || [];
  const escalations = overview?.escalations || [];

  return (
    <div className="w-full">
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Production Manager</h1>
          <p className="page-subtitle" style={{ marginTop: 6 }}>
            Production workload, queue visibility, and approvals in one command center.
          </p>
        </div>
        <button className="btn" onClick={loadOverview} style={{ borderRadius: 999 }}>
          Refresh
        </button>
      </div>

      {error && (
        <div className="card" style={{ padding: 16, borderRadius: 14, border: "1px solid rgba(239,68,68,0.35)" }}>
          <div className="text-sm font-semibold text-red-500">{error}</div>
        </div>
      )}

      <div className="kpis" style={{ marginTop: 14 }}>
        <div className="card kpi-card" style={{ padding: 18, borderRadius: 18 }}>
          <div className="text-xs text-[var(--text-muted)]">Open projects</div>
          <div className="text-2xl font-semibold mt-2">{loading ? "—" : workload.openProjects}</div>
        </div>
        <div className="card kpi-card" style={{ padding: 18, borderRadius: 18 }}>
          <div className="text-xs text-[var(--text-muted)]">Drafts pending review</div>
          <div className="text-2xl font-semibold mt-2">{loading ? "—" : workload.draftsPendingReview}</div>
        </div>
        <div className="card kpi-card" style={{ padding: 18, borderRadius: 18 }}>
          <div className="text-xs text-[var(--text-muted)]">Revisions in progress</div>
          <div className="text-2xl font-semibold mt-2">{loading ? "—" : workload.revisionsInProgress}</div>
        </div>
        <div className="card kpi-card" style={{ padding: 18, borderRadius: 18 }}>
          <div className="text-xs text-[var(--text-muted)]">Overdue items</div>
          <div className="text-2xl font-semibold mt-2">{loading ? "—" : workload.overdueItems}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 18, borderRadius: 18, marginTop: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Queue</div>
        <div className="table-shell">
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Stage</th>
                  <th>Assigned</th>
                  <th>Last update</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={4} className="text-sm text-[var(--text-muted)]">
                      Loading queue...
                    </td>
                  </tr>
                )}
                {!loading && queue.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-sm text-[var(--text-muted)]">
                      No queue items available.
                    </td>
                  </tr>
                )}
                {!loading &&
                  queue.map((item) => (
                    <tr key={item.id}>
                      <td>{item.projectName}</td>
                      <td>{item.stage}</td>
                      <td>{item.assignedTo || "Unassigned"}</td>
                      <td>{item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <section
        className="grid"
        style={{
          marginTop: 18,
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        <div className="card" style={{ padding: 18, borderRadius: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>SLA Risks</div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span>On-time delivery</span>
              <span className="font-semibold">{loading ? "—" : `${sla.onTimePct}%`}</span>
            </div>
            <div className="flex justify-between">
              <span>Avg delivery time</span>
              <span className="font-semibold">{loading ? "—" : `${sla.avgDeliveryDays} days`}</span>
            </div>
            <div className="flex justify-between">
              <span>Overdue projects</span>
              <span className="font-semibold">{loading ? "—" : sla.overdueCount}</span>
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-2">
              Aging buckets: {sla.agingBuckets["0-2"]} (0-2d) · {sla.agingBuckets["3-7"]} (3-7d) ·{" "}
              {sla.agingBuckets["7+"]} (7+d)
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 18, borderRadius: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Team Workload</div>
          <div className="space-y-3 text-sm">
            {teamWorkload.length === 0 && <div className="text-xs text-[var(--text-muted)]">No workload data.</div>}
            {teamWorkload.map((row) => (
              <div key={row.name} className="flex justify-between">
                <span>{row.name}</span>
                <span className="font-semibold">{row.activeProjects}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 18, borderRadius: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Pending Approvals</div>
          <div className="text-2xl font-semibold">{loading ? "—" : pendingApprovals}</div>
          <div className="text-xs text-[var(--text-muted)] mt-2">Discounts, change requests, payment exceptions.</div>
        </div>

        <div className="card" style={{ padding: 18, borderRadius: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Escalation Alerts</div>
          <div className="space-y-3 text-sm">
            {escalations.length === 0 && <div className="text-xs text-[var(--text-muted)]">No escalations logged.</div>}
            {escalations.map((item) => (
              <div key={item.id}>
                <div className="font-semibold">{item.title}</div>
                <div className="text-xs text-[var(--text-muted)]">{item.description}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="card" style={{ padding: 18, borderRadius: 18, marginTop: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Quick Actions</div>
        <div className="flex flex-wrap gap-3">
          <a className="btn" href="/admin/production/queue" style={{ borderRadius: 999 }}>
            Review queue
          </a>
          <a className="btn ghost" href="/admin/production/qa" style={{ borderRadius: 999 }}>
            QA approvals
          </a>
          <a className="btn ghost" href="/admin/reports/production" style={{ borderRadius: 999 }}>
            Production report
          </a>
        </div>
      </div>
    </div>
  );
}
