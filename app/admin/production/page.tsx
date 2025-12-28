"use client";

import { useEffect, useMemo, useState } from "react";
import ProductionProjectDrawer, {
  type ProductionProject,
  type ProductionUserOption,
} from "@/components/production/ProductionProjectDrawer";

const ACTIVE_STAGES = ["Draft", "Review", "Revisions", "Final"] as const;

type OverviewPayload = {
  ok: boolean;
  projects: ProductionProject[];
  kpis: Record<string, number>;
  myQueue: ProductionProject[];
};

type UserRecord = {
  uid: string;
  name?: string;
  role?: string;
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

function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

export default function ProductionOverviewPage() {
  const isDark = useIsSystemDark();
  const [projects, setProjects] = useState<ProductionProject[]>([]);
  const [kpis, setKpis] = useState<Record<string, number>>({});
  const [myQueue, setMyQueue] = useState<ProductionProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ProductionProject | null>(null);
  const [productionUsers, setProductionUsers] = useState<ProductionUserOption[]>([]);

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

  async function loadOverview(mountedRef?: { current: boolean }) {
    const mounted = mountedRef ? mountedRef.current : true;
    if (!mounted) return;
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, usersRes] = await Promise.all([
        fetch("/api/admin/production/overview", { credentials: "include", cache: "no-store" }),
        fetch("/api/admin/users/list", { credentials: "include", cache: "no-store" }),
      ]);
      const overviewPayload = (await overviewRes.json()) as OverviewPayload;
      const usersPayload = await usersRes.json();

      if (!overviewRes.ok || !overviewPayload.ok) {
        throw new Error(overviewPayload?.error || "Unable to load production overview.");
      }

      if (mountedRef ? mountedRef.current : true) {
        setProjects(overviewPayload.projects || []);
        setKpis(overviewPayload.kpis || {});
        setMyQueue(overviewPayload.myQueue || []);
        const users = (usersPayload?.users || []) as UserRecord[];
        const options = users
          .filter((user) => (user.role || "").toLowerCase() === "production")
          .map((user) => ({ value: user.uid, label: user.name || user.uid }));
        setProductionUsers(options);
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

  const refreshOverview = () => {
    void loadOverview();
  };


  const activeProjects = useMemo(() => {
    return projects.filter((project) => ACTIVE_STAGES.includes(project.stage as (typeof ACTIVE_STAGES)[number]));
  }, [projects]);

  const queueRows = useMemo(() => {
    const base = myQueue.length
      ? myQueue
      : [...activeProjects].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    return base.slice(0, 10);
  }, [myQueue, activeProjects]);

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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
              }}
            >
              <KpiCard label="Assigned to Production" value={kpis.assigned || 0} />
              <KpiCard label="In Draft" value={kpis.draft || 0} />
              <KpiCard label="In Review" value={kpis.review || 0} />
              <KpiCard label="In Revisions" value={kpis.revisions || 0} />
              <KpiCard label="In Final" value={kpis.final || 0} />
              <KpiCard label="At Risk" value={kpis.atRisk || 0} />
              <KpiCard label="Overdue" value={kpis.overdue || 0} />
              <KpiCard label="Delivered (7d)" value={kpis.delivered7 || 0} />
            </div>
          </section>

          <section style={{ display: "grid", gap: 12 }}>
            <div style={sectionTitleStyle}>My Queue (Top 10)</div>
            <div style={tableShellStyle}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th style={headerCellStyle}>Project</th>
                      <th style={headerCellStyle}>Client</th>
                      <th style={{ ...headerCellStyle, textAlign: "center" }}>Stage</th>
                      <th style={{ ...headerCellStyle, textAlign: "center" }}>Due Date</th>
                      <th style={{ ...headerCellStyle, textAlign: "center" }}>Updated</th>
                      <th style={{ ...headerCellStyle, textAlign: "center" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queueRows.length === 0 ? (
                      <tr>
                        <td style={{ ...cellStyle, textAlign: "left" }} colSpan={6}>
                          No production projects yet.
                        </td>
                      </tr>
                    ) : (
                      queueRows.map((project, idx) => {
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
                            <td style={{ ...cellStyle, textAlign: "left" }}>
                              <div style={{ fontWeight: 600 }}>{project.projectName}</div>
                              <div style={{ fontSize: 12, opacity: 0.65 }}>{project.productionName || "Unassigned"}</div>
                            </td>
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
        </>
      )}

      <ProductionProjectDrawer
        open={drawerOpen}
        project={selected}
        productionUsers={productionUsers}
        onClose={closeDrawer}
        onProjectUpdated={handleProjectUpdated}
        onRefresh={refreshOverview}
      />
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card kpi-card" style={{ padding: "16px 18px", borderRadius: 16 }}>
      <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{value}</div>
    </div>
  );
}
