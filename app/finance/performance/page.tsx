"use client";

import { useEffect, useState } from "react";
import PeriodSelector from "@/components/performance/PeriodSelector";
import PerformanceCard from "@/components/performance/PerformanceCard";
import { getCurrentPeriod, type PeriodType } from "@/lib/performance/periods";

type FinanceKPIs = {
  revenueThisMonth: number;
  paymentsThisMonth: number;
  outstandingArTotal: number;
  overdueInvoicesCount: number;
};

export default function FinancePerformancePage() {
  const [kpis, setKpis] = useState<FinanceKPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const [period, setPeriod] = useState(getCurrentPeriod("monthly"));
  const [targetLoading, setTargetLoading] = useState(true);
  const [targets, setTargets] = useState<Record<string, { target: number }>>({});
  const [actuals, setActuals] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch("/api/admin/overview", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setKpis(d.kpis);
        else setError(d.error || "Failed to load");
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, []);



  useEffect(() => {
    setPeriod(getCurrentPeriod(periodType));
  }, [periodType]);

  useEffect(() => {
    let active = true;
    setTargetLoading(true);
    Promise.all([
      fetch(`/api/performance/targets?period=${period}&periodType=${periodType}`, { credentials: "include" }).then((r) => r.json()),
      fetch(`/api/performance/actuals?period=${period}&periodType=${periodType}&role=finance`, { credentials: "include" }).then((r) => r.json()),
    ]).then(([t, a]) => {
      if (!active) return;
      setTargets(t.targets?.[0]?.metrics || {});
      setActuals(a.actuals || {});
    }).finally(() => active && setTargetLoading(false));
    return () => { active = false; };
  }, [period, periodType]);
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  const fmt = (n: number) => n.toLocaleString();

  const metrics = kpis
    ? [
        {
          label: "Revenue This Month",
          value: fmtCurrency(kpis.revenueThisMonth),
          sub: "Total invoiced revenue",
        },
        {
          label: "Payments Collected",
          value: fmtCurrency(kpis.paymentsThisMonth),
          sub: "Payments received this month",
        },
        {
          label: "Outstanding AR",
          value: fmtCurrency(kpis.outstandingArTotal),
          sub: "Total accounts receivable",
        },
        {
          label: "Overdue Invoices",
          value: fmt(kpis.overdueInvoicesCount),
          sub: "Invoices past due date",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Finance Performance</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Revenue, collections, and accounts receivable
        </p>
      </div>

            <PeriodSelector period={period} periodType={periodType} onTypeChange={setPeriodType} onPeriodChange={setPeriod} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">My Targets</h2>
        {targetLoading ? <div className="card p-5 animate-pulse h-24" /> : Object.keys(targets).length === 0 ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-800 p-4 text-sm">No targets set for this period.</div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            <PerformanceCard metricKey="invoicesCreated" label="Invoices Created" actual={Number(actuals.invoicesCreated || 0)} target={Number(targets.invoicesCreated?.target || 0)} unit="count" />
            <PerformanceCard metricKey="revenueInvoiced" label="Revenue Invoiced" actual={Number(actuals.revenueInvoiced || 0)} target={Number(targets.revenueInvoiced?.target || 0)} unit="USD" />
          </div>
        )}
      </section>

{error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
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
