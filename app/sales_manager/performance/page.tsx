"use client";

import { useEffect, useState } from "react";

type PerfData = {
  newLeads30d: number;
  activeDeals: number;
  closedWonMonth: number;
  revenueClosed: number;
  qualifiedLeads: number;
  avgDiscountPct: number;
};

export default function SalesManagerPerformancePage() {
  const [data, setData] = useState<PerfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sales_manager/overview", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setData(d.kpis);
        else setError(d.error || "Failed to load");
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) => n.toLocaleString();
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  const fmtPct = (n: number) => `${n.toFixed(1)}%`;

  const metrics = data
    ? [
        {
          label: "New Leads (30d)",
          value: fmt(data.newLeads30d),
          sub: "Leads generated this month",
        },
        {
          label: "Qualified Leads",
          value: fmt(data.qualifiedLeads),
          sub: "Leads at qualified stage",
        },
        {
          label: "Active Deals",
          value: fmt(data.activeDeals),
          sub: "Open deals in pipeline",
        },
        {
          label: "Closed This Month",
          value: fmt(data.closedWonMonth),
          sub: "Won deals this month",
        },
        {
          label: "Revenue Closed",
          value: fmtCurrency(data.revenueClosed),
          sub: "Total closed value",
        },
        {
          label: "Avg Discount",
          value: fmtPct(data.avgDiscountPct),
          sub: "Average discount given",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">My Performance</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">Sales metrics and pipeline health</p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card p-5 space-y-3">
                <div className="skeleton h-4 w-32 rounded" />
                <div className="skeleton h-9 w-24 rounded" />
                <div className="skeleton h-3 w-40 rounded" />
              </div>
            ))
          : metrics.map((m) => (
              <div key={m.label} className="card p-5">
                <p className="helper-text">{m.label}</p>
                <p className="text-3xl font-bold text-[var(--text-primary)] mt-1">{m.value}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">{m.sub}</p>
              </div>
            ))}
      </div>
    </div>
  );
}
