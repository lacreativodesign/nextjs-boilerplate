"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { formatUsd } from "@/components/finance/financeUtils";
import { useIsDarkMode } from "@/lib/useIsDarkMode";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  CHART_COLORS,
  chartAxisProps,
  chartGridProps,
  chartTooltipProps,
  useChartAnimation,
} from "@/components/charts/ChartContainer";

const KPI_LABELS = [
  { key: "totalLeads", label: "Total Leads" },
  { key: "qualified", label: "Qualified" },
  { key: "activeDeals", label: "Active Deals" },
  { key: "closedWonCount", label: "Closed Won Count" },
  { key: "closedWonRevenueMtd", label: "Closed Won Revenue (MTD)" },
  { key: "followUpsDueToday", label: "Follow-Ups Due Today" },
  { key: "conversionRate", label: "Conversion Rate" },
  { key: "aov", label: "AOV" },
  { key: "pipelineValue", label: "Pipeline Value" },
];

type OverviewResponse = {
  ok: boolean;
  canCreate: boolean;
  kpis: {
    totalLeads: number;
    qualified: number;
    activeDeals: number;
    closedWonCount: number;
    closedWonRevenueMtd: number;
    followUpsDueToday: number;
    conversionRate: number;
    aov: number;
    pipelineValue: number;
  };
  charts: {
    leadsByStage: Array<{ stage: string; count: number }>;
    leadsByDisposition: Array<{ disposition: string; count: number }>;
    closedWonRevenueByDay: Array<{ day: string; value: number }>;
  };
  targets: {
    targetUsdMonthly: number;
    monthToDateRevenueUsd: number;
    remainingTargetUsd: number;
    requiredPerDayUsd: number;
  };
  teamBenchmark: {
    topPerformerRevenueMtd: number;
    myRevenueMtd: number;
  };
};

type ErrorState = { title: string; message: string };

export default function SalesOverviewPage() {
  const isDark = useIsDarkMode();
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const chartAnimation = useChartAnimation();

  const loadOverview = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch("/api/sales/overview", { cache: "no-store", credentials: "include" });
      const data = (await res.json()) as OverviewResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to load sales overview.");
      }
      setOverview(data);
    } catch (err: any) {
      console.error("Sales overview error", err);
      setError({
        title: "Unable to load overview",
        message: err?.message || "Please refresh or try again later.",
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
      if (item.key === "pipelineValue" || item.key === "closedWonRevenueMtd" || item.key === "aov") {
        return { label: item.label, value: formatUsd(raw as number) };
      }
      if (item.key === "conversionRate") {
        return { label: item.label, value: `${Number(raw).toFixed(1)}%` };
      }
      return { label: item.label, value: String(raw) };
    });
  }, [overview]);

  const target = overview?.targets || null;
  const progressPct = target?.targetUsdMonthly ? (target.monthToDateRevenueUsd / target.targetUsdMonthly) * 100 : 0;

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
            Sales momentum and pipeline health for your owned leads and deals.
          </p>
        </div>
        <button className="btn" onClick={loadOverview} style={{ borderRadius: 999 }}>
          Refresh
        </button>
      </div>

      <div className="grid gap-4" style={{ marginTop: 18, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        {kpiValues.map((kpi) => (
          <div key={kpi.label} className="card" style={{ padding: 18, borderRadius: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>{kpi.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>
              {loading ? <Skeleton variant="text" className="h-6 w-24" /> : kpi.value}
            </div>
          </div>
        ))}
      </div>

      <section className="grid" style={{ marginTop: 20, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <ChartContainer
          title="Leads by Stage"
          description="Pipeline balance across active stages."
          isLoading={loading}
          isEmpty={!overview?.charts.leadsByStage.length}
          height={220}
        >
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={overview?.charts.leadsByStage || []}
                  dataKey="count"
                  nameKey="stage"
                  innerRadius={60}
                  outerRadius={90}
                  stroke="var(--surface-card)"
                  {...chartAnimation}
                >
                  {(overview?.charts.leadsByStage || []).map((entry, index) => (
                    <Cell key={`cell-${entry.stage}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip {...chartTooltipProps} formatter={(value: number) => value} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartContainer>
        <ChartContainer
          title="Leads by Disposition (30d)"
          description="Disposition outcomes over the last 30 days."
          isLoading={loading}
          isEmpty={!overview?.charts.leadsByDisposition.length}
          height={220}
        >
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={overview?.charts.leadsByDisposition || []}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="disposition" hide {...chartAxisProps} />
                <YAxis {...chartAxisProps} />
                <Tooltip {...chartTooltipProps} formatter={(value: number) => value} />
                <Bar
                  dataKey="count"
                  fill="var(--chart-series-1)"
                  radius={[6, 6, 0, 0]}
                  {...chartAnimation}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartContainer>
        <ChartContainer
          title="Closed Won Revenue (MTD)"
          description="Daily revenue trend for closed-won deals."
          isLoading={loading}
          isEmpty={!overview?.charts.closedWonRevenueByDay.length}
          height={220}
        >
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={overview?.charts.closedWonRevenueByDay || []}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="day" hide {...chartAxisProps} />
                <YAxis {...chartAxisProps} />
                <Tooltip {...chartTooltipProps} formatter={(value: number) => formatUsd(value)} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--chart-series-2)"
                  strokeWidth={2}
                  dot={false}
                  {...chartAnimation}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartContainer>
      </section>

      {target && (
        <section className="grid" style={{ marginTop: 20, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          <div className="card" style={{ padding: 18, borderRadius: 18 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Target Cockpit</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Monthly target vs progress</div>
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span>Target</span>
                <strong>{formatUsd(target.targetUsdMonthly)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 6 }}>
                <span>MTD Revenue</span>
                <strong>{formatUsd(target.monthToDateRevenueUsd)}</strong>
              </div>
              <div style={{ height: 10, borderRadius: 999, background: "var(--chart-track)", marginTop: 12 }}>
                <div
                  style={{
                    height: "100%",
                    borderRadius: 999,
                    width: `${Math.min(progressPct, 100)}%`,
                    background: "var(--chart-fill)",
                  }}
                />
              </div>
              <div style={{ fontSize: 12, marginTop: 10, color: "var(--text-muted)" }}>
                Remaining: {formatUsd(target.remainingTargetUsd)} · Required per day: {formatUsd(target.requiredPerDayUsd)}
              </div>
            </div>
          </div>
          <div className="card" style={{ padding: 18, borderRadius: 18 }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Team Benchmark</div>
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span>Top Performer (MTD)</span>
                <strong>{formatUsd(overview?.teamBenchmark.topPerformerRevenueMtd || 0)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span>My Revenue (MTD)</span>
                <strong>{formatUsd(overview?.teamBenchmark.myRevenueMtd || 0)}</strong>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
