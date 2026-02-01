"use client";

import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type HealthStats = {
  activeClients: number;
  projectsAtRisk: number;
  changeRequestsMtd: number;
};

type EscalationItem = {
  id: string;
  title: string;
  description: string;
  createdAt: string | null;
};

type OverviewResponse = {
  ok: boolean;
  health: HealthStats;
  escalations: EscalationItem[];
};

export default function AmManagerOverview() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch("/api/am_manager/overview", { cache: "no-store" });
      const data = (await res.json()) as OverviewResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to load overview.");
      }
      setOverview(data);
    } catch (err: any) {
      console.error("AM manager overview error", err);
      setError(err?.message || "Unable to load overview.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const health = overview?.health || {
    activeClients: 0,
    projectsAtRisk: 0,
    changeRequestsMtd: 0,
  };
  const escalations = overview?.escalations || [];

  return (
    <div className="w-full">
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">AM Manager</h1>
          <p className="page-subtitle" style={{ marginTop: 6 }}>
            Accounts health, escalations, and change requests for your portfolio.
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
          <div className="text-xs text-[var(--text-muted)]">Active clients</div>
          <div className="text-2xl font-semibold mt-2">
            {loading ? <Skeleton variant="text" className="h-6 w-20" /> : health.activeClients}
          </div>
        </div>
        <div className="card kpi-card" style={{ padding: 18, borderRadius: 18 }}>
          <div className="text-xs text-[var(--text-muted)]">Projects at risk</div>
          <div className="text-2xl font-semibold mt-2">
            {loading ? <Skeleton variant="text" className="h-6 w-20" /> : health.projectsAtRisk}
          </div>
        </div>
        <div className="card kpi-card" style={{ padding: 18, borderRadius: 18 }}>
          <div className="text-xs text-[var(--text-muted)]">CR volume (MTD)</div>
          <div className="text-2xl font-semibold mt-2">
            {loading ? <Skeleton variant="text" className="h-6 w-20" /> : health.changeRequestsMtd}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 18, borderRadius: 18, marginTop: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Escalations</div>
        <div className="table-shell">
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Title</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {loading &&
                  Array.from({ length: 5 }).map((_, index) => (
                    <tr key={`escalation-skeleton-${index}`}>
                      <td colSpan={3}>
                        <div className="grid grid-cols-3 gap-4 py-2">
                          {Array.from({ length: 3 }).map((__, col) => (
                            <Skeleton key={`escalation-skeleton-${index}-${col}`} variant="text" className="h-4 w-full" />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                {!loading && escalations.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-sm text-[var(--text-muted)]">
                      No escalations recorded.
                    </td>
                  </tr>
                )}
                {!loading &&
                  escalations.map((item) => (
                    <tr key={item.id}>
                      <td>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}</td>
                      <td>{item.title}</td>
                      <td>{item.description}</td>
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
