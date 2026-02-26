"use client";

import { useEffect, useState } from "react";

type SalesStats = {
  newLeads30d: number;
  activeDeals: number;
  revenueClosed: number;
  closedWonMonth: number;
};

export default function ReportsSalesPage() {
  const [stats, setStats] = useState<SalesStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sales_manager/overview", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setStats(d.kpis);
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

  const cards = [
    { label: "New Leads (30d)", value: stats ? fmt(stats.newLeads30d) : "—" },
    { label: "Active Deals", value: stats ? fmt(stats.activeDeals) : "—" },
    { label: "Revenue Closed", value: stats ? fmtCurrency(stats.revenueClosed) : "—" },
    { label: "Closed This Month", value: stats ? fmt(stats.closedWonMonth) : "—" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Sales Reports</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Pipeline performance, lead conversion, and revenue tracking.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5"
          >
            <p className="text-sm text-[var(--text-muted)]">{c.label}</p>
            {loading ? (
              <div className="skeleton mt-2 h-9 w-20 rounded" />
            ) : (
              <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{c.value}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
