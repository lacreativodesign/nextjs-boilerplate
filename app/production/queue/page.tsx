"use client";

import { useEffect, useMemo, useState } from "react";
import MasterSelect from "@/components/ui/MasterSelect";
import ProductionProjectDrawer, { type ProductionProject } from "@/components/production/ProductionProjectDrawer";

const ACTIVE_STAGES = ["Draft", "Review", "Revisions", "Final"] as const;
const PRIORITIES = ["Low", "Normal", "High", "Urgent"] as const;
const HEALTH_OPTIONS = ["On Track", "At Risk", "Overdue"] as const;

type QueuePayload = {
  ok: boolean;
  projects: ProductionProject[];
};

type SortKey = "projectName" | "clientName" | "stage" | "priority" | "health" | "dueDate" | "updatedAt";

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

function isOverdue(iso?: string | null) {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return date.getTime() < startOfToday.getTime();
}

function isDueThisWeek(iso?: string | null) {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = date.getTime() - startOfToday.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= 7;
}

export default function ProductionQueuePage() {
  const isDark = useIsSystemDark();
  const [projects, setProjects] = useState<ProductionProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState("all");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ProductionProject | null>(null);

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

  async function loadQueue(mountedRef?: { current: boolean }) {
    const mounted = mountedRef ? mountedRef.current : true;
    if (!mounted) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/production/queue", { credentials: "include", cache: "no-store" });
      const payload = (await res.json()) as QueuePayload;

      if (!res.ok || !payload.ok) {
        throw new Error(payload?.error || "Unable to load queue.");
      }

      if (mountedRef ? mountedRef.current : true) {
        setProjects(payload.projects || []);
      }
    } catch (err: any) {
      console.error(err);
      if (mountedRef ? mountedRef.current : true) setError(err?.message || "Unable to load queue.");
    } finally {
      if (mountedRef ? mountedRef.current : true) setLoading(false);
    }
  }

  useEffect(() => {
    const mountedRef = { current: true };
    void loadQueue(mountedRef);
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshQueue = () => {
    void loadQueue();
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((project) => {
      if (!ACTIVE_STAGES.includes(project.stage as (typeof ACTIVE_STAGES)[number])) return false;
      if (stageFilter !== "all" && project.stage !== stageFilter) return false;
      if (priorityFilter !== "all" && project.priority !== priorityFilter) return false;
      if (healthFilter !== "all" && project.health !== healthFilter) return false;
      if (dueFrom) {
        const fromDate = new Date(dueFrom);
        if (!Number.isNaN(fromDate.getTime())) {
          const due = project.dueDate ? new Date(project.dueDate) : null;
          if (!due || Number.isNaN(due.getTime()) || due < fromDate) return false;
        }
      }
      if (dueTo) {
        const toDate = new Date(dueTo);
        if (!Number.isNaN(toDate.getTime())) {
          const due = project.dueDate ? new Date(project.dueDate) : null;
          if (!due || Number.isNaN(due.getTime()) || due > toDate) return false;
        }
      }
      if (q) {
        const hay = [project.projectName, project.clientName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [projects, search, stageFilter, priorityFilter, healthFilter, dueFrom, dueTo]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const getValue = (project: ProductionProject) => {
      switch (sortKey) {
        case "projectName":
          return project.projectName || "";
        case "clientName":
          return project.clientName || "";
        case "stage":
          return project.stage || "";
        case "priority":
          return project.priority || "";
        case "health":
          return project.health || "";
        case "dueDate":
          return project.dueDate || "";
        case "updatedAt":
          return project.updatedAt || "";
        default:
          return project.updatedAt || "";
      }
    };
    return [...filtered].sort((a, b) => String(getValue(a)).localeCompare(String(getValue(b))) * dir);
  }, [filtered, sortDir, sortKey]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, project) => {
        acc.total += 1;
        if (project.health === "At Risk") acc.atRisk += 1;
        if (isOverdue(project.dueDate)) acc.overdue += 1;
        if (isDueThisWeek(project.dueDate)) acc.dueWeek += 1;
        return acc;
      },
      { total: 0, atRisk: 0, overdue: 0, dueWeek: 0 }
    );
  }, [filtered]);

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
    setProjects((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    if (selected?.id === updated.id) setSelected(updated);
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <section style={{ display: "grid", gap: 12 }}>
        <div style={sectionTitleStyle}>Filters</div>
        <div
          className="card"
          style={{
            padding: 14,
            borderRadius: 16,
            background: isDark ? "rgba(24,24,24,0.9)" : "rgba(255,255,255,0.85)",
            border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
            boxShadow: isDark ? "0 14px 28px rgba(0,0,0,0.32)" : "0 12px 24px rgba(15,23,42,0.06)",
            display: "grid",
            gridTemplateColumns: "minmax(220px, 1.3fr) repeat(auto-fit, minmax(180px, 1fr))",
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
          <MasterSelect
            value={stageFilter}
            onChange={setStageFilter}
            placeholder="Stage"
            isDark={isDark}
            options={[{ value: "all", label: "All Stages" }, ...ACTIVE_STAGES.map((stage) => ({ value: stage, label: stage }))]}
          />
          <MasterSelect
            value={priorityFilter}
            onChange={setPriorityFilter}
            placeholder="Priority"
            isDark={isDark}
            options={[{ value: "all", label: "All Priorities" }, ...PRIORITIES.map((p) => ({ value: p, label: p }))]}
          />
          <MasterSelect
            value={healthFilter}
            onChange={setHealthFilter}
            placeholder="Health"
            isDark={isDark}
            options={[{ value: "all", label: "All Health" }, ...HEALTH_OPTIONS.map((h) => ({ value: h, label: h }))]}
          />
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 11, textTransform: "uppercase", opacity: 0.7 }}>Due range</label>
            <div style={{ display: "grid", gap: 8 }}>
              <input className="input" type="date" value={dueFrom} onChange={(event) => setDueFrom(event.target.value)} />
              <input className="input" type="date" value={dueTo} onChange={(event) => setDueTo(event.target.value)} />
            </div>
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gap: 12 }}>
        <div style={sectionTitleStyle}>Queue KPIs</div>
        <div className="kpis">
          <KpiCard label="Total Assigned" value={totals.total} />
          <KpiCard label="At Risk" value={totals.atRisk} />
          <KpiCard label="Overdue" value={totals.overdue} />
          <KpiCard label="Due This Week" value={totals.dueWeek} />
        </div>
      </section>

      <section style={{ display: "grid", gap: 12 }}>
        <div style={sectionTitleStyle}>My Queue</div>
        {loading ? (
          <div style={{ fontSize: 14, opacity: 0.7 }}>Loading queue…</div>
        ) : error ? (
          <div style={{ fontSize: 14, color: "#dc2626" }}>{error}</div>
        ) : (
          <div style={tableShellStyle}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 980 }}>
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
                    <th style={{ ...headerCellStyle, textAlign: "center" }} onClick={() => toggleSort("priority")}>
                      {headerLabel("Priority", sortBadge("priority"))}
                    </th>
                    <th style={{ ...headerCellStyle, textAlign: "center" }} onClick={() => toggleSort("health")}>
                      {headerLabel("Health", sortBadge("health"))}
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
                  {sorted.length === 0 ? (
                    <tr>
                      <td style={{ ...cellStyle, textAlign: "left" }} colSpan={8}>
                        No projects match these filters.
                      </td>
                    </tr>
                  ) : (
                    sorted.map((project, idx) => {
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
                          <td style={{ ...cellStyle, textAlign: "center" }}>{project.priority}</td>
                          <td style={{ ...cellStyle, textAlign: "center" }}>{project.health}</td>
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
        )}
      </section>

      <ProductionProjectDrawer
        open={drawerOpen}
        project={selected}
        productionUsers={[]}
        onClose={closeDrawer}
        onProjectUpdated={handleProjectUpdated}
        onRefresh={refreshQueue}
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
