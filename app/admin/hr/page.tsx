"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDateTime, useInterval } from "@/components/finance/financeUtils";

type HrOverview = {
  kpis: {
    totalEmployees: number;
    activeEmployees: number;
    newHires: number;
    openOnboarding: number;
    attendance7d: number;
    documents: number;
  };
  onboardingStatus: Record<string, number>;
  recentActivity: {
    id: string;
    type: string;
    title: string;
    description: string;
    createdAt: string | null;
    createdByName?: string | null;
  }[];
};

const emptyOverview: HrOverview = {
  kpis: {
    totalEmployees: 0,
    activeEmployees: 0,
    newHires: 0,
    openOnboarding: 0,
    attendance7d: 0,
    documents: 0,
  },
  onboardingStatus: { "Not Started": 0, "In Progress": 0, Completed: 0 },
  recentActivity: [],
};

export default function HrOverviewPage() {
    const [overview, setOverview] = useState<HrOverview>(emptyOverview);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/admin/hr/overview", {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to load HR overview.");
      }
      setOverview(data.overview as HrOverview);
    } catch (err) {
      console.error("HR overview load error", err);
      setError("Unable to load HR overview right now.");
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

  const onboardingRows = useMemo(
    () => [
      { label: "Not Started", value: overview.onboardingStatus["Not Started"] || 0 },
      { label: "In Progress", value: overview.onboardingStatus["In Progress"] || 0 },
      { label: "Completed", value: overview.onboardingStatus.Completed || 0 },
    ],
    [overview.onboardingStatus]
  );

  return (
    <div className="space-y-6">
      {error && (
        <div
          className="card"
          style={{
            padding: 16,
            borderRadius: 16,
            border: "1px solid rgba(248,113,113,0.35)",
            background: "var(--danger-soft)",
            color: "var(--danger)",
          }}
        >
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <KpiCard title="Total Employees" value={overview.kpis.totalEmployees} subtitle="All active records" />
        <KpiCard title="Active" value={overview.kpis.activeEmployees} subtitle="Currently enabled" />
        <KpiCard title="New Hires (30d)" value={overview.kpis.newHires} subtitle="Last 30 days" />
        <KpiCard title="Open Onboarding" value={overview.kpis.openOnboarding} subtitle="In progress" />
        <KpiCard title="Attendance (7d)" value={overview.kpis.attendance7d} subtitle="Unique employees" />
        <KpiCard title="Documents" value={overview.kpis.documents} subtitle="Active files" />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="card" style={{ padding: 0, borderRadius: 18, overflow: "hidden" }}>
          <div style={{ padding: 18, fontWeight: 700 }}>Recent HR Activity</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead>
                <tr style={{ background: "var(--table-header-bg)" }}>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700 }}>Event</th>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700 }}>Details</th>
                  <th style={{ textAlign: "right", padding: "12px 16px", fontWeight: 700 }}>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center", padding: 24 }}>
                      Loading activity…
                    </td>
                  </tr>
                ) : overview.recentActivity.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center", padding: 24 }}>
                      No HR events yet.
                    </td>
                  </tr>
                ) : (
                  overview.recentActivity.map((event) => {

                    return (
                      <tr key={event.id}>
                        <td style={{ padding: "12px 16px", textAlign: "left" }}>
                          <div style={{ fontWeight: 600 }}>{event.title || event.type}</div>
                          <div style={{ fontSize: 12, opacity: 0.7 }}>{event.type}</div>
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "left" }}>{event.description || "-"}</td>
                        <td style={{ padding: "12px 16px", textAlign: "right" }}>{formatDateTime(event.createdAt)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ padding: 20, borderRadius: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Onboarding Progress</div>
          <div className="space-y-3">
            {onboardingRows.map((row) => (
              <div
                key={row.label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "var(--surface-muted)",
                }}
              >
                <div style={{ fontWeight: 600 }}>{row.label}</div>
                <div style={{ fontWeight: 600 }}>{row.value}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 13, color: "var(--sidebar-text)", marginTop: 14 }}>
            Data refreshes every 30 seconds. Attendance snapshot uses the last 7 days.
          </div>
        </div>
      </section>
    </div>
  );
}

function KpiCard({ title, value, subtitle }: { title: string; value: number; subtitle: string }) {
  return (
    <div className="card kpi-card" style={{ padding: 18, borderRadius: 18 }}>
      <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-muted)" }}>
        {title}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>{value}</div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>{subtitle}</div>
    </div>
  );
}
