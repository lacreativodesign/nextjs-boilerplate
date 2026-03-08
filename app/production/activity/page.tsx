"use client";

import { useEffect, useMemo, useState } from "react";

type ActivityEntry = {
  id: string;
  projectId: string;
  projectName: string;
  clientName: string;
  fromStage?: string;
  toStage?: string;
  byName?: string;
  at?: string | null;
};

type OverviewPayload = {
  ok: boolean;
  recentActivityTop10: ActivityEntry[];
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

function fmtDateTime(iso?: string | null) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function ProductionActivityPage() {
  const isDark = useIsSystemDark();
  const [rows, setRows] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const tableShellStyle: React.CSSProperties = {
    borderRadius: 20,
    padding: 14,
    border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.10)",
    background: isDark ? "rgba(20,20,20,0.92)" : "rgba(255,255,255,0.85)",
    boxShadow: isDark ? "0 18px 40px rgba(0,0,0,0.45)" : "0 18px 55px rgba(15,23,42,0.10)",
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 700,
    color: isDark ? "rgba(255,255,255,0.92)" : "rgba(15,23,42,0.9)",
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

  async function loadActivity(mountedRef?: { current: boolean }) {
    const mounted = mountedRef ? mountedRef.current : true;
    if (!mounted) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/production/overview", { credentials: "include", cache: "no-store" });
      const payload = (await res.json()) as OverviewPayload;
      if (!res.ok || !payload.ok) {
        throw new Error(payload?.error || "Unable to load activity.");
      }
      if (mountedRef ? mountedRef.current : true) {
        setRows(payload.recentActivityTop10 || []);
      }
    } catch (err: any) {
      console.error(err);
      if (mountedRef ? mountedRef.current : true) setError(err?.message || "Unable to load activity.");
    } finally {
      if (mountedRef ? mountedRef.current : true) setLoading(false);
    }
  }

  useEffect(() => {
    const mountedRef = { current: true };
    void loadActivity(mountedRef);
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((item) => {
      const hay = [item.projectName, item.clientName, item.byName, item.fromStage, item.toStage]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <section style={{ display: "grid", gap: 12 }}>
        <div style={sectionTitleStyle}>Activity</div>
        <div
          className="card"
          style={{
            padding: 14,
            borderRadius: 16,
            background: isDark ? "rgba(24,24,24,0.9)" : "rgba(255,255,255,0.85)",
            border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
            boxShadow: isDark ? "0 14px 28px rgba(0,0,0,0.32)" : "0 12px 24px rgba(15,23,42,0.06)",
            display: "grid",
            gridTemplateColumns: "minmax(220px, 1.3fr)",
            gap: 12,
            alignItems: "center",
          }}
        >
          <input
            className="input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search keyword"
          />
        </div>
      </section>

      <section style={{ display: "grid", gap: 12 }}>
        <div style={sectionTitleStyle}>Recent Activity</div>
        {loading ? (
          <div style={{ fontSize: 14, opacity: 0.7 }}>Loading activity…</div>
        ) : error ? (
          <div style={{ fontSize: 14, color: "#dc2626" }}>{error}</div>
        ) : (
          <div style={tableShellStyle}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 720 }}>
                <thead>
                  <tr>
                    <th style={headerCellStyle}>Project</th>
                    <th style={headerCellStyle}>Update</th>
                    <th style={{ ...headerCellStyle, textAlign: "center" }}>Stage</th>
                    <th style={{ ...headerCellStyle, textAlign: "center" }}>When</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td style={{ ...cellStyle, textAlign: "left" }} colSpan={4}>
                        No activity matches your filters.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((item, idx) => {
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
                          key={item.id}
                          style={{ background: rowBg, transition: "background 120ms ease" }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = hoverBg)}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = rowBg)}
                        >
                          <td style={{ ...cellStyle, textAlign: "left" }}>
                            {item.projectName || "Project"}
                            <div style={{ fontSize: 12, opacity: 0.65 }}>{item.clientName}</div>
                          </td>
                          <td style={{ ...cellStyle, textAlign: "left" }}>
                            {item.byName ? `${item.byName} moved stage` : "Stage updated"}
                          </td>
                          <td style={{ ...cellStyle, textAlign: "center" }}>
                            {item.fromStage || "-"} → {item.toStage || "-"}
                          </td>
                          <td style={{ ...cellStyle, textAlign: "center" }}>{fmtDateTime(item.at)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
