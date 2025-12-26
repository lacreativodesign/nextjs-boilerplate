"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

function getStatusStyles(label: string, isDark: boolean) {
  const base = {
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 500,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 82,
  } as const;

  const token = label.toLowerCase();

  if (token.includes("overdue") || token.includes("urgent")) {
    return {
      ...base,
      color: isDark ? "#fecaca" : "#b91c1c",
      background: isDark ? "rgba(239,68,68,0.18)" : "rgba(239,68,68,0.12)",
      border: "1px solid rgba(239,68,68,0.35)",
    };
  }

  if (token.includes("risk") || token.includes("high")) {
    return {
      ...base,
      color: isDark ? "#fde68a" : "#b45309",
      background: isDark ? "rgba(245,158,11,0.18)" : "rgba(245,158,11,0.12)",
      border: "1px solid rgba(245,158,11,0.35)",
    };
  }

  if (token.includes("delivered") || token.includes("final")) {
    return {
      ...base,
      color: isDark ? "#bbf7d0" : "#047857",
      background: isDark ? "rgba(34,197,94,0.18)" : "rgba(34,197,94,0.12)",
      border: "1px solid rgba(34,197,94,0.30)",
    };
  }

  return {
    ...base,
    color: isDark ? "#bfdbfe" : "#1d4ed8",
    background: isDark ? "rgba(59,130,246,0.18)" : "rgba(59,130,246,0.10)",
    border: "1px solid rgba(59,130,246,0.28)",
  };
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
  return normalizeRole(role) === "account_manager";
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
  const isDark = useIsSystemDark();

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
    const ams = users.filter((u) => (u.role || "").toLowerCase() === "account_manager");
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
    () => `repeat(${pipelineStages.length}, minmax(260px, 1fr))`,
    [pipelineStages.length]
  );

  const tableShellStyle: React.CSSProperties = {
    borderRadius: 20,
    padding: 14,
    border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.10)",
    background: isDark ? "rgba(20,20,20,0.92)" : "rgba(255,255,255,0.85)",
    boxShadow: isDark ? "0 18px 40px rgba(0,0,0,0.45)" : "0 18px 55px rgba(15,23,42,0.10)",
  };

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
      alert(e?.message || "Unable to move stage right now.");
    } finally {
      setMovingProjectId(null);
    }
  }

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1
            style={{
              fontSize: 34,
              fontWeight: 900,
              marginBottom: 8,
              color: isDark ? "rgba(255,255,255,0.95)" : "rgba(15,23,42,0.95)",
            }}
          >
            Delivery Pipeline
          </h1>
          <div style={{ color: isDark ? "rgba(255,255,255,0.75)" : "rgba(15,23,42,0.65)" }}>
            Live pipeline view across every delivery stage with role-based controls.
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginTop: 20,
        }}
      >
        {[
          { label: "Total Active", value: kpis.totalActive },
          { label: "Overdue", value: kpis.overdue },
          { label: "At Risk", value: kpis.atRisk },
          { label: "Delivered (7d)", value: kpis.deliveredRecent },
        ].map((card) => (
          <div
            key={card.label}
            className="card"
            style={{
              padding: "16px 18px",
              borderRadius: 16,
              border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.10)",
              background: isDark ? "rgba(26,26,26,0.92)" : "rgba(255,255,255,0.9)",
              boxShadow: isDark ? "0 14px 28px rgba(0,0,0,0.35)" : "0 12px 24px rgba(15,23,42,0.08)",
              transition: "transform 140ms ease, box-shadow 140ms ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)";
              (e.currentTarget as HTMLDivElement).style.boxShadow = isDark
                ? "0 20px 36px rgba(0,0,0,0.4)"
                : "0 18px 30px rgba(15,23,42,0.12)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
              (e.currentTarget as HTMLDivElement).style.boxShadow = isDark
                ? "0 14px 28px rgba(0,0,0,0.35)"
                : "0 12px 24px rgba(15,23,42,0.08)";
            }}
          >
            <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.65 }}>
              {card.label}
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div
        className="card"
        style={{
          marginTop: 20,
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
        <input className="input" placeholder="Search keyword" value={query} onChange={(e) => setQuery(e.target.value)} />
        {canViewOwners(currentUser?.role) && (
          <FilterSelect
            value={ownerFilter}
            onChange={setOwnerFilter}
            placeholder="Owner (AM)"
            isDark={isDark}
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
            isDark={isDark}
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
          isDark={isDark}
          options={[
            { value: "", label: "All Priorities" },
            ...PRIORITIES.map((priority) => ({ value: priority, label: priority })),
          ]}
        />
        <FilterSelect
          value={healthFilter}
          onChange={setHealthFilter}
          placeholder="Health"
          isDark={isDark}
          options={[{ value: "", label: "All Health" }, ...HEALTH_OPTIONS.map((h) => ({ value: h, label: h }))]}
        />
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: isDark ? "rgba(226,232,240,0.8)" : "rgba(15,23,42,0.7)",
          }}
        >
          <input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} />
          Only overdue
        </label>
      </div>

      <div style={{ marginTop: 18, ...tableShellStyle }}>
        {loading ? (
          <p style={{ fontSize: 14, color: isDark ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.70)" }}>
            Loading pipeline...
          </p>
        ) : error ? (
          <div
            className="card"
            style={{
              padding: 16,
              borderRadius: 16,
              border: isDark ? "1px solid rgba(248,113,113,0.35)" : "1px solid rgba(248,113,113,0.4)",
              background: isDark ? "rgba(127,29,29,0.25)" : "rgba(254,226,226,0.45)",
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
              border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
              background: isDark ? "rgba(24,24,24,0.9)" : "rgba(255,255,255,0.85)",
              color: isDark ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.7)",
              fontSize: 14,
            }}
          >
            No projects in pipeline.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ overflowX: "auto" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: columnTemplate,
                  gap: 14,
                  minWidth: 260 * pipelineStages.length,
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
                      border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
                      background: isDark ? "rgba(28,28,28,0.92)" : "rgba(255,255,255,0.92)",
                      boxShadow: isDark ? "0 14px 28px rgba(0,0,0,0.3)" : "0 12px 24px rgba(15,23,42,0.06)",
                      display: "grid",
                      gap: 12,
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
                            background: isDark ? "rgba(148,163,184,0.2)" : "rgba(37,99,235,0.1)",
                            color: isDark ? "rgba(226,232,240,0.8)" : "rgba(37,99,235,0.9)",
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
                              border: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(15,23,42,0.08)",
                              background: isDark ? "rgba(20,20,20,0.9)" : "rgba(248,250,252,0.9)",
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
                                <span style={getStatusStyles(project.priority || "Normal", isDark)}>{project.priority || "Normal"}</span>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                <span style={{ opacity: 0.65 }}>Health</span>
                                <span style={getStatusStyles(project.health || "On Track", isDark)}>
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

      {drawerOpen && selected && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: isDark ? "rgba(0,0,0,0.55)" : "rgba(15,23,42,0.35)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
          onClick={closeDrawer}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: "min(540px, 92vw)",
              height: "100%",
              padding: 18,
              background: isDark ? "rgba(20,20,20,0.98)" : "rgba(255,255,255,0.96)",
              borderLeft: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
              borderTopLeftRadius: 24,
              borderBottomLeftRadius: 24,
              boxShadow: isDark ? "-12px 0 32px rgba(0,0,0,0.45)" : "-12px 0 28px rgba(15,23,42,0.08)",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, color: isDark ? "#fff" : "#0f172a" }}>
                  {selected.projectName}
                </div>
                <div style={{ opacity: 0.75, fontSize: 12, color: isDark ? "rgba(255,255,255,0.75)" : "#334155" }}>
                  {selected.clientName} · {selected.projectType}
                </div>
              </div>

              <button className="btn ghost" onClick={closeDrawer} style={{ height: 34, borderRadius: 999, fontWeight: 400 }}>
                Close
              </button>
            </div>

            <div style={{ height: 16 }} />

            <Section title="Project Details" isDark={isDark}>
              <InfoRow label="Stage" value={selected.stage || "-"} isDark={isDark} />
              <InfoRow label="Owner (AM)" value={selected.ownerAmName || "Unassigned"} isDark={isDark} />
              <InfoRow label="Production" value={selected.productionName || "Unassigned"} isDark={isDark} />
              <InfoRow label="Priority" value={selected.priority || "Normal"} isDark={isDark} />
              <InfoRow label="Health" value={selected.health || "On Track"} isDark={isDark} />
              <InfoRow label="Due Date" value={fmtDate(selected.dueDate)} isDark={isDark} />
            </Section>

            <div style={{ height: 12 }} />

            <Section title="Activity" isDark={isDark}>
              <InfoRow label="Created" value={fmtDateTime(selected.createdAt)} isDark={isDark} />
              <InfoRow label="Updated" value={fmtDateTime(selected.updatedAt)} isDark={isDark} />
              <InfoRow label="Last Activity" value={fmtDateTime(selected.lastActivityAt)} isDark={isDark} />
            </Section>

            <div style={{ height: 12 }} />

            <Section title="Stage History" isDark={isDark}>
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
                          border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
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

function Section({ title, children, isDark }: { title: string; children: React.ReactNode; isDark: boolean }) {
  return (
    <div
      className="card"
      style={{
        padding: 14,
        borderRadius: 14,
        background: isDark ? "rgba(255,255,255,0.03)" : "rgba(15,23,42,0.02)",
        border: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(15,23,42,0.06)",
        display: "grid",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.06em", opacity: 0.75 }}>{title}</div>
      {children}
    </div>
  );
}

function InfoRow({ label, value, isDark }: { label: string; value: string; isDark: boolean }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 12,
        border: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 400 }}>{label}</div>
      <div style={{ fontWeight: 400, textAlign: "right" }}>{value}</div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
  isDark,
}: {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  placeholder: string;
  isDark: boolean;
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
            color: isPlaceholder ? (isDark ? "rgba(226,232,240,0.55)" : "rgba(100,116,139,0.9)") : "inherit",
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
            color: isDark ? "rgba(148,163,184,0.9)" : "rgba(100,116,139,0.9)",
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
            border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
            background: isDark ? "rgba(22,22,22,0.98)" : "#ffffff",
            boxShadow: isDark ? "0 20px 40px rgba(0,0,0,0.45)" : "0 18px 30px rgba(15,23,42,0.12)",
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
                  background: active
                    ? isDark
                      ? "rgba(148,163,184,0.20)"
                      : "rgba(37,99,235,0.10)"
                    : "transparent",
                  color: isDark ? "rgba(226,232,240,0.9)" : "rgba(15,23,42,0.9)",
                  cursor: "pointer",
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = isDark ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.06)";
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = active
                    ? isDark
                      ? "rgba(148,163,184,0.20)"
                      : "rgba(37,99,235,0.10)"
                    : "transparent";
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
