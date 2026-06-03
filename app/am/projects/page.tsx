"use client";

import { useEffect, useMemo, useState } from "react";
import MasterSelect from "@/components/ui/MasterSelect";
import AMProjectDrawer, { type AMProject } from "@/components/am/AMProjectDrawer";

const STAGES = ["Kickoff", "Draft", "Review", "Revisions", "Final", "Delivered"] as const;
const PRIORITIES = ["Low", "Normal", "High", "Urgent"] as const;
const HEALTH_OPTIONS = ["On Track", "At Risk", "Overdue"] as const;

type SortKey = "projectName" | "clientName" | "stage" | "priority" | "health" | "dueDate" | "updatedAt";
type SortDir = "asc" | "desc";

type ProjectsPayload = {
  ok: boolean;
  projects: AMProject[];
  error?: string;
};


function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

export default function AMProjectsPage() {
  const [projects, setProjects] = useState<AMProject[]>([]);
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
  const [selected, setSelected] = useState<AMProject | null>(null);

  const tableShellStyle: React.CSSProperties = {
    borderRadius: 20,
    padding: 14,
    border: "1px solid var(--border-subtle)",
    background: "var(--surface-card)",
    boxShadow: "var(--shadow-md)",
  };

  const headerCellStyle: React.CSSProperties = {
    padding: "12px 14px",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border-subtle)",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
    textAlign: "left",
  };

  const cellStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderBottom: "1px dashed var(--border-subtle)",
    color: "var(--text-primary)",
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

  const sortBadge = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? "▲" : "▼";
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  async function loadProjects(mountedRef?: { current: boolean }) {
    const mounted = mountedRef ? mountedRef.current : true;
    if (!mounted) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (stageFilter !== "all") params.set("stage", stageFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (healthFilter !== "all") params.set("health", healthFilter);
      if (dueFrom) params.set("dueFrom", dueFrom);
      if (dueTo) params.set("dueTo", dueTo);

      const res = await fetch(`/api/am/projects/list?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await res.json()) as ProjectsPayload;
      if (!res.ok || !payload.ok) {
        throw new Error(payload?.error || "Unable to load projects.");
      }
      if (mountedRef ? mountedRef.current : true) {
        setProjects(payload.projects || []);
      }
    } catch (err: any) {
      console.error(err);
      if (mountedRef ? mountedRef.current : true) setError(err?.message || "Unable to load projects.");
    } finally {
      if (mountedRef ? mountedRef.current : true) setLoading(false);
    }
  }

  useEffect(() => {
    const mountedRef = { current: true };
    void loadProjects(mountedRef);
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageFilter, priorityFilter, healthFilter, dueFrom, dueTo]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((project) => {
      if (q) {
        const hay = [project.projectName, project.clientName].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
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
      return true;
    });
  }, [projects, search, stageFilter, priorityFilter, healthFilter, dueFrom, dueTo]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const getValue = (project: AMProject) => {
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
        if (project.health === "Overdue") acc.overdue += 1;
        if (project.stage === "Review") acc.inReview += 1;
        return acc;
      },
      { total: 0, atRisk: 0, overdue: 0, inReview: 0 }
    );
  }, [filtered]);

  const openDrawer = (project: AMProject) => {
    setSelected(project);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelected(null);
  };

  const updateProject = (updated: AMProject) => {
    setProjects((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">My Projects</h1>
        <p className="page-subtitle">Track delivery, client comms, and priorities for your assigned work.</p>
      </div>

      <div className="kpis">
        <KpiCard label="Total Projects" value={totals.total} />
        <KpiCard label="In Review" value={totals.inReview} />
        <KpiCard label="At Risk" value={totals.atRisk} />
        <KpiCard label="Overdue" value={totals.overdue} />
      </div>

      <div style={tableShellStyle}>
        <div className="flex flex-wrap items-center justify-between gap-3" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Assigned Projects</div>
          <button className="btn ghost" onClick={() => loadProjects()}>
            Refresh
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            className="input"
            placeholder="Search keyword"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <MasterSelect
            value={stageFilter}
            onChange={setStageFilter}
            options={[{ value: "all", label: "All Stages" }, ...STAGES.map((value) => ({ value, label: value }))]}
          />
          <MasterSelect
            value={priorityFilter}
            onChange={setPriorityFilter}
            options={[{ value: "all", label: "All Priorities" }, ...PRIORITIES.map((value) => ({ value, label: value }))]}
          />
          <MasterSelect
            value={healthFilter}
            onChange={setHealthFilter}
            options={[{ value: "all", label: "All Health" }, ...HEALTH_OPTIONS.map((value) => ({ value, label: value }))]}
          />
          <input className="input" type="date" value={dueFrom} onChange={(event) => setDueFrom(event.target.value)} />
          <input className="input" type="date" value={dueTo} onChange={(event) => setDueTo(event.target.value)} />
        </div>
      </div>

      {error && (
        <div className="card" style={{ padding: 12, borderRadius: 12, borderColor: "var(--danger)" }}>
          <span style={{ color: "var(--danger)", fontSize: 13 }}>{error}</span>
        </div>
      )}

      <div style={tableShellStyle}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
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
                <th style={{ ...headerCellStyle, textAlign: "center", cursor: "default" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((project) => (
                <tr key={project.id}>
                  <td style={{ ...cellStyle, textAlign: "left" }}>{project.projectName}</td>
                  <td style={{ ...cellStyle, textAlign: "left" }}>{project.clientName}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>{project.stage}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>{project.priority || "Normal"}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>{project.health || "On Track"}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>{fmtDate(project.dueDate)}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>{fmtDate(project.updatedAt)}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>
                    <button className="btn ghost" onClick={() => openDrawer(project)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ ...cellStyle, textAlign: "center", padding: "24px 16px" }}>
                    No projects found.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={8} style={{ ...cellStyle, textAlign: "center", padding: "24px 16px" }}>
                    Loading projects...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AMProjectDrawer open={drawerOpen} project={selected} onClose={closeDrawer} onProjectUpdated={updateProject} />
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card kpi-card" style={{ padding: 14, borderRadius: 16 }}>
      <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{value}</div>
    </div>
  );
}
