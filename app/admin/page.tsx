"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatDateTime, formatPkr, formatUsd, useInterval } from "@/components/finance/financeUtils";
import { CardShell, ErrorCard, KpiCard, MiniBarChart } from "./reports/_components/ReportsUI";

type OverviewResponse = {
  kpis: {
    revenueThisMonthUsd: number;
    revenueYtdUsd: number;
    expensesThisMonthUsdNormalized: number;
    expensesYtdUsdNormalized: number;
    netProfitThisMonthUsd: number;
    netProfitYtdUsd: number;
    profitMarginPct: number;
    outstandingArUsd: number;
    activeProjects: number;
    overdueProjects: number;
    qaQueue: number;
    openChangeRequests: number;
    payrollDuePkr: number;
    expensesThisMonthPkr: number;
    activeEmployees: number;
    onboardingOpen: number;
    newHires30: number;
    totalClients: number;
    keyAccounts: number;
    segmentCoveragePct: number;
    atRiskBlocked: number;
  };
  charts: {
    projectsByStage: Array<{ stage: string; count: number }>;
    arAging: Array<{ bucket: string; amountUsd: number }>;
  };
  tables: {
    recentActivity: Array<{ id: string; type: string; summary: string; actor: string; createdAt?: string | null }>;
  };
};

const emptyOverview: OverviewResponse = {
  kpis: {
    revenueThisMonthUsd: 0,
    revenueYtdUsd: 0,
    expensesThisMonthUsdNormalized: 0,
    expensesYtdUsdNormalized: 0,
    netProfitThisMonthUsd: 0,
    netProfitYtdUsd: 0,
    profitMarginPct: 0,
    outstandingArUsd: 0,
    activeProjects: 0,
    overdueProjects: 0,
    qaQueue: 0,
    openChangeRequests: 0,
    payrollDuePkr: 0,
    expensesThisMonthPkr: 0,
    activeEmployees: 0,
    onboardingOpen: 0,
    newHires30: 0,
    totalClients: 0,
    keyAccounts: 0,
    segmentCoveragePct: 0,
    atRiskBlocked: 0,
  },
  charts: { projectsByStage: [], arAging: [] },
  tables: { recentActivity: [] },
};

