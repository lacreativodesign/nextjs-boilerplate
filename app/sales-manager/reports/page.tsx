"use client";

import { useCallback, useEffect, useState } from "react";
import { CardShell, MiniBarChart } from "@/app/admin/reports/_components/ReportsUI";
import { useIsDarkMode } from "@/lib/useIsDarkMode";

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

type ReportResponse = {
  ok: boolean;
  leadSources: Array<{ label: string; value: number }>;
  winLoss: { won: number; lost: number; ratio: number };
  agingBuckets: Array<{ label: string; value: number }>;
};

export default function SalesManagerReportsPage() {
  const isDark = useIsDarkMode();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReportResponse | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sales-manager/reports/summary", { cache: "no-store" });
      const json = (await res.json()) as ReportResponse;
      if (!res.ok || !json.ok) {
        throw new Error(json?.ok ? "" : "Unable to load reports");
      }
      setData(json);
    } catch (err: any) {
      setError(err?.message || "Unable to load reports.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleExport = async () => {
    try {
      const res = await fetch("/api/sales-manager/reports/export", { cache: "no-store" });
      if (!res.ok) throw new Error("Unable to export report.");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "sales-manager-reports.csv";
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed", err);
    }
  };

  return (
    <div style={{ width: "100%" }}>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle" style={{ marginTop: 6 }}>
            Read-only sales summaries across lead sources, win rates, and deal aging.
          </p>
        </div>
        <button className="btn" onClick={handleExport} style={{ borderRadius: 999 }}>
          Export CSV
        </button>
      </div>

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
          {error}
        </div>
      )}

      <section
        className="grid"
        style={{
          marginTop: 10,
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        <CardShell>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Lead Source Performance</div>
          {loading ? (
            <div style={{ fontSize: 13, opacity: 0.7 }}>Loading lead sources...</div>
          ) : data?.leadSources?.length ? (
            <MiniBarChart rows={data.leadSources} />
          ) : (
            <div style={{ fontSize: 13, opacity: 0.7 }}>No lead source data available.</div>
          )}
        </CardShell>

        <CardShell>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Win / Loss Ratios</div>
          {loading ? (
            <div style={{ fontSize: 13, opacity: 0.7 }}>Loading outcomes...</div>
          ) : data ? (
            <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Closed Won</span>
                <span style={{ fontWeight: 600 }}>{data.winLoss.won}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Closed Lost</span>
                <span style={{ fontWeight: 600 }}>{data.winLoss.lost}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Win Rate</span>
                <span style={{ fontWeight: 700 }}>{formatPercent(data.winLoss.ratio)}</span>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, opacity: 0.7 }}>No win/loss data available.</div>
          )}
        </CardShell>

        <CardShell>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Deal Aging</div>
          {loading ? (
            <div style={{ fontSize: 13, opacity: 0.7 }}>Loading deal aging...</div>
          ) : data?.agingBuckets?.length ? (
            <MiniBarChart rows={data.agingBuckets} />
          ) : (
            <div style={{ fontSize: 13, opacity: 0.7 }}>No aging data available.</div>
          )}
        </CardShell>
      </section>
    </div>
  );
}
