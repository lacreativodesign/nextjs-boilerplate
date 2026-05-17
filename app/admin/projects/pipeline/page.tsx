"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toastError } from "@/lib/toast";

type ProjectStage =
  | "Inquiry"
  | "Deposit"
  | "Kickoff"
  | "Draft"
  | "Review"
  | "Revisions"
  | "Final"
  | "Delivered";

type ProjectPriority = "Low" | "Normal" | "High" | "Urgent";

type ProjectHealth = "On Track" | "At Risk" | "Overdue";

type StageHistoryEntry = {
  from: string;
  to: string;
  byUid: string;
  byName: string;
  at: string | null;
};

type ProjectRecord = {
  id: string;
  projectCode?: string | null;
  projectName: string;
  clientId: string;
  clientName: string;
  projectType: string;
  stage: ProjectStage | string;
  priority: ProjectPriority | string;
  health?: ProjectHealth | string;
  createdByUid?: string;
  createdByName?: string;
  ownerAmUid?: string | null;
  ownerAmName?: string | null;
  productionUid?: string | null;
  productionName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  lastActivityAt?: string | null;
  stageHistory?: StageHistoryEntry[];
  stageTimestamps?: Record<string, string>;
  totalPaidUsd?: number;
  outstandingUsd?: number;
  internalNotes?: string;
};

type CurrentUser = {
  uid: string;
  role: string;
  name?: string;
};

type UserOption = {
  uid: string;
  name?: string;
  role?: string;
};

type FilterOption = {
  value: string;
  label: string;
};

type ErrorState = {
  title: string;
  message: string;
};

const LOCKED_STAGES: ProjectStage[] = [
  "Deposit",
  "Kickoff",
  "Draft",
  "Review",
  "Revisions",
  "Final",
  "Delivered",
];
const LEGACY_STAGE = "Legacy";
const PRIORITIES: ProjectPriority[] = ["Low", "Normal", "High", "Urgent"];
const HEALTH_OPTIONS: ProjectHealth[] = ["On Track", "At Risk", "Overdue"];
const ACCOUNT_MANAGER_STAGES: ProjectStage[] = ["Kickoff", "Draft", "Review", "Revisions", "Final", "Delivered"];
const PRODUCTION_STAGES: ProjectStage[] = ["Draft", "Review", "Revisions", "Final"];

function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function computeHealth(dueDate?: string | null, stage?: string): ProjectHealth {
  if (stage === "Delivered") return "On Track";
  if (!dueDate) return "On Track";
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return "On Track";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = due.getTime() - startOfToday.getTime();
  if (diffMs < 0) return "Overdue";
  if (diffMs <= 48 * 60 * 60 * 1000) return "At Risk";
  return "On Track";
}

function getBadgeClass(value: string): string {
  const t = (value || "").toLowerCase();
  if (t.includes("high") || t.includes("critical") || t.includes("overdue") || t.includes("rejected") || t.includes("failed") || t.includes("cancelled") || t.includes("canceled"))
    return "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-red-500/10 text-red-500";
  if (t.includes("medium") || t.includes("pending") || t.includes("review") || t.includes("draft") || t.includes("waiting"))
    return "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-amber-500/10 text-amber-600";
  if (t.includes("low") || t.includes("completed") || t.includes("approved") || t.includes("active") || t.includes("done"))
    return "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-green-500/10 text-green-600";
  if (t.includes("progress") || t.includes("open") || t.includes("new") || t.includes("design") || t.includes("dev"))
    return "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-[var(--erp-blue-soft)] text-[var(--erp-blue)]";
  return "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-[var(--surface-muted)] text-[var(--text-muted)]";
}

function normalizeRole(role?: string) {
  return (role || "").toLowerCase();
}

function canViewOwners(role?: string) {
  const r = normalizeRole(role);
  return r === "admin" || r === "super_admin" || r === "sales_manager";
}

function canViewProduction(role?: string) {
  const r = normalizeRole(role);
  return r === "admin" || r === "super_admin";
}

function isAdmin(role?: string) {
  const r = normalizeRole(role);
  return r === "admin" || r === "super_admin";
}

function isSalesManager(role?: string) {
  return normalizeRole(role) === "sales_manager";
}

function isAccountManager(role?: string) {
  return normalizeRole(role) === "am";
}

