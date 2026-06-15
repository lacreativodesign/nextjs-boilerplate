"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDateTime, formatUsd, useInterval } from "@/components/finance/financeUtils";
import MasterSelect from "@/components/ui/MasterSelect";
import { CardShell, ErrorCard, KpiCard, MiniBarChart } from "./_components/ReportsUI";
import { SmartSearchBar } from "@/components/search/SmartSearchBar";
import { smartMatch } from "@/lib/search/smartMatch";

type OverviewResponse = {
  kpis: {
    revenueThisMonth: number;
    paymentsThisMonth: number;
    outstandingArTotal: number;
    overdueInvoicesCount: number;
  };
  ops: {
    activeProjectsCount: number;
    overdueProjectsCount: number;
    qaQueueCount: number;
    openChangeRequestsCount: number;
  };
  people: {
    activeEmployeesCount: number;
    onboardingOpenCount: number;
  };
  revenueSeries: Array<{ label: string; revenue: number; payments: number }>;
  recentActivity: Array<{ id: string; title: string; description: string; type: string; createdAt?: string | null }>;
};

const emptyOverview: OverviewResponse = {
  kpis: { revenueThisMonth: 0, paymentsThisMonth: 0, outstandingArTotal: 0, overdueInvoicesCount: 0 },
  ops: { activeProjectsCount: 0, overdueProjectsCount: 0, qaQueueCount: 0, openChangeRequestsCount: 0 },
  people: { activeEmployeesCount: 0, onboardingOpenCount: 0 },
  revenueSeries: [],
  recentActivity: [],
};

const activityOptions = [
  { label: "All Activity", value: "" },
  { label: "Finance", value: "finance." },
  { label: "Projects", value: "project." },
  { label: "Production", value: "production." },
  { label: "HR", value: "hr." },
];

export default function ReportsOverviewPage() {
  const [overview, setOverview] = useState<OverviewResponse>(emptyOverview);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activityType, setActivityType] = useState("");
  const [activitySearch, setActivitySearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const loadOverview = async () => {
    try {
      setError(null);
      const res = await fetch("/api/admin/reports/overview", {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (res.status === 403) throw new Error("You do not have access to Admin reports.");
        if (res.status === 401) throw new Error("Please sign in again to view reports.");
        throw new Error(data?.error || "Unable to load reports overview.");
      }
      setOverview(data.overview as OverviewResponse);
    } catch (err: any) {
      console.error("reports overview load error", err);
      setError("Unable to load reports overview right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  useInterval(loadOverview, 30000);

  const filteredActivity = useMemo(() => {
    const list = overview.recentActivity.filter((event) => {
      if (activityType && !event.type.startsWith(activityType)) return false;
      if (dateFrom) {
        const start = new Date(dateFrom).getTime();
        const eventMs = event.createdAt ? new Date(event.createdAt).getTime() : 0;
        if (eventMs < start) return false;
      }
      if (dateTo) {
        const end = new Date(dateTo).getTime();
        const eventMs = event.createdAt ? new Date(event.createdAt).getTime() : 0;
        if (eventMs > end) return false;
      }
      return true;
    });
    return smartMatch(list, activitySearch, (event) => [
      event.title,
      event.description,
      event.type,
    ]);
  }, [overview.recentActivity, activityType, activitySearch, dateFrom, dateTo]);

  return (
    <div className="space-y-6">
      {error && <ErrorCard message={error} />}

      <section>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>USD Performance</div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard title="Revenue (This Month)" value={formatUsd(overview.kpis.revenueThisMonth)} subtitle="Paid invoices" />
          <KpiCard title="Payments (This Month)" value={formatUsd(overview.kpis.paymentsThisMonth)} subtitle="Cash received" />
          <KpiCard title="Outstanding AR" value={formatUsd(overview.kpis.outstandingArTotal)} subtitle="Open invoices" />
          <KpiCard title="Overdue Invoices" value={`${overview.kpis.overdueInvoicesCount}`} subtitle="Past due" />
        </div>
      </section>

      <section>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Operations Health</div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard title="Active Projects" value={`${overview.ops.activeProjectsCount}`} subtitle="In flight" />
          <KpiCard title="Overdue Projects" value={`${overview.ops.overdueProjectsCount}`} subtitle="Needs attention" />
          <KpiCard title="QA Queue" value={`${overview.ops.qaQueueCount}`} subtitle="Final stage" />
          <KpiCard title="Open Change Requests" value={`${overview.ops.openChangeRequestsCount}`} subtitle="Pending" />
        </div>
      </section>

      <section>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>People & HR</div>
        <div className="grid gap-4 md:grid-cols-2">
          <KpiCard title="Active Employees" value={`${overview.people.activeEmployeesCount}`} subtitle="Current users" />
          <KpiCard title="Onboarding Open" value={`${overview.people.onboardingOpenCount}`} subtitle="In progress" />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <CardShell>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Revenue vs Payments (USD)</div>
          <MiniBarChart
            rows={(overview.revenueSeries.length ? overview.revenueSeries : [{ label: "-", revenue: 0, payments: 0 }]).map(
              (row) => ({
                label: row.label,
                value: row.revenue,
              })
            )}
            valueFormatter={(value) => formatUsd(value)}
          />
        </CardShell>
        <CardShell>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Payments Collected (USD)</div>
          <MiniBarChart
            rows={(overview.revenueSeries.length ? overview.revenueSeries : [{ label: "-", revenue: 0, payments: 0 }]).map(
              (row) => ({
                label: row.label,
                value: row.payments,
              })
            )}
            valueFormatter={(value) => formatUsd(value)}
          />
        </CardShell>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Recent Activity</div>
            <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>Live feed across finance, projects, production, and HR.</p>
          </div>
          <button className="btn" onClick={loadOverview} style={{ borderRadius: 999 }}>
            Refresh
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <div style={{ flex: "1 1 200px", minWidth: 200 }}>
            <SmartSearchBar value={activitySearch} onChange={setActivitySearch} />
          </div>
          <MasterSelect value={activityType} onChange={setActivityType} options={activityOptions} />
          <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setActivitySearch("");
              setActivityType("");
              setDateFrom("");
              setDateTo("");
            }}
            style={{ borderRadius: 999 }}
          >
            Reset Filters
          </button>
        </div>

        <div className="table-shell" style={{ marginTop: 20 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>Details</th>
                  <th className="table-cell-right">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={3} className="table-empty">
                      Loading activity…
                    </td>
                  </tr>
                ) : filteredActivity.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="table-empty">
                      No activity found.
                    </td>
                  </tr>
                ) : (
                  filteredActivity.map((event) => (
                    <tr key={event.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{event.title || "Activity"}</div>
                        <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>{event.type}</div>
                      </td>
                      <td>{event.description || "-"}</td>
                      <td className="table-cell-right">{formatDateTime(event.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
