"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsDarkMode } from "@/lib/useIsDarkMode";
import { formatDateTime, formatUsd } from "@/components/finance/financeUtils";

const KPI_LABELS = [
  { key: "totalLeads", label: "Total Leads" },
  { key: "activeDeals", label: "Active Deals" },
  { key: "pipelineValue", label: "Pipeline Value (USD)" },
  { key: "closedWonMonth", label: "Closed Won (This Month)" },
  { key: "conversionRate", label: "Conversion Rate %" },
];

type OverviewResponse = {
  ok: boolean;
  kpis: {
    totalLeads: number;
    activeDeals: number;
    pipelineValue: number;
    closedWonMonth: number;
    conversionRate: number;
  };
  pipelineStages: Array<{ stage: string; count: number; value: number }>;
  topOwners: Array<{ ownerName: string; deals: number; value: number }>;
  recentActivity: Array<{ id: string; title: string; description: string; createdAt: string | null }>;
};

type ErrorState = { title: string; message: string };

export default function SalesOverviewPage() {
  const isDark = useIsDarkMode();
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch("/api/admin/sales/overview", { cache: "no-store" });
      const data = (await res.json()) as OverviewResponse;
      if (!res.ok || !data.ok) {
        throw new Error("Unable to load sales overview.");
      }
      setOverview(data);
    } catch (err) {
      console.error("Sales overview error", err);
      setError({
        title: "Unable to load overview",
        message: "Please refresh or try again later.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const kpiValues = useMemo(() => {
    if (!overview) return [];
    return KPI_LABELS.map((item) => {
      const raw = overview.kpis[item.key as keyof OverviewResponse["kpis"]] ?? 0;
      if (item.key === "pipelineValue") {
        return { label: item.label, value: formatUsd(raw as number) };
      }
      if (item.key === "conversionRate") {
        return { label: item.label, value: `${Number(raw).toFixed(1)}%` };
      }
      return { label: item.label, value: String(raw) };
    });
  }, [overview]);

  const pipelineStages = overview?.pipelineStages || [];
  const topOwners = overview?.topOwners || [];
  const recentActivity = overview?.recentActivity || [];

  return (
    <div className="w-full">
      {error && (
        <div
          className="card"
          style={{
            borderRadius: 14,
            padding: 16,
            border: "1px solid rgba(239,68,68,0.35)",
            background: isDark ? "rgba(127,29,29,0.2)" : "rgba(254,226,226,0.6)",
            color: isDark ? "#fecaca" : "#991b1b",
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          <div style={{ fontWeight: 700 }}>{error.title}</div>
          <div style={{ fontSize: 13, opacity: 0.9 }}>{error.message}</div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 style={{ fontSize: 20, fontWeight: 700 }}>Overview</h3>
          <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>
            Live sales performance synced from Firestore.
          </p>
        </div>
        <button className="btn" onClick={loadOverview} style={{ borderRadius: 999 }}>
          Refresh
        </button>
      </div>

      <div className="kpis" style={{ marginTop: 18 }}>
        {kpiValues.map((kpi) => (
          <KpiCard key={kpi.label} title={kpi.label} value={loading ? "—" : kpi.value} />
        ))}
      </div>

      <section className="grid" style={{ marginTop: 20, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <div className="card" style={{ padding: 18, borderRadius: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Pipeline by Stage</div>
          <div className="space-y-3">
            {pipelineStages.length === 0 && (
              <div style={{ fontSize: 13, opacity: 0.7 }}>No pipeline stages available.</div>
            )}
            {pipelineStages.map((stage) => (
              <div key={stage.stage} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span>{stage.stage}</span>
                <span style={{ fontWeight: 600 }}>
                  {stage.count} · {formatUsd(stage.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: 18, borderRadius: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Top Sales Owners</div>
          <div className="space-y-3">
            {topOwners.length === 0 && (
              <div style={{ fontSize: 13, opacity: 0.7 }}>No owners available.</div>
            )}
            {topOwners.map((owner) => (
              <div key={owner.ownerName} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span>{owner.ownerName || "Unassigned"}</span>
                <span style={{ fontWeight: 600 }}>
                  {owner.deals} · {formatUsd(owner.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: 18, borderRadius: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Recent Sales Activity</div>
          <div className="space-y-3">
            {recentActivity.length === 0 && (
              <div style={{ fontSize: 13, opacity: 0.7 }}>No recent activity found.</div>
            )}
            {recentActivity.map((item) => (
              <div key={item.id} style={{ display: "grid", gap: 4, fontSize: 13 }}>
                <div style={{ fontWeight: 600 }}>{item.title}</div>
                <div style={{ opacity: 0.75 }}>{item.description}</div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>{formatDateTime(item.createdAt)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function KpiCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="card kpi-card" style={{ padding: 18, borderRadius: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{value}</div>
    </div>
  );
}
