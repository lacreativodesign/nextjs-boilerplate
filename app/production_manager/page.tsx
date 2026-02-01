"use client";

import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

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
};

export default function ProductionManagerOverview() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch("/api/production_manager/overview", { cache: "no-store" });
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

  const workload = overview?.workload || {
    openProjects: 0,
    draftsPendingReview: 0,
    revisionsInProgress: 0,
    overdueItems: 0,
  };
  const queue = overview?.queue || [];

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
          <div className="text-2xl font-semibold mt-2">
            {loading ? <Skeleton variant="text" className="h-6 w-20" /> : workload.openProjects}
          </div>
        </div>
        <div className="card kpi-card" style={{ padding: 18, borderRadius: 18 }}>
          <div className="text-xs text-[var(--text-muted)]">Drafts pending review</div>
          <div className="text-2xl font-semibold mt-2">
            {loading ? <Skeleton variant="text" className="h-6 w-20" /> : workload.draftsPendingReview}
          </div>
        </div>
        <div className="card kpi-card" style={{ padding: 18, borderRadius: 18 }}>
          <div className="text-xs text-[var(--text-muted)]">Revisions in progress</div>
          <div className="text-2xl font-semibold mt-2">
            {loading ? <Skeleton variant="text" className="h-6 w-20" /> : workload.revisionsInProgress}
          </div>
        </div>
        <div className="card kpi-card" style={{ padding: 18, borderRadius: 18 }}>
          <div className="text-xs text-[var(--text-muted)]">Overdue items</div>
          <div className="text-2xl font-semibold mt-2">
            {loading ? <Skeleton variant="text" className="h-6 w-20" /> : workload.overdueItems}
          </div>
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
                {loading &&
                  Array.from({ length: 5 }).map((_, index) => (
                    <tr key={`queue-skeleton-${index}`}>
                      <td colSpan={4}>
                        <div className="grid grid-cols-4 gap-4 py-2">
                          {Array.from({ length: 4 }).map((__, col) => (
                            <Skeleton key={`queue-skeleton-${index}-${col}`} variant="text" className="h-4 w-full" />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
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
    </div>
  );
}