export default function AdminOverview() {
  const [overview, setOverview] = useState<OverviewResponse>(emptyOverview);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = async () => {
    try {
      setError(null);
      const res = await fetch("/api/admin/overview", { cache: "no-store", credentials: "include" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (res.status === 403) throw new Error("You do not have access to the admin overview.");
        if (res.status === 401) throw new Error("Please sign in again to view the overview.");
        throw new Error(data?.error || "Unable to load admin overview.");
      }
      setOverview({
        kpis: data.kpis,
        charts: data.charts,
        tables: data.tables,
      });
    } catch (err) {
      console.error("admin overview load error", err);
      setError("Unable to load admin overview right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  useInterval(loadOverview, 30000);

  const stageRows = useMemo(() => {
    if (overview.charts.projectsByStage.length) {
      return overview.charts.projectsByStage.map((row) => ({ label: row.stage, value: row.count }));
    }
    return [{ label: "-", value: 0 }];
  }, [overview.charts.projectsByStage]);

  const arAgingRows = useMemo(() => {
    if (overview.charts.arAging.length) {
      return overview.charts.arAging.map((row) => ({ label: row.bucket, value: row.amountUsd }));
    }
    return [{ label: "-", value: 0 }];
  }, [overview.charts.arAging]);

  const activityRows = useMemo(() => overview.tables.recentActivity, [overview.tables.recentActivity]);
  const profitWarning = overview.kpis.netProfitThisMonthUsd < 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 style={{ fontSize: 26, fontWeight: 700 }}>Overview</h2>
        <p style={{ fontSize: 16, color: "var(--sidebar-text)", marginTop: 6 }}>
          Company-wide analytics, KPIs, and recent activity synced in real time.
        </p>
      </div>

      {error && <ErrorCard message={error} />}

      <section>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Revenue vs Expense</div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Revenue (USD)"
            value={loading ? "—" : formatUsd(overview.kpis.revenueThisMonthUsd)}
            subtitle={loading ? "—" : `YTD ${formatUsd(overview.kpis.revenueYtdUsd)}`}
          />
          <KpiCard
            title="Expenses (USD)"
            value={loading ? "—" : formatUsd(overview.kpis.expensesThisMonthUsdNormalized)}
            subtitle={loading ? "—" : `YTD ${formatUsd(overview.kpis.expensesYtdUsdNormalized)}`}
          />
          <KpiCard
            title="Net Profit (USD)"
            value={loading ? "—" : formatUsd(overview.kpis.netProfitThisMonthUsd)}
            subtitle={loading ? "—" : `YTD ${formatUsd(overview.kpis.netProfitYtdUsd)}`}
            tone={profitWarning ? "warning" : undefined}
          />
          <KpiCard
            title="Profit Margin % (MTD)"
            value={loading ? "—" : `${overview.kpis.profitMarginPct}%`}
            subtitle="Margin on month-to-date revenue"
            tone={profitWarning ? "warning" : undefined}
          />
        </div>
      </section>

      <section>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Executive KPIs</div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <KpiCard
            title="Revenue (This Month, USD)"
            value={loading ? "—" : formatUsd(overview.kpis.revenueThisMonthUsd)}
            subtitle="Paid this month"
          />
          <KpiCard
            title="Outstanding AR (USD)"
            value={loading ? "—" : formatUsd(overview.kpis.outstandingArUsd)}
            subtitle="Open invoices"
          />
          <KpiCard
            title="Active Projects"
            value={loading ? "—" : `${overview.kpis.activeProjects}`}
            subtitle="Not delivered"
          />
          <KpiCard
            title="Overdue Projects"
            value={loading ? "—" : `${overview.kpis.overdueProjects}`}
            subtitle="Past due"
          />
          <KpiCard title="QA Queue" value={loading ? "—" : `${overview.kpis.qaQueue}`} subtitle="Final stage" />
          <KpiCard
            title="Open Change Requests"
            value={loading ? "—" : `${overview.kpis.openChangeRequests}`}
            subtitle="Pending approval"
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <CardShell>
          <div className="flex items-center justify-between gap-3" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 700 }}>Operations Snapshot</div>
            <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>Live project flow</div>
          </div>
          <MiniBarChart rows={stageRows} />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="card" style={{ padding: 14, borderRadius: 12, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>At-Risk / Blocked</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>
                {loading ? "—" : overview.kpis.atRiskBlocked}
              </div>
            </div>
            <div className="card" style={{ padding: 14, borderRadius: 12, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>QA Queue</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>
                {loading ? "—" : overview.kpis.qaQueue}
              </div>
            </div>
          </div>
        </CardShell>

        <CardShell>
          <div className="flex items-center justify-between gap-3" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 700 }}>Finance Snapshot</div>
            <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>AR aging + PKR obligations</div>
          </div>
          <MiniBarChart rows={arAgingRows} valueFormatter={(value) => formatUsd(value)} />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="card" style={{ padding: 14, borderRadius: 12, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>Payroll Due (PKR)</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>
                {loading ? "—" : formatPkr(overview.kpis.payrollDuePkr)}
              </div>
            </div>
            <div className="card" style={{ padding: 14, borderRadius: 12, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>Expenses This Month (PKR)</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>
                {loading ? "—" : formatPkr(overview.kpis.expensesThisMonthPkr)}
              </div>
            </div>
          </div>
        </CardShell>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <CardShell>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>People Snapshot</div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>Active Employees</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>
                {loading ? "—" : overview.kpis.activeEmployees}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>Open Onboarding</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>
                {loading ? "—" : overview.kpis.onboardingOpen}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>New Hires (30d)</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{loading ? "—" : overview.kpis.newHires30}</div>
            </div>
          </div>
        </CardShell>

        <CardShell>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Clients Snapshot</div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>Total Clients</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>
                {loading ? "—" : overview.kpis.totalClients}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>Key Accounts (≥ $1,000)</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{loading ? "—" : overview.kpis.keyAccounts}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>Segment Coverage</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>
                {loading ? "—" : `${overview.kpis.segmentCoveragePct}%`}
              </div>
            </div>
          </div>
        </CardShell>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Recent Activity</div>
            <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>
              Live feed across projects, production, finance, and HR.
            </p>
          </div>
          <button className="btn" onClick={loadOverview} style={{ borderRadius: 999 }}>
            Refresh
          </button>
        </div>

        <div className="table-shell" style={{ marginTop: 20 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Summary</th>
                  <th>Actor</th>
                  <th className="table-cell-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="table-empty">
                      Loading activity…
                    </td>
                  </tr>
                ) : activityRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="table-empty">
                      No activity found.
                    </td>
                  </tr>
                ) : (
                  activityRows.map((event) => (
                    <tr key={event.id}>
                      <td>{event.type || "-"}</td>
                      <td>{event.summary || "-"}</td>
                      <td>{event.actor || "-"}</td>
                      <td className="table-cell-right">{formatDateTime(event.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Quick Actions</div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Link href="/admin/projects" className="btn" style={{ borderRadius: 12, textAlign: "center" }}>
            Create Project
          </Link>
          <Link href="/admin/finance" className="btn" style={{ borderRadius: 12, textAlign: "center" }}>
            Create Invoice
          </Link>
          <Link href="/admin/hr/onboarding" className="btn" style={{ borderRadius: 12, textAlign: "center" }}>
            Assign Onboarding
          </Link>
          <Link href="/admin/projects/pipeline" className="btn" style={{ borderRadius: 12, textAlign: "center" }}>
            Open Delivery Pipeline
          </Link>
        </div>
      </section>
    </div>
  );
}
