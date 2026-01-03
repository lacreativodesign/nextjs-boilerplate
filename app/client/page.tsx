// app/client/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type OverviewPayload = {
  ok: boolean;
  kpis: {
    activeProjects: number;
    inReview: number;
    openChangeRequests: number;
    outstandingInvoicesUsd: number;
  };
  recentUpdates: Array<{
    id: string;
    title: string;
    body: string;
    type: string;
    deepLink: string | null;
    createdAt: string | null;
    isRead: boolean;
  }>;
};

function useIsSystemDark() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const read = () => setIsDark(!!mql.matches);
    read();
    // @ts-expect-error older browsers
    mql.addEventListener ? mql.addEventListener("change", read) : mql.addListener(read);
    return () => {
      // @ts-expect-error older browsers
      mql.removeEventListener ? mql.removeEventListener("change", read) : mql.removeListener(read);
    };
  }, []);

  return isDark;
}

function fmtMoney(n: number) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(Number(n || 0));
  } catch {
    return `$ ${Number(n || 0).toLocaleString()}`;
  }
}

function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

export default function ClientOverviewPage() {
  const isDark = useIsSystemDark();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OverviewPayload | null>(null);

  const headerCellStyle: React.CSSProperties = {
    padding: "12px 14px",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: isDark ? "rgba(226,232,240,0.66)" : "rgba(15,23,42,0.55)",
    borderBottom: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.10)",
    whiteSpace: "nowrap",
    textAlign: "left",
  };

  const cellStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderBottom: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px dashed rgba(15,23,42,0.10)",
    color: isDark ? "rgba(226,232,240,0.86)" : "rgba(15,23,42,0.85)",
    whiteSpace: "nowrap",
    fontWeight: 400,
  };

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/client/overview", { credentials: "include", cache: "no-store" });
        const payload = (await res.json()) as OverviewPayload;
        if (!res.ok || !payload.ok) throw new Error(payload?.error || "Unable to load overview.");
        if (!alive) return;
        setData(payload);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || "Unable to load overview.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  const kpis = data?.kpis || {
    activeProjects: 0,
    inReview: 0,
    openChangeRequests: 0,
    outstandingInvoicesUsd: 0,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Client Overview</h1>
        <p className="page-subtitle">Track your live projects, invoices, and change requests at a glance.</p>
      </div>

      {error ? <div className="text-red-400 text-sm">{error}</div> : null}

      <div className="kpis">
        <KpiCard label="Active Projects" value={loading ? "—" : `${kpis.activeProjects}`} />
        <KpiCard label="In Review / Awaiting Feedback" value={loading ? "—" : `${kpis.inReview}`} />
        <KpiCard label="Open Change Requests" value={loading ? "—" : `${kpis.openChangeRequests}`} />
        <KpiCard label="Outstanding Invoices (USD)" value={loading ? "—" : fmtMoney(kpis.outstandingInvoicesUsd)} />
      </div>

      <div className="card p-5">
        <div className="page-header" style={{ marginBottom: 12 }}>
          <div>
            <div className="section-title">Recent Updates</div>
            <p className="section-subtitle">Client-scoped alerts and activity from your projects.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/client/projects" className="btn ghost" style={{ borderRadius: 999 }}>
              View Projects
            </Link>
            <Link href="/client/billing" className="btn ghost" style={{ borderRadius: 999 }}>
              View Invoices
            </Link>
            <Link href="/client/change-requests" className="btn" style={{ borderRadius: 999 }}>
              Submit Change Request
            </Link>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr>
                <th style={headerCellStyle}>Update</th>
                <th style={headerCellStyle}>Type</th>
                <th style={{ ...headerCellStyle, textAlign: "center" }}>Status</th>
                <th style={{ ...headerCellStyle, textAlign: "right" }}>Date</th>
                <th style={{ ...headerCellStyle, textAlign: "center" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentUpdates || []).map((item, idx) => {
                const rowBg = isDark
                  ? idx % 2 === 0
                    ? "rgba(255,255,255,0.015)"
                    : "rgba(255,255,255,0.00)"
                  : idx % 2 === 0
                  ? "rgba(15,23,42,0.015)"
                  : "rgba(15,23,42,0.00)";
                return (
                  <tr key={item.id} style={{ background: rowBg }}>
                    <td style={{ ...cellStyle, whiteSpace: "normal" }}>
                      <div style={{ fontWeight: 600 }}>{item.title || "Update"}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>{item.body || "-"}</div>
                    </td>
                    <td style={cellStyle}>{item.type}</td>
                    <td style={{ ...cellStyle, textAlign: "center" }}>{item.isRead ? "Read" : "Unread"}</td>
                    <td style={{ ...cellStyle, textAlign: "right" }}>{fmtDate(item.createdAt)}</td>
                    <td style={{ ...cellStyle, textAlign: "center" }}>
                      {item.deepLink ? (
                        <Link className="btn ghost" href={item.deepLink} style={{ borderRadius: 999 }}>
                          Open
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                );
              })}
              {!loading && (data?.recentUpdates || []).length === 0 ? (
                <tr>
                  <td style={cellStyle} colSpan={5}>
                    No recent updates yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card kpi-card p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">{label}</div>
      <div className="text-2xl font-semibold mt-2">{value}</div>
    </div>
  );
}
