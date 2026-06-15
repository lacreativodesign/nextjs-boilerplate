"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import PeriodSelector from "@/components/performance/PeriodSelector";
import ProgressBar from "@/components/performance/ProgressBar";
import { getCurrentPeriod, PeriodType } from "@/lib/performance/periods";

type PerfData = { newLeads30d: number; activeDeals: number; closedWonMonth: number; revenueClosed: number; qualifiedLeads: number; avgDiscountPct: number };
type TeamUser = { uid: string; displayName?: string; name?: string; role?: string };

export default function SalesManagerPerformancePage() {
  const [data, setData] = useState<PerfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const [period, setPeriod] = useState(getCurrentPeriod("monthly"));
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [teamRows, setTeamRows] = useState<any[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [form, setForm] = useState({ leadsCreated: "", dealsClosed: "", revenueGenerated: "" });

  useEffect(() => setPeriod(getCurrentPeriod(periodType)), [periodType]);

  useEffect(() => {
    apiFetch("/api/sales_manager/overview")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setData(d.kpis); else setError(d.error || "Failed to load"); })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let active = true;
    setTeamLoading(true);
    apiFetch("/api/admin/users/list")
      .then((r) => r.json())
      .then(async (list) => {
        const users = (Array.isArray(list) ? list : list.users || []).filter((u: any) => u.role === "sales");
        if (!active) return;
        setTeamUsers(users);
        const rows = await Promise.all(
          users.map(async (u: TeamUser) => {
            const [t, a] = await Promise.all([
              apiFetch(`/api/performance/targets?userId=${u.uid}&period=${period}&periodType=${periodType}`).then((r) => r.json()),
              apiFetch(`/api/performance/actuals?userId=${u.uid}&period=${period}&periodType=${periodType}&role=sales`).then((r) => r.json()),
            ]);
            const metrics = t.targets?.[0]?.metrics || {};
            const actuals = a.actuals || {};
            const percentages = ["leadsCreated", "dealsClosed", "revenueGenerated"].map((key) => {
              const target = Number(metrics[key]?.target || 0);
              if (target <= 0) return 0;
              return (Number(actuals[key] || 0) / target) * 100;
            });
            const overall = percentages.length ? percentages.reduce((s, n) => s + n, 0) / percentages.length : 0;
            return { user: u, metrics, actuals, overall };
          })
        );
        if (!active) return;
        setTeamRows(rows.sort((a, b) => b.overall - a.overall));
      })
      .finally(() => active && setTeamLoading(false));
    return () => {
      active = false;
    };
  }, [period, periodType]);

  const fmt = (n: number) => n.toLocaleString();
  const fmtCurrency = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
  const fmtPct = (n: number) => `${n.toFixed(1)}%`;

  const metrics = data ? [
    { label: "New Leads (30d)", value: fmt(data.newLeads30d), sub: "Leads generated this month" },
    { label: "Qualified Leads", value: fmt(data.qualifiedLeads), sub: "Leads at qualified stage" },
    { label: "Active Deals", value: fmt(data.activeDeals), sub: "Open deals in pipeline" },
    { label: "Closed This Month", value: fmt(data.closedWonMonth), sub: "Won deals this month" },
    { label: "Revenue Closed", value: fmtCurrency(data.revenueClosed), sub: "Total closed value" },
    { label: "Avg Discount", value: fmtPct(data.avgDiscountPct), sub: "Average discount given" },
  ] : [];

  const aggregate = useMemo(() => {
    if (!teamRows.length) return { totalRevenue: 0, avgAchievement: 0, top: "—", bottom: "—" };
    const totalRevenue = teamRows.reduce((sum, row) => sum + Number(row.actuals.revenueGenerated || 0), 0);
    const avgAchievement = teamRows.reduce((sum, row) => sum + Number(row.overall || 0), 0) / teamRows.length;
    return {
      totalRevenue,
      avgAchievement,
      top: teamRows[0]?.user?.displayName || teamRows[0]?.user?.name || "—",
      bottom: teamRows[teamRows.length - 1]?.user?.displayName || teamRows[teamRows.length - 1]?.user?.name || "—",
    };
  }, [teamRows]);

  async function saveTargets() {
    if (!editingUser) return;
    await apiFetch("/api/performance/targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: editingUser,
        period,
        periodType,
        metrics: {
          leadsCreated: { label: "Leads Created", target: Number(form.leadsCreated || 0), unit: "count" },
          dealsClosed: { label: "Deals Closed", target: Number(form.dealsClosed || 0), unit: "count" },
          revenueGenerated: { label: "Revenue Generated", target: Number(form.revenueGenerated || 0), unit: "USD" },
        },
      }),
    });
    setEditingUser(null);
    setForm({ leadsCreated: "", dealsClosed: "", revenueGenerated: "" });
    setPeriod((p) => p);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">My Performance</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">Sales metrics and pipeline health</p>
      </div>

      <PeriodSelector period={period} periodType={periodType} onTypeChange={setPeriodType} onPeriodChange={setPeriod} />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Team Performance</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="card p-4"><p className="text-xs text-[var(--text-muted)]">Team Total Revenue</p><p className="text-xl font-bold">{fmtCurrency(aggregate.totalRevenue)}</p></div>
          <div className="card p-4"><p className="text-xs text-[var(--text-muted)]">Team Average Achievement</p><p className="text-xl font-bold">{aggregate.avgAchievement.toFixed(1)}%</p></div>
          <div className="card p-4"><p className="text-xs text-[var(--text-muted)]">Top Performer</p><p className="text-xl font-bold">{aggregate.top}</p></div>
          <div className="card p-4"><p className="text-xs text-[var(--text-muted)]">Needs Attention</p><p className="text-xl font-bold">{aggregate.bottom}</p></div>
        </div>

        {teamLoading ? <div className="card p-6 animate-pulse h-40" /> : (
          <div className="card p-4 overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[var(--text-muted)]"><th>Team Member</th><th>Leads</th><th>Deals</th><th>Revenue</th><th>Overall %</th><th /></tr></thead>
              <tbody>
                {teamRows.map((row) => (
                  <tr key={row.user.uid} className="border-t border-[var(--border-subtle)] align-top">
                    <td className="py-3">{row.user.displayName || row.user.name || row.user.uid}</td>
                    <td className="py-3 min-w-44"><ProgressBar label="Leads" actual={Number(row.actuals.leadsCreated || 0)} target={Number(row.metrics.leadsCreated?.target || 0)} unit="count" size="sm" /></td>
                    <td className="py-3 min-w-44"><ProgressBar label="Deals" actual={Number(row.actuals.dealsClosed || 0)} target={Number(row.metrics.dealsClosed?.target || 0)} unit="count" size="sm" /></td>
                    <td className="py-3 min-w-44"><ProgressBar label="Revenue" actual={Number(row.actuals.revenueGenerated || 0)} target={Number(row.metrics.revenueGenerated?.target || 0)} unit="USD" size="sm" /></td>
                    <td className="py-3">{Number(row.overall || 0).toFixed(1)}%</td>
                    <td className="py-3"><button className="btn ghost" onClick={() => setEditingUser(row.user.uid)}>Set Targets</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editingUser && (
        <div className="drawer-overlay" onClick={() => setEditingUser(null)}>
          <div className="drawer-panel drawer-panel--sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-3">Set Targets</h3>
            <div className="space-y-3">
              <input className="input w-full" type="number" placeholder="Leads target" value={form.leadsCreated} onChange={(e) => setForm((p) => ({ ...p, leadsCreated: e.target.value }))} />
              <input className="input w-full" type="number" placeholder="Deals target" value={form.dealsClosed} onChange={(e) => setForm((p) => ({ ...p, dealsClosed: e.target.value }))} />
              <input className="input w-full" type="number" placeholder="Revenue target" value={form.revenueGenerated} onChange={(e) => setForm((p) => ({ ...p, revenueGenerated: e.target.value }))} />
              <button className="btn w-full" onClick={saveTargets}>Save</button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="card p-5 space-y-3"><div className="skeleton h-4 w-32 rounded" /><div className="skeleton h-9 w-24 rounded" /><div className="skeleton h-3 w-40 rounded" /></div>) : metrics.map((m) => <div key={m.label} className="card p-5"><p className="helper-text">{m.label}</p><p className="text-3xl font-bold text-[var(--text-primary)] mt-1">{m.value}</p><p className="text-xs text-[var(--text-muted)] mt-1">{m.sub}</p></div>)}
      </div>
    </div>
  );
}