function isProduction(role?: string) {
  return normalizeRole(role) === "production";
}

function getAllowedStages(project: ProjectRecord, currentUser: CurrentUser | null) {
  if (!currentUser) return [] as ProjectStage[];
  const role = normalizeRole(currentUser.role);
  const stage = project.stage || "Inquiry";

  if (isAdmin(role)) {
    return LOCKED_STAGES;
  }

  if (isSalesManager(role)) {
    if (stage === "Deposit") return ["Kickoff"];
    if (stage === "Inquiry") return ["Deposit"];
    return [];
  }

  if (isAccountManager(role)) {
    const ownerUid = project.ownerAmUid || null;
    const createdByUid = project.createdByUid || null;
    const unassigned = !ownerUid;
    const canAccess = ownerUid === currentUser.uid || (unassigned && createdByUid === currentUser.uid);
    if (!canAccess) return [];
    if (!ACCOUNT_MANAGER_STAGES.includes(stage as ProjectStage)) return [];
    return ACCOUNT_MANAGER_STAGES;
  }

  if (isProduction(role)) {
    if (project.productionUid !== currentUser.uid) return [];
    if (!PRODUCTION_STAGES.includes(stage as ProjectStage)) return [];
    return PRODUCTION_STAGES;
  }

  return [];
}

