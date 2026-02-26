"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  ChartContainer,
  chartAxisProps,
  chartGridProps,
  chartTooltipProps,
  useChartAnimation,
} from "@/components/charts/ChartContainer";

type MonthPoint = { month: string; leads: number; closed: number };
type SummaryKPIs = {
  totalLeads: number;
  totalClosed: number;
  conversionRate: string;
  totalRevenue: number;
};

export default function SalesPerformancePage() {
  const chartAnimation = useChartAnimation();
  const [monthlyData, setMonthlyData] = useState<MonthPoint[]>([]);
  const [kpis, setKpis] = useState<SummaryKPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sales_manager/overview", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) {
          setError(d.error || "Failed to load");
          return;
        }

        // Build KPI summary from overview data
        const totalLeads = d.kpis?.newLeads30d ?? 0;
        const totalClosed = d.kpis?.closedWonMonth ?? 0;
        const totalRevenue = d.kpis?.revenueClosed ?? 0;
        const convRate =
          totalLeads > 0
            ? `${Math.round((totalClosed / totalLeads) * 100)}%`
            : "0%";

        setKpis({
          totalLeads,
          totalClosed,
          conversionRate: convRate,
          totalRevenue,
        });

        // Build monthly chart from pipeline stages if available
        if (d.pipelineStages && Array.isArray(d.pipelineStages)) {
          const points: MonthPoint[] = d.pipelineStages.map((s: any) => ({
            month: s.stage ?? s.label ?? "",
            leads: s.count ?? 0,
            closed: s.stage === "Closed Won" ? (s.count ?? 0) : 0,
          }));
          setMonthlyData(points);
        }
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, []);

  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);

  const stats = kpis
    ? [
        { label: "New Leads (30d)", value: kpis.totalLeads.toLocaleString() },
        { label: "Deals Closed", value: kpis.totalClosed.toLocaleString() },
        { label: "Conversion Rate", value: kpis.conversionRate },
        { label: "Revenue Closed", value: fmtCurrency(kpis.totalRevenue) },
      ]
    : [
        { label: "New Leads (30d)", value: "—" },
        { label: "Deals Closed", value: "—" },
        { label: "Conversion Rate", value: "—" },
        { label: "Revenue Closed", value: "—" },
      ];

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-bold">Sales Performance</h1>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((s, idx) => (
          <div key={idx} className="card p-5">
            <p className="helper-text">{s.label}</p>
            {loading ? (
              <div className="skeleton h-8 w-24 rounded mt-2" />
            ) : (
              <p className="text-2xl font-semibold mt-2 text-[var(--text-primary)]">
                {s.value}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Pipeline Stage Chart */}
      {!loading && monthlyData.length > 0 && (
        <ChartContainer title="Pipeline by Stage">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyData} {...chartAnimation}>
              <CartesianGrid {...chartGridProps} />
              <XAxis dataKey="month" {...chartAxisProps} />
              <YAxis {...chartAxisProps} />
              <Tooltip {...chartTooltipProps} />
              <Bar
                dataKey="leads"
                name="Leads"
                fill="var(--erp-blue)"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="closed"
                name="Closed Won"
                fill="#10b981"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      )}

      {!loading && monthlyData.length === 0 && !error && (
        <div className="card p-8 text-center text-[var(--text-muted)] text-sm">
          No pipeline data available yet.
        </div>
      )}
    </div>
  );
}
