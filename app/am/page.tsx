"use client";

import { useEffect, useMemo, useState } from "react";
import AMProjectDrawer, { type AMProject } from "@/components/am/AMProjectDrawer";
import { Skeleton } from "@/components/ui/skeleton";

type ActivityItem = {
  id: string;
  projectId?: string;
  projectName?: string;
  clientName?: string;
  title?: string;
  description?: string;
  createdAt?: string | null;
};

type OverviewPayload = {
  ok: boolean;
  kpis: {
    activeProjects: number;
    reviewProjects: number;
    openChangeRequests: number;
    unreadNotifications: number;
  };
  topProjects: AMProject[];
  recentActivity: ActivityItem[];
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

function fmtDateTime(iso?: string | null) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function AMOverviewPage() {
  const isDark = useIsSystemDark();
  const [overview, setOverview] = useState<OverviewPayload["kpis"]>({
    activeProjects: 0,
    reviewProjects: 0,
    openChangeRequests: 0,
    unreadNotifications: 0,
  });
  const [projects, setProjects] = useState<AMProject[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<AMProject | null>(null);

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
    return [...projects].sort((a, b) => String(getValue(a)).localeCompare(String(getValue(b))) * dir);
  }, [projects, sortDir, sortKey]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/am/overview", { credentials: "include", cache: "no-store" });
        const payload = (await res.json()) as OverviewPayload;
        if (!res.ok || !payload.ok) {
          throw new Error(payload?.error || "Unable to load overview.");
        }
        if (!active) return;
        setOverview(payload.kpis);
        setProjects(payload.topProjects || []);
        setActivity(payload.recentActivity || []);
      } catch (err: any) {
        console.error(err);
        if (active) setError(err?.message || "Unable to load overview.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

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
        <h1 className="page-title">Overview</h1>
        <p className="page-subtitle">Manage assigned projects, client coordination, and delivery oversight.</p>
      </div>

      <div className="kpis">
        {[
          { label: "Active Projects", value: overview.activeProjects },
          { label: "Projects in Review", value: overview.reviewProjects },
          { label: "Open Change Requests", value: overview.openChangeRequests },
          { label: "Unread Notifications", value: overview.unreadNotifications },
        ].map((item) => (
          <KpiCard key={item.label} label={item.label} value={loading ? "—" : `${item.value}`} />
        ))}
      </div>

      {error && (
        <div className="card" style={{ padding: 12, borderRadius: 12, borderColor: "var(--danger)" }}>
          <span style={{ color: "var(--danger)", fontSize: 13 }}>{error}</span>
        </div>
      )}

      <div style={tableShellStyle}>
        <div className="flex items-center justify-between gap-3" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>My Projects (Top 10)</div>
          <button className="btn ghost" onClick={() => window.location.reload()}>
            Refresh
          </button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
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
                <tr key={project.id} style={{ background: "transparent" }}>
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

      <div style={tableShellStyle}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Recent Activity (Top 10)</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
            <thead>
              <tr>
                <th style={headerCellStyle}>Project</th>
                <th style={headerCellStyle}>Details</th>
                <th style={{ ...headerCellStyle, textAlign: "center" }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {activity.map((item) => (
                <tr key={item.id}>
                  <td style={{ ...cellStyle, textAlign: "left" }}>
                    {item.projectName || "Project"}
                    <div style={{ fontSize: 12, opacity: 0.65 }}>{item.clientName || ""}</div>
                  </td>
                  <td style={{ ...cellStyle, textAlign: "left" }}>
                    <div style={{ fontWeight: 600 }}>{item.title || "Update"}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{item.description || ""}</div>
                  </td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>{fmtDateTime(item.createdAt)}</td>
                </tr>
              ))}
              {!loading && activity.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ ...cellStyle, textAlign: "center", padding: "24px 16px" }}>
                    No recent activity yet.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={3} style={{ ...cellStyle, textAlign: "center", padding: "24px 16px" }}>
                    Loading activity...
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

function KpiCard({ label, value }: { label: string; value: string }) {
  const showSkeleton = value === "—";
  return (
    <div className="card kpi-card" style={{ padding: 14, borderRadius: 16 }}>
      <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>
        {showSkeleton ? <Skeleton variant="text" className="h-5 w-20" /> : value}
      </div>
    </div>
  );
}
