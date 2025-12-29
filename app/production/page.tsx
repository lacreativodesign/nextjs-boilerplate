"use client";

import { useEffect, useMemo, useState } from "react";
import ProductionProjectDrawer, { type ProductionProject } from "@/components/production/ProductionProjectDrawer";

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
  kpis: {
    assigned: number;
    active: number;
    dueSoon: number;
    qaQueue: number;
  };
  myQueueTop10: ProductionProject[];
  recentActivityTop10: ActivityEntry[];
};

type SortKey = "projectName" | "clientName" | "stage" | "dueDate" | "updatedAt";

type SortDir = "asc" | "desc";

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

function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function ProductionOverviewPage() {
  const isDark = useIsSystemDark();
  const [kpis, setKpis] = useState<OverviewPayload["kpis"]>({
    assigned: 0,
    active: 0,
    dueSoon: 0,
    qaQueue: 0,
  });
  const [myQueue, setMyQueue] = useState<ProductionProject[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ProductionProject | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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
    cursor: "pointer",
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

  const headerLabel = (label: string, badge?: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span>{label}</span>
      <span style={{ width: 14, display: "inline-block", textAlign: "center", opacity: badge ? 1 : 0.35 }}>
        {badge || "•"}
      </span>
    </span>
  );

  async function loadOverview(mountedRef?: { current: boolean }) {
    const mounted = mountedRef ? mountedRef.current : true;
    if (!mounted) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/production/overview", { credentials: "include", cache: "no-store" });
      const payload = (await res.json()) as OverviewPayload;
      if (!res.ok || !payload.ok) {
        throw new Error(payload?.error || "Unable to load production overview.");
      }
      if (mountedRef ? mountedRef.current : true) {
        setKpis(payload.kpis || { assigned: 0, active: 0, dueSoon: 0, qaQueue: 0 });
        setMyQueue(payload.myQueueTop10 || []);
        setActivity(payload.recentActivityTop10 || []);
      }
    } catch (err: any) {
      console.error(err);
      if (mountedRef ? mountedRef.current : true) setError(err?.message || "Unable to load overview.");
    } finally {
      if (mountedRef ? mountedRef.current : true) setLoading(false);
    }
  }

  useEffect(() => {
    const mountedRef = { current: true };
    void loadOverview(mountedRef);
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const sortedQueue = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const getValue = (project: ProductionProject) => {
      switch (sortKey) {
        case "projectName":
          return project.projectName || "";
        case "clientName":
          return project.clientName || "";
        case "stage":
          return project.stage || "";
        case "dueDate":
          return project.dueDate || "";
        case "updatedAt":
          return project.updatedAt || "";
        default:
          return project.updatedAt || "";
      }
    };
    return [...myQueue].sort((a, b) => String(getValue(a)).localeCompare(String(getValue(b))) * dir);
  }, [myQueue, sortDir, sortKey]);

  const sortedActivity = useMemo(() => {
    return [...activity].sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  }, [activity]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sortBadge = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? "▲" : "▼";
  };

  function openDrawer(project: ProductionProject) {
    setSelected(project);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSelected(null);
  }

  function handleProjectUpdated(updated: ProductionProject) {
    setMyQueue((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    if (selected?.id === updated.id) setSelected(updated);
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {loading ? (
        <div style={{ fontSize: 14, opacity: 0.7 }}>Loading production overview…</div>
      ) : error ? (
        <div style={{ fontSize: 14, color: "#dc2626" }}>{error}</div>
      ) : (
        <>
          <section style={{ display: "grid", gap: 12 }}>
            <div style={sectionTitleStyle}>Overview</div>
            <div className="kpis">
              <KpiCard label="Assigned Projects" value={kpis.assigned} />
              <KpiCard label="Draft/Review/Revisions" value={kpis.active} />
              <KpiCard label="Due Soon (7d)" value={kpis.dueSoon} />
              <KpiCard label="QA Queue" value={kpis.qaQueue} />
            </div>
          </section>

          <section style={{ display: "grid", gap: 12 }}>
            <div style={sectionTitleStyle}>My Queue (Top 10)</div>
            <div style={tableShellStyle}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th style={headerCellStyle} onClick={() => toggleSort("projectName")}>
                        {headerLabel("Project", sortBadge("projectName"))}
                      </th>
                      <th style={headerCellStyle} onClick={() => toggleSort("clientName")}>
                        {headerLabel("Client", sortBadge("clientName"))}
                      </th>
                      <th style={{ ...headerCellStyle, textAlign: "center" }} onClick={() => toggleSort("stage")}>
                        {headerLabel("Stage", sortBadge("stage"))}
                      </th>
                      <th style={{ ...headerCellStyle, textAlign: "center" }} onClick={() => toggleSort("dueDate")}>
                        {headerLabel("Due", sortBadge("dueDate"))}
                      </th>
                      <th style={{ ...headerCellStyle, textAlign: "center" }} onClick={() => toggleSort("updatedAt")}>
                        {headerLabel("Updated", sortBadge("updatedAt"))}
                      </th>
                      <th style={{ ...headerCellStyle, textAlign: "center" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedQueue.length === 0 ? (
                      <tr>
                        <td style={{ ...cellStyle, textAlign: "left" }} colSpan={6}>
                          No assigned projects yet.
                        </td>
                      </tr>
                    ) : (
                      sortedQueue.map((project, idx) => {
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
                            key={project.id}
                            style={{ background: rowBg, transition: "background 120ms ease" }}
                            onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = hoverBg)}
                            onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = rowBg)}
                          >
                            <td style={{ ...cellStyle, textAlign: "left" }}>{project.projectName}</td>
                            <td style={{ ...cellStyle, textAlign: "left" }}>{project.clientName}</td>
                            <td style={{ ...cellStyle, textAlign: "center" }}>{project.stage}</td>
                            <td style={{ ...cellStyle, textAlign: "center" }}>{fmtDate(project.dueDate)}</td>
                            <td style={{ ...cellStyle, textAlign: "center" }}>{fmtDate(project.updatedAt)}</td>
                            <td style={{ ...cellStyle, textAlign: "center" }}>
                              <button className="btn ghost" onClick={() => openDrawer(project)}>
                                View
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section style={{ display: "grid", gap: 12 }}>
            <div style={sectionTitleStyle}>Recent Activity (Top 10)</div>
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
                    {sortedActivity.length === 0 ? (
                      <tr>
                        <td style={{ ...cellStyle, textAlign: "left" }} colSpan={4}>
                          No recent activity yet.
                        </td>
                      </tr>
                    ) : (
                      sortedActivity.map((item, idx) => {
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
          </section>
        </>
      )}

      <ProductionProjectDrawer
        open={drawerOpen}
        project={selected}
        productionUsers={[]}
        onClose={closeDrawer}
        onProjectUpdated={handleProjectUpdated}
        onRefresh={() => void loadOverview()}
        role="production"
      />
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card kpi-card" style={{ padding: 14, borderRadius: 16 }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
