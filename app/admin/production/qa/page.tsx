"use client";

import { useEffect, useMemo, useState } from "react";
import MasterSelect from "@/components/ui/MasterSelect";
import ProductionProjectDrawer, {
  type ProductionProject,
  type ProductionUserOption,
} from "@/components/production/ProductionProjectDrawer";
import { normalizeRole } from "@/lib/roleRouting";

type QueuePayload = {
  ok: boolean;
  projects: ProductionProject[];
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

export default function ProductionQAPage() {
  const isDark = useIsSystemDark();
  const [projects, setProjects] = useState<ProductionProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [productionFilter, setProductionFilter] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ProductionProject | null>(null);
  const [productionUsers, setProductionUsers] = useState<ProductionUserOption[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<ProductionUserOption[]>([]);
  const [projectTypes, setProjectTypes] = useState<string[]>([]);

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

  async function loadQA(mountedRef?: { current: boolean }) {
    const mounted = mountedRef ? mountedRef.current : true;
    if (!mounted) return;
    setLoading(true);
    setError(null);
    try {
      const [queueRes, usersRes] = await Promise.all([
        fetch("/api/admin/production/queue", { credentials: "include", cache: "no-store" }),
        fetch("/api/admin/users/list", { credentials: "include", cache: "no-store" }),
      ]);
      const queuePayload = (await queueRes.json()) as QueuePayload;
      const usersPayload = await usersRes.json();

      if (!queueRes.ok || !queuePayload.ok) {
        throw new Error(queuePayload?.error || "Unable to load QA projects.");
      }

      if (mountedRef ? mountedRef.current : true) {
        setProjects(queuePayload.projects || []);
        const users = (usersPayload?.users || []) as UserRecord[];
        const production = users
          .filter((user) => normalizeRole(user.role) === "production")
          .map((user) => ({ value: user.uid, label: user.name || user.uid }));
        const owners = users
          .filter((user) => ["am", "admin", "super_admin"].includes(normalizeRole(user.role)))
          .map((user) => ({ value: user.uid, label: user.name || user.uid }));
        setProductionUsers(production);
        setOwnerOptions(owners);
        const types = Array.from(new Set(queuePayload.projects.map((project) => project.projectType).filter(Boolean))) as string[];
        setProjectTypes(types.sort());
      }
    } catch (err: any) {
      console.error(err);
      if (mountedRef ? mountedRef.current : true) setError(err?.message || "Unable to load QA projects.");
    } finally {
      if (mountedRef ? mountedRef.current : true) setLoading(false);
    }
  }

  useEffect(() => {
    const mountedRef = { current: true };
    void loadQA(mountedRef);
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshQA = () => {
    void loadQA();
  };

  const finalProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((project) => {
      if (project.stage !== "Final") return false;
      if (typeFilter !== "all" && project.projectType !== typeFilter) return false;
      if (ownerFilter && project.ownerAmUid !== ownerFilter) return false;
      if (productionFilter && project.productionUid !== productionFilter) return false;
      if (q) {
        const hay = [project.projectName, project.clientName, project.ownerAmName, project.productionName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [projects, search, typeFilter, ownerFilter, productionFilter]);

  const kpis = useMemo(() => {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return finalProjects.reduce(
      (acc, project) => {
        acc.inFinal += 1;
        if (project.updatedAt) {
          const updated = new Date(project.updatedAt);
          if (!Number.isNaN(updated.getTime()) && updated >= startOfToday) acc.approvedToday += 1;
        }
        return acc;
      },
      { inFinal: 0, approvedToday: 0, sentBack: 0 }
    );
  }, [finalProjects]);

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
        <div style={sectionTitleStyle}>QA Filters</div>
        <div
          className="card"
          style={{
            padding: 14,
            borderRadius: 16,
            background: isDark ? "rgba(24,24,24,0.9)" : "rgba(255,255,255,0.85)",
            border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
            boxShadow: isDark ? "0 14px 28px rgba(0,0,0,0.32)" : "0 12px 24px rgba(15,23,42,0.06)",
            display: "grid",
            gridTemplateColumns: "minmax(220px, 1.3fr) repeat(auto-fit, minmax(170px, 1fr))",
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
            value={typeFilter}
            onChange={setTypeFilter}
            placeholder="Project Type"
            isDark={isDark}
            options={[
              { value: "all", label: "All Types" },
              ...projectTypes.map((type) => ({ value: type, label: type })),
            ]}
          />
          <MasterSelect
            value={ownerFilter}
            onChange={setOwnerFilter}
            placeholder="Owner (AM)"
            isDark={isDark}
            options={[{ value: "", label: "All Owners" }, ...ownerOptions]}
          />
          <MasterSelect
            value={productionFilter}
            onChange={setProductionFilter}
            placeholder="Production Owner"
            isDark={isDark}
            options={[{ value: "", label: "All Production" }, ...productionUsers]}
          />
        </div>
      </section>

      <section style={{ display: "grid", gap: 12 }}>
        <div style={sectionTitleStyle}>QA KPIs</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <KpiCard label="In Final" value={kpis.inFinal} />
          <KpiCard label="Approved Today" value={kpis.approvedToday} />
          <KpiCard label="Sent Back" value={kpis.sentBack} />
        </div>
      </section>

      <section style={{ display: "grid", gap: 12 }}>
        <div style={sectionTitleStyle}>QA & Approvals</div>
        {loading ? (
          <div style={{ fontSize: 14, opacity: 0.7 }}>Loading QA queue…</div>
        ) : error ? (
          <div style={{ fontSize: 14, color: "#dc2626" }}>{error}</div>
        ) : (
          <div style={tableShellStyle}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={headerCellStyle}>Project</th>
                    <th style={headerCellStyle}>Client</th>
                    <th style={headerCellStyle}>Production Owner</th>
                    <th style={headerCellStyle}>Owner (AM)</th>
                    <th style={{ ...headerCellStyle, textAlign: "center" }}>Updated</th>
                    <th style={{ ...headerCellStyle, textAlign: "center" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {finalProjects.length === 0 ? (
                    <tr>
                      <td style={{ ...cellStyle, textAlign: "left" }} colSpan={6}>
                        No projects ready for QA.
                      </td>
                    </tr>
                  ) : (
                    finalProjects.map((project, idx) => {
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
                          <td style={{ ...cellStyle, textAlign: "left" }}>{project.productionName || "Unassigned"}</td>
                          <td style={{ ...cellStyle, textAlign: "left" }}>{project.ownerAmName || "Unassigned"}</td>
                          <td style={{ ...cellStyle, textAlign: "center" }}>{fmtDate(project.updatedAt)}</td>
                          <td style={{ ...cellStyle, textAlign: "center" }}>
                            <button className="btn ghost" onClick={() => openDrawer(project)}>
                              Review
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
        productionUsers={productionUsers}
        mode="qa"
        onClose={closeDrawer}
        onProjectUpdated={handleProjectUpdated}
        onRefresh={refreshQA}
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
