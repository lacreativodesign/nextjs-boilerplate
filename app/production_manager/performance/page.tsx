"use client";

import { useEffect, useState } from "react";
import PeriodSelector from "@/components/performance/PeriodSelector";
import ProgressBar from "@/components/performance/ProgressBar";
import { getCurrentPeriod, type PeriodType } from "@/lib/performance/periods";

type PerfData = { openProjects: number; draftsPendingReview: number; revisionsInProgress: number; overdueItems: number };

export default function ProductionManagerPerformancePage() {
  const [data, setData] = useState<PerfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const [period, setPeriod] = useState(getCurrentPeriod("monthly"));
  const [rows, setRows] = useState<unknown[]>([]);

  useEffect(() => {
    fetch("/api/production_manager/overview", { credentials: "include" }).then((r) => r.json()).then((d) => { if (d.ok) setData(d.workload); else setError(d.error || "Failed to load"); }).catch(() => setError("Network error")).finally(() => setLoading(false));
  }, []);
  useEffect(() => setPeriod(getCurrentPeriod(periodType)), [periodType]);
  useEffect(() => {
    fetch("/api/admin/users/list", { credentials: "include" }).then((r) => r.json()).then(async (d) => {
      const users = (Array.isArray(d) ? d : d.users || []).filter((u: unknown) => (u as Record<string, unknown>).role === "production");
      const next = await Promise.all(users.map(async (u: unknown) => {
        const [t, a] = await Promise.all([
          fetch(`/api/performance/targets?userId=${(u as Record<string, unknown>).uid}&period=${period}&periodType=${periodType}`, { credentials: "include" }).then((r) => r.json()),
          fetch(`/api/performance/actuals?userId=${(u as Record<string, unknown>).uid}&period=${period}&periodType=${periodType}&role=production`, { credentials: "include" }).then((r) => r.json()),
        ]);
        return { user: u, metrics: t.targets?.[0]?.metrics || {}, actuals: a.actuals || {} };
      }));
      setRows(next);
    });
  }, [period, periodType]);

  const fmt = (n: number) => n.toLocaleString();
  const metrics = data ? [{ label: "Open Projects", value: fmt(data.openProjects), sub: "Total active projects" }, { label: "Drafts Pending Review", value: fmt(data.draftsPendingReview), sub: "Awaiting review" }, { label: "Revisions In Progress", value: fmt(data.revisionsInProgress), sub: "Currently being revised" }, { label: "Overdue Items", value: fmt(data.overdueItems), sub: "Past due date" }] : [];

  return <div className="space-y-6"><div><h1 className="text-2xl font-semibold text-[var(--text-primary)]">My Performance</h1><p className="text-sm text-[var(--text-muted)] mt-1">Production workload and delivery status</p></div>
    <PeriodSelector period={period} periodType={periodType} onTypeChange={setPeriodType} onPeriodChange={setPeriod} />
    <section className="card p-4"><h2 className="font-semibold mb-3">Team performance</h2><table className="w-full text-sm"><thead><tr><th className="text-left">Team Member</th><th>Jobs Completed</th><th>Jobs In Progress</th><th /></tr></thead><tbody>{rows.map((row) => { const rowUser = (row as Record<string, unknown>).user as Record<string, unknown>; const rowActuals = (row as Record<string, unknown>).actuals as Record<string, unknown>; const rowMetrics = (row as Record<string, unknown>).metrics as Record<string, unknown>; return <tr key={String(rowUser.uid || "")} className="border-t"><td className="py-3">{String(rowUser.displayName || rowUser.name || rowUser.uid || "")}</td><td><ProgressBar label="Jobs Completed" actual={Number(rowActuals.jobsCompleted || 0)} target={Number((rowMetrics.jobsCompleted as Record<string, unknown> | undefined)?.target || 0)} unit="count" size="sm" /></td><td><ProgressBar label="Jobs In Progress" actual={Number(rowActuals.jobsInProgress || 0)} target={Number((rowMetrics.jobsInProgress as Record<string, unknown> | undefined)?.target || 0)} unit="count" size="sm" /></td><td><button className="btn ghost">Set Targets</button></td></tr>; })}</tbody></table></section>
      {error && <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{loading ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="card p-5 space-y-3"><div className="skeleton h-4 w-32 rounded" /><div className="skeleton h-9 w-24 rounded" /><div className="skeleton h-3 w-40 rounded" /></div>) : metrics.map((m) => <div key={m.label} className="card p-5"><p className="helper-text">{m.label}</p><p className="text-3xl font-bold text-[var(--text-primary)] mt-1">{m.value}</p><p className="text-xs text-[var(--text-muted)] mt-1">{m.sub}</p></div>)}</div></div>;
}
