"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatDateTime,
  formatPkr,
  formatUsd,
  useInterval,
  useIsSystemDark,
} from "@/components/finance/financeUtils";
import type { FinanceOverview } from "@/lib/finance/types";

const emptyOverview: FinanceOverview = {
  kpisUsd: {
    totalRevenueMonth: 0,
    outstandingInvoices: 0,
    paymentsReceivedMonth: 0,
    agingBuckets: {
      bucket0to30: 0,
      bucket31to60: 0,
      bucket61to90: 0,
      bucket90plus: 0,
    },
  },
  kpisPkr: {
    payrollDueMonth: 0,
    expensesMonth: 0,
  },
  revenueSeries: [],
  expenseBreakdown: [],
  recentEvents: [],
};

export default function FinanceOverviewPage() {
  const isDark = useIsSystemDark();
  const [overview, setOverview] = useState<FinanceOverview>(emptyOverview);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/admin/finance/overview", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to load finance overview.");
      }
      setOverview(data.overview as FinanceOverview);
    } catch (err: any) {
      console.error("Finance overview load error", err);
      setError("Unable to load finance overview right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useInterval(() => {
    loadOverview();
  }, 30000);

  const agingRows = useMemo(
    () => [
      { label: "0-30 days", value: overview.kpisUsd.agingBuckets.bucket0to30 },
      { label: "31-60 days", value: overview.kpisUsd.agingBuckets.bucket31to60 },
      { label: "61-90 days", value: overview.kpisUsd.agingBuckets.bucket61to90 },
      { label: "90+ days", value: overview.kpisUsd.agingBuckets.bucket90plus },
    ],
    [overview.kpisUsd.agingBuckets]
  );

  return (
    <div className="space-y-6">
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
          }}
        >
          {error}
        </div>
      )}

      <section>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>USD Performance</div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            isDark={isDark}
            title="Total Revenue (This Month)"
            value={formatUsd(overview.kpisUsd.totalRevenueMonth)}
            subtitle="Paid invoices"
          />
          <KpiCard
            isDark={isDark}
            title="Outstanding Invoices"
            value={formatUsd(overview.kpisUsd.outstandingInvoices)}
            subtitle="Sent / overdue"
          />
          <KpiCard
            isDark={isDark}
            title="Payments Received"
            value={formatUsd(overview.kpisUsd.paymentsReceivedMonth)}
            subtitle="This month"
          />
          <KpiCard
            isDark={isDark}
            title="AR Aging"
            value={formatUsd(
              overview.kpisUsd.agingBuckets.bucket0to30 +
                overview.kpisUsd.agingBuckets.bucket31to60 +
                overview.kpisUsd.agingBuckets.bucket61to90 +
                overview.kpisUsd.agingBuckets.bucket90plus
            )}
            subtitle="Total outstanding"
          />
        </div>
      </section>

      <section>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>PKR Performance</div>
        <div className="grid gap-4 md:grid-cols-2">
          <KpiCard
            isDark={isDark}
            title="Payroll Due (This Month)"
            value={formatPkr(overview.kpisPkr.payrollDueMonth)}
            subtitle="Draft / approved"
          />
          <KpiCard
            isDark={isDark}
            title="Expenses (This Month)"
            value={formatPkr(overview.kpisPkr.expensesMonth)}
            subtitle="Operating spend"
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card" style={{ padding: 20, borderRadius: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Revenue vs Payments (USD)</div>
          <div className="space-y-3">
            {(overview.revenueSeries.length ? overview.revenueSeries : [{ label: "-", invoices: 0, payments: 0 }]).map(
              (row) => {
                const max = Math.max(row.invoices, row.payments, 1);
                return (
                  <div key={row.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                      <span>{row.label}</span>
                      <span>{formatUsd(row.payments)}</span>
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      <BarMeter
                        label="Invoices"
                        value={row.invoices}
                        max={max}
                        color={isDark ? "rgba(148,163,184,0.8)" : "rgba(100,116,139,0.6)"}
                      />
                      <BarMeter
                        label="Payments"
                        value={row.payments}
                        max={max}
                        color={isDark ? "rgba(34,197,94,0.7)" : "rgba(22,163,74,0.65)"}
                      />
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>

        <div className="card" style={{ padding: 20, borderRadius: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Expenses Breakdown (PKR)</div>
          <div className="space-y-3">
            {(overview.expenseBreakdown.length ? overview.expenseBreakdown : [{ label: "No expenses", value: 0 }]).map(
              (row) => (
                <div
                  key={row.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.03)",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{row.label}</div>
                  <div style={{ fontWeight: 600 }}>{formatPkr(row.value)}</div>
                </div>
              )
            )}
          </div>
        </div>
      </section>

      <section className="card" style={{ padding: 0, borderRadius: 18, overflow: "hidden" }}>
        <div style={{ padding: 18, fontWeight: 700 }}>Recent Finance Activity</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr style={{ background: isDark ? "rgba(30,30,30,0.9)" : "rgba(248,250,252,0.9)" }}>
                <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700 }}>Event</th>
                <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700 }}>Details</th>
                <th style={{ textAlign: "center", padding: "12px 16px", fontWeight: 700 }}>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} style={{ textAlign: "center", padding: 24 }}>
                    Loading activity…
                  </td>
                </tr>
              ) : overview.recentEvents.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ textAlign: "center", padding: 24 }}>
                    No finance events yet.
                  </td>
                </tr>
              ) : (
                overview.recentEvents.map((event, idx) => {
                  const rowBg = idx % 2 === 0 ? (isDark ? "rgba(255,255,255,0.02)" : "rgba(15,23,42,0.02)") : "transparent";
                  return (
                    <tr key={event.id} style={{ background: rowBg }}>
                      <td style={{ padding: "12px 16px", textAlign: "left" }}>
                        <div style={{ fontWeight: 600 }}>{event.title || event.type}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>{event.type}</div>
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "left" }}>{event.description || "-"}</td>
                      <td style={{ padding: "12px 16px", textAlign: "center" }}>{formatDateTime(event.createdAt)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card" style={{ padding: 20, borderRadius: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>AR Aging Buckets</div>
          <div className="space-y-3">
            {agingRows.map((row) => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{row.label}</span>
                <span style={{ fontWeight: 600 }}>{formatUsd(row.value)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: 20, borderRadius: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Live Sync Status</div>
          <div style={{ fontSize: 14, color: "var(--sidebar-text)" }}>
            Data refreshes every 30 seconds. All finance data is sourced live from Firestore.
          </div>
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  isDark,
}: {
  title: string;
  value: string;
  subtitle: string;
  isDark: boolean;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 18,
        borderRadius: 18,
        border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
        boxShadow: isDark ? "0 18px 40px rgba(0,0,0,0.35)" : "0 18px 40px rgba(15,23,42,0.08)",
        transition: "transform 120ms ease",
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.transform = "translateY(0)")}
    >
      <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.7 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{value}</div>
      <div style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>{subtitle}</div>
    </div>
  );
}

function BarMeter({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>{label}</div>
      <div style={{ background: "rgba(148,163,184,0.15)", borderRadius: 999, height: 8, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}
