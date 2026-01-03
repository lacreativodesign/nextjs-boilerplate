"use client";

import { useEffect, useMemo, useState } from "react";
import { useIsDarkMode } from "@/lib/useIsDarkMode";
import { formatUsd } from "@/components/finance/financeUtils";

type TeamMember = {
  uid: string;
  name: string;
  email: string;
  leadsAssigned: number;
  dealsAssigned: number;
  closedWon: number;
  closedLost: number;
  revenueWon: number;
};

type TeamResponse = { ok: boolean; team: TeamMember[] };

export default function SalesManagerTeamPage() {
  const isDark = useIsDarkMode();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<TeamMember[]>([]);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/sales-manager/team", { cache: "no-store" });
        const json = (await res.json()) as TeamResponse;
        if (!res.ok || !json.ok) {
          throw new Error(json?.ok ? "" : "Failed to load team");
        }
        if (!alive) return;
        setRows(Array.isArray(json.team) ? json.team : []);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || "Unable to load team.");
        setRows([]);
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

  const tableShellStyle: React.CSSProperties = {
    borderRadius: 20,
    padding: 14,
    border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.10)",
    background: isDark ? "rgba(20,20,20,0.92)" : "rgba(255,255,255,0.85)",
    boxShadow: isDark ? "0 18px 40px rgba(0,0,0,0.45)" : "0 18px 55px rgba(15,23,42,0.10)",
  };

  const headerCellStyle: React.CSSProperties = {
    padding: "12px 14px",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: isDark ? "rgba(226,232,240,0.66)" : "rgba(15,23,42,0.55)",
    borderBottom: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.10)",
    userSelect: "none",
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

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => b.revenueWon - a.revenueWon);
  }, [rows]);

  return (
    <div style={{ width: "100%" }}>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Team</h1>
          <p className="page-subtitle" style={{ marginTop: 6 }}>
            Sales reps, assignment counts, and performance snapshots.
          </p>
        </div>
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

      <div style={tableShellStyle}>
        {loading ? (
          <p style={{ fontSize: 14, color: isDark ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.70)" }}>
            Loading team...
          </p>
        ) : sortedRows.length === 0 ? (
          <p style={{ fontSize: 14, color: isDark ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.70)" }}>
            No sales reps found.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={headerCellStyle}>Rep</th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Leads</th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Deals</th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Closed Won</th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Closed Lost</th>
                  <th style={{ ...headerCellStyle, textAlign: "right" }}>Revenue Won</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, idx) => {
                  const rowBg = isDark
                    ? idx % 2 === 0
                      ? "rgba(255,255,255,0.015)"
                      : "rgba(255,255,255,0.00)"
                    : idx % 2 === 0
                    ? "rgba(15,23,42,0.015)"
                    : "rgba(15,23,42,0.00)";
                  const hoverBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.03)";

                  return (
                    <tr
                      key={row.uid}
                      style={{ background: rowBg, transition: "background 120ms ease" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = hoverBg)}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = rowBg)}
                    >
                      <td style={{ ...cellStyle, whiteSpace: "normal" }}>
                        <div style={{ fontWeight: 700 }}>{row.name}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>{row.email}</div>
                      </td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>{row.leadsAssigned}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>{row.dealsAssigned}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>{row.closedWon}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>{row.closedLost}</td>
                      <td style={{ ...cellStyle, textAlign: "right" }}>{formatUsd(row.revenueWon)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