export default function DeliveryPipelinePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);

  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  const [query, setQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [productionFilter, setProductionFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [healthFilter, setHealthFilter] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  const [users, setUsers] = useState<UserOption[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ProjectRecord | null>(null);
  const [movingProjectId, setMovingProjectId] = useState<string | null>(null);

  const ownerOptions = useMemo(() => {
    const ams = users.filter((u) => (u.role || "").toLowerCase() === "am");
    return ams.length ? ams : [];
  }, [users]);

  const productionOptions = useMemo(() => {
    const prod = users.filter((u) => (u.role || "").toLowerCase() === "production");
    return prod.length ? prod : [];
  }, [users]);

  const fetchPipeline = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (ownerFilter) params.set("owner", ownerFilter);
      if (productionFilter) params.set("production", productionFilter);
      if (priorityFilter) params.set("priority", priorityFilter);
      if (onlyOverdue) {
        params.set("health", "Overdue");
      } else if (healthFilter) {
        params.set("health", healthFilter);
      }

      const res = await fetch(`/api/admin/projects/pipeline?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || res.statusText || "Failed to load pipeline");
      }

      setProjects(Array.isArray(json?.projects) ? json.projects : []);
      setCurrentUser(json?.currentUser || null);
    } catch (e: any) {
      console.error("Failed to load pipeline:", e);
      setError({
        title: "Pipeline can’t load yet",
        message: e?.message || "Unable to load pipeline right now.",
      });
      setProjects([]);
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  }, [healthFilter, onlyOverdue, ownerFilter, priorityFilter, productionFilter, query]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPipeline();
    }, 250);

    return () => clearTimeout(timer);
  }, [fetchPipeline]);

  useEffect(() => {
    let alive = true;

    async function loadUsers() {
      try {
        const res = await fetch("/api/admin/users/list", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        const json = await res.json().catch(() => null);
        if (!res.ok) return;
        const list: any[] = Array.isArray(json) ? json : Array.isArray((json as any)?.users) ? (json as any).users : [];
        if (!alive) return;
        setUsers(
          list.map((u) => ({
            uid: u.uid || u.id || u.docId || u.userId || u.firebaseUid || "",
            name: u.name || u.fullName || u.displayName || u.email || "",
            role: u.role || "",
          }))
        );
      } catch {
        if (!alive) return;
        setUsers([]);
      }
    }

    loadUsers();
    return () => {
      alive = false;
    };
  }, []);

  const normalizedProjects = useMemo(() => {
    return projects.map((project) => ({
      ...project,
      health: project.health || computeHealth(project.dueDate, project.stage),
    }));
  }, [projects]);

  const grouped = useMemo(() => {
    const groups: Record<string, ProjectRecord[]> = {
      [LEGACY_STAGE]: [],
      Deposit: [],
      Kickoff: [],
      Draft: [],
      Review: [],
      Revisions: [],
      Final: [],
      Delivered: [],
    };

    normalizedProjects.forEach((project) => {
      const stage = LOCKED_STAGES.includes(project.stage as ProjectStage) ? project.stage : LEGACY_STAGE;
      if (!groups[stage]) groups[stage] = [];
      groups[stage].push(project);
    });

    return groups;
  }, [normalizedProjects]);

  const kpis = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    return normalizedProjects.reduce(
      (acc, project) => {
        const health = project.health || computeHealth(project.dueDate, project.stage);
        if (project.stage !== "Delivered") acc.totalActive += 1;
        if (health === "Overdue") acc.overdue += 1;
        if (health === "At Risk") acc.atRisk += 1;
        if (project.stage === "Delivered") {
          const deliveredAt = project.stageTimestamps?.Delivered || project.updatedAt;
          if (deliveredAt) {
            const deliveredDate = new Date(deliveredAt);
            if (!Number.isNaN(deliveredDate.getTime()) && deliveredDate >= weekAgo) acc.deliveredRecent += 1;
          }
        }
        return acc;
      },
      { totalActive: 0, overdue: 0, atRisk: 0, deliveredRecent: 0 }
    );
  }, [normalizedProjects]);

  const pipelineStages = useMemo(() => [LEGACY_STAGE, ...LOCKED_STAGES], []);
  const columnTemplate = useMemo(
    () => `repeat(${pipelineStages.length}, minmax(280px, 1fr))`,
    [pipelineStages.length]
  );

  function openDrawer(project: ProjectRecord) {
    setSelected(project);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSelected(null);
  }

  async function handleMoveStage(project: ProjectRecord, toStage: ProjectStage) {
    if (!project || !toStage) return;

    const prevStage = project.stage;
    setMovingProjectId(project.id);

    setProjects((prev) =>
      prev.map((item) =>
        item.id === project.id
          ? {
              ...item,
              stage: toStage,
              lastActivityAt: new Date().toISOString(),
            }
          : item
      )
    );

    try {
      const res = await fetch("/api/admin/projects/move-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId: project.id,
          toStage,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to move stage");
      }

      const updated = json?.project;
      if (updated?.id) {
        setProjects((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      }

      await fetchPipeline();
    } catch (e: any) {
      console.error("Move stage failed:", e);
      setProjects((prev) => prev.map((item) => (item.id === project.id ? { ...item, stage: prevStage } : item)));
      toastError(e?.message || "Unable to move stage right now.");
    } finally {
      setMovingProjectId(null);
    }
  }

  return (
    <div style={{ width: "100%" }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Delivery Pipeline</h1>
          <div className="page-subtitle">Live pipeline view across every delivery stage with role-based controls.</div>
        </div>
      </div>

      <div className="kpis pipeline-kpis" style={{ marginTop: 20 }}>
        {[
          { label: "Total Active", value: kpis.totalActive },
          { label: "Overdue", value: kpis.overdue },
          { label: "At Risk", value: kpis.atRisk },
          { label: "Delivered (7d)", value: kpis.deliveredRecent },
        ].map((card) => (
          <div
            key={card.label}
            className="card kpi-card"
            style={{ padding: "16px 18px" }}
          >
            <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.65 }}>
              {card.label}
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div className="card filter-bar filter-bar--search" style={{ marginTop: 20, padding: 14 }}>
        <input className="input" placeholder="Search keyword" value={query} onChange={(e) => setQuery(e.target.value)} />
        {canViewOwners(currentUser?.role) && (
          <FilterSelect
            value={ownerFilter}
            onChange={setOwnerFilter}
            placeholder="Owner (AM)"
            
            options={[
              { value: "", label: "All Owners" },
              { value: "unassigned", label: "Unassigned" },
              ...ownerOptions.map((owner) => ({ value: owner.uid, label: owner.name || owner.uid })),
            ]}
          />
        )}
        {canViewProduction(currentUser?.role) && (
          <FilterSelect
            value={productionFilter}
            onChange={setProductionFilter}
            placeholder="Production"
            
            options={[
              { value: "", label: "All Production" },
              { value: "unassigned", label: "Unassigned" },
              ...productionOptions.map((owner) => ({ value: owner.uid, label: owner.name || owner.uid })),
            ]}
          />
        )}
        <FilterSelect
          value={priorityFilter}
          onChange={setPriorityFilter}
          placeholder="Priority"
          
          options={[
            { value: "", label: "All Priorities" },
            ...PRIORITIES.map((priority) => ({ value: priority, label: priority })),
          ]}
        />
        <FilterSelect
          value={healthFilter}
          onChange={setHealthFilter}
          placeholder="Health"
          
          options={[{ value: "", label: "All Health" }, ...HEALTH_OPTIONS.map((h) => ({ value: h, label: h }))]}
        />
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: "var(--text-muted)",
          }}
        >
          <input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} />
          Only overdue
        </label>
      </div>

      <div className="table-shell">
        <div style={{ marginTop: 18, padding: 14 }}>
        {loading ? (
          <p style={{ fontSize: 14 }}>
            Loading pipeline...
          </p>
        ) : error ? (
          <div
            className="card"
            style={{
              padding: 16,
              borderRadius: 16,
              border: "1px solid var(--border-subtle)",
              background: "var(--danger-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{error.title}</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>{error.message}</div>
            </div>
            <button
              type="button"
              className="btn ghost"
              onClick={fetchPipeline}
              style={{ borderRadius: 999, padding: "8px 16px", fontWeight: 500 }}
            >
              Retry
            </button>
          </div>
        ) : normalizedProjects.length === 0 ? (
          <div
            className="card"
            style={{
              padding: 16,
              borderRadius: 16,
              fontSize: 14,
            }}
          >
            No projects in pipeline.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            <div className="overflow-x-auto" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: columnTemplate,
                  gap: 14,
                  minWidth: 280 * pipelineStages.length,
                  whiteSpace: "nowrap",
                }}
              >
              {pipelineStages.map((stage) => {
                const items = grouped[stage] || [];
                return (
                  <div
                    key={stage}
                    className="card"
                    style={{
                      padding: 14,
                      borderRadius: 16,
                      border: "1px solid var(--border-subtle)",
                      background: "var(--surface-card)",
                      boxShadow: "var(--shadow-md)",
                      display: "grid",
                      gap: 12,
                      minWidth: 280,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{stage}</div>
                        <div style={{ fontSize: 12, opacity: 0.65 }}>{items.length} projects</div>
                      </div>
                      {stage !== "Delivered" && (
                        <span
                          style={{
                            padding: "4px 10px",
                            borderRadius: 999,
                            fontSize: 11,
                            background: "var(--surface-muted)",
                            color: "var(--text-muted)",
                          }}
                        >
                          WIP {items.length}
                        </span>
                      )}
                    </div>

                    <div style={{ display: "grid", gap: 10 }}>
                      {items.map((project) => {
                        const allowedStages = getAllowedStages(project, currentUser).filter((s) => s !== project.stage);
                        return (
                          <div
                            key={project.id}
                            className="card"
                            style={{
                              padding: 12,
                              borderRadius: 12,
                              border: "1px solid var(--border-subtle)",
                              background: "var(--surface-muted)",
                              display: "grid",
                              gap: 10,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                              <div style={{ display: "grid", gap: 4 }}>
                                <div style={{ fontWeight: 700, fontSize: 14 }}>{project.projectName}</div>
                                <div style={{ fontSize: 12, opacity: 0.75 }}>{project.clientName || "-"}</div>
                              </div>
                              <button
                                type="button"
                                className="btn ghost"
                                onClick={() => openDrawer(project)}
                                style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12 }}
                              >
                                View
                              </button>
                            </div>

                            <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                <span style={{ opacity: 0.65 }}>Owner</span>
                                <span>{project.ownerAmName || "Unassigned"}</span>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                <span style={{ opacity: 0.65 }}>Due</span>
                                <span>{fmtDate(project.dueDate)}</span>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                <span style={{ opacity: 0.65 }}>Priority</span>
                                <span className={getBadgeClass(project.priority || "Normal")}>{project.priority || "Normal"}</span>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                <span style={{ opacity: 0.65 }}>Health</span>
                                <span className={getBadgeClass(project.health || "On Track")}>
                                  {project.health || "On Track"}
                                </span>
                              </div>
                            </div>

                            {allowedStages.length > 0 ? (
                              <label style={{ display: "grid", gap: 6 }}>
                                <span style={{ fontSize: 11, opacity: 0.7 }}>Move stage</span>
                                <select
                                  className="input"
                                  value=""
                                  disabled={movingProjectId === project.id}
                                  onChange={(e) => {
                                    const value = e.target.value as ProjectStage;
                                    if (!value) return;
                                    handleMoveStage(project, value);
                                  }}
                                >
                                  <option value="">Select stage</option>
                                  {allowedStages.map((stageOption) => (
                                    <option key={stageOption} value={stageOption}>
                                      {stageOption}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ) : (
                              <div style={{ fontSize: 11, opacity: 0.6 }}>No stage movement permissions.</div>
                            )}
                          </div>
                        );
                      })}

                      {items.length === 0 && (
                        <div style={{ fontSize: 12, opacity: 0.6 }}>No projects here.</div>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          </div>
        )}
      </div>
      </div>

      {drawerOpen && selected && (
        <div className="drawer-overlay" onClick={closeDrawer}>
          <div className="drawer-panel drawer-panel--md" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text-primary)" }}>
                  {selected.projectName}
                </div>
                <div style={{ opacity: 0.75, fontSize: 12, color: "var(--text-muted)" }}>
                  {selected.clientName} · {selected.projectType}
                </div>
              </div>

              <button className="btn ghost" onClick={closeDrawer} style={{ height: 34, borderRadius: 999, fontWeight: 900 }}>
                Close
              </button>
            </div>

            <div style={{ height: 16 }} />

            <Section title="Project Details" >
              <InfoRow label="Stage" value={selected.stage || "-"}  />
              <InfoRow label="Owner (AM)" value={selected.ownerAmName || "Unassigned"}  />
              <InfoRow label="Production" value={selected.productionName || "Unassigned"}  />
              <InfoRow label="Priority" value={selected.priority || "Normal"}  />
              <InfoRow label="Health" value={selected.health || "On Track"}  />
              <InfoRow label="Due Date" value={fmtDate(selected.dueDate)}  />
            </Section>

            <div style={{ height: 12 }} />

            <Section title="Activity" >
              <InfoRow label="Created" value={fmtDateTime(selected.createdAt)}  />
              <InfoRow label="Updated" value={fmtDateTime(selected.updatedAt)}  />
              <InfoRow label="Last Activity" value={fmtDateTime(selected.lastActivityAt)}  />
            </Section>

            <div style={{ height: 12 }} />

            <Section title="Stage History" >
              {selected.stageHistory && selected.stageHistory.length > 0 ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {[...selected.stageHistory]
                    .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
                    .map((entry, idx) => (
                      <div
                        key={`${entry.at}-${idx}`}
                        style={{
                          padding: 10,
                          borderRadius: 10,
                          border: "1px solid var(--border-subtle)",
                          display: "grid",
                          gap: 4,
                          fontSize: 12,
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>
                          {entry.from || "-"} → {entry.to || "-"}
                        </div>
                        <div style={{ opacity: 0.7 }}>Moved by {entry.byName || entry.byUid || "-"}</div>
                        <div style={{ opacity: 0.6 }}>{fmtDateTime(entry.at)}</div>
                      </div>
                    ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, opacity: 0.7 }}>No stage history yet.</div>
              )}
            </Section>

            <div style={{ height: 16 }} />

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={closeDrawer} style={{ borderRadius: 12, fontWeight: 400 }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="card"
      style={{
        padding: 14,
        borderRadius: 14,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.06em", opacity: 0.75 }}>{title}</div>
      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 12,
        border: "1px solid var(--border-subtle)",
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 900 }}>{label}</div>
      <div style={{ fontWeight: 800, textAlign: "right" }}>{value}</div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selected = options.find((option) => option.value === value);
  const label = selected?.label || placeholder;
  const isPlaceholder = !value;

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="input"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
          }
          if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span
          style={{
            color: isPlaceholder ? "var(--text-muted)" : "inherit",
          }}
        >
          {label}
        </span>
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-muted)",
          }}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          tabIndex={-1}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            width: "100%",
            zIndex: 20,
            padding: 8,
            borderRadius: 12,
            border: "1px solid var(--border-subtle)",
            background: "var(--surface-card)",
            boxShadow: "var(--shadow-md)",
            display: "grid",
            gap: 4,
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value || option.label}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "none",
                  background: active ? "var(--surface-muted)" : "transparent",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = "var(--surface-muted)";
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = active ? "var(--surface-muted)" : "transparent";
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
