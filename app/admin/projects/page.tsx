"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ProjectStage =
  | "Inquiry"
  | "Deposit"
  | "Kickoff"
  | "Draft"
  | "Review"
  | "Revisions"
  | "Final"
  | "Delivered";

type ProjectType = "Website" | "Branding" | "SEO" | "Social" | "Video" | "Other";

type ProjectPriority = "Low" | "Normal" | "High" | "Urgent";

type ProjectHealth = "On Track" | "At Risk" | "Overdue";

type ProjectRecord = {
  id: string;
  projectCode?: string | null;
  projectName: string;
  clientId: string;
  clientName: string;
  projectType: ProjectType | string;
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
  totalPaidUsd?: number;
  outstandingUsd?: number;
  internalNotes?: string;
};

type CurrentUser = {
  uid: string;
  role: string;
  name?: string;
};

type ErrorState = {
  title: string;
  message: string;
};

type ClientOption = {
  id: string;
  companyName: string;
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

type SortKey =
  | "projectName"
  | "clientName"
  | "projectType"
  | "stage"
  | "priority"
  | "dueDate"
  | "health"
  | "updatedAt";

type SortDir = "asc" | "desc";

const PROJECT_TYPES: ProjectType[] = ["Website", "Branding", "SEO", "Social", "Video", "Other"];
const PIPELINE_STAGES: ProjectStage[] = [
  "Inquiry",
  "Deposit",
  "Kickoff",
  "Draft",
  "Review",
  "Revisions",
  "Final",
  "Delivered",
];
const CREATE_PIPELINE_STAGES: ProjectStage[] = ["Kickoff", "Draft", "Review", "Revisions", "Final", "Delivered"];
const PRIORITIES: ProjectPriority[] = ["Low", "Normal", "High", "Urgent"];

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

function toInputDate(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function computeHealth(dueDate?: string | null): ProjectHealth {
  if (!dueDate) return "On Track";
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return "On Track";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = due.getTime() - startOfToday.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "Overdue";
  if (diffDays <= 7) return "At Risk";
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

function canCreate(role?: string) {
  const r = (role || "").toLowerCase();
  return r === "super_admin" || r === "admin" || r === "sales_manager" || r === "account_manager";
}

function isAdmin(role?: string) {
  const r = (role || "").toLowerCase();
  return r === "admin" || r === "super_admin";
}

export default function AllProjectsPage() {
  const isDark = useIsSystemDark();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);

  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");

  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ProjectRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);

  const [createForm, setCreateForm] = useState({
    projectName: "",
    clientId: "",
    projectType: "Website",
    stage: "Kickoff",
    dueDate: "",
    ownerAmUid: "",
    priority: "Normal",
  });

  const [editForm, setEditForm] = useState({
    projectName: "",
    projectType: "Website",
    stage: "Inquiry",
    priority: "Normal",
    ownerAmUid: "",
    productionUid: "",
    startDate: "",
    dueDate: "",
    internalNotes: "",
  });

  const ownerOptions = useMemo(() => {
    const ams = users.filter((u) => (u.role || "").toLowerCase() === "account_manager");
    if (ams.length) return ams;
    if (currentUser?.role?.toLowerCase() === "account_manager") {
      return [{ uid: currentUser.uid, name: currentUser.name, role: currentUser.role }];
    }
    return [];
  }, [users, currentUser]);

  const productionOptions = useMemo(() => {
    const prod = users.filter((u) => (u.role || "").toLowerCase() === "production");
    return prod.length ? prod : users;
  }, [users]);

  useEffect(() => {
    let alive = true;

    async function loadProjects() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (stageFilter) params.set("stage", stageFilter);
        if (typeFilter) params.set("type", typeFilter);
        if (priorityFilter) params.set("priority", priorityFilter);

        const res = await fetch(`/api/admin/projects/list?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || res.statusText || "Failed to load projects");
        }

        if (!alive) return;
        setProjects(Array.isArray(json?.projects) ? json.projects : []);
        setCurrentUser(json?.currentUser || null);
      } catch (e: any) {
        if (!alive) return;
        console.error("Failed to load projects:", e);
        setError({
          title: "Projects can’t load yet",
          message: e?.message || "Unable to load projects right now.",
        });
        setProjects([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    const timer = setTimeout(() => {
      loadProjects();
    }, 250);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, stageFilter, typeFilter, priorityFilter]);

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

  useEffect(() => {
    let alive = true;

    async function loadClients() {
      try {
        const res = await fetch("/api/admin/clients/list", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) return;

        const list = Array.isArray(json.clients) ? json.clients : [];
        if (!alive) return;
        setClients(
          list.map((client: any) => ({
            id: client.id,
            companyName: client.companyName || client.name || "",
          }))
        );
      } catch {
        if (!alive) return;
        setClients([]);
      }
    }

    if (createOpen && clients.length === 0) {
      loadClients();
    }

    return () => {
      alive = false;
    };
  }, [createOpen, clients.length]);

  const filtered = useMemo(() => {
    let list = [...projects];
    if (ownerFilter) {
      if (ownerFilter === "unassigned") {
        list = list.filter((p) => !p.ownerAmUid);
      } else {
        list = list.filter((p) => p.ownerAmUid === ownerFilter);
      }
    }
    return list;
  }, [projects, ownerFilter]);

  const withHealth = useMemo(() => {
    return filtered.map((project) => ({
      ...project,
      health: computeHealth(project.dueDate),
    }));
  }, [filtered]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;

    const getVal = (p: ProjectRecord) => {
      switch (sortKey) {
        case "projectName":
          return p.projectName || "";
        case "clientName":
          return p.clientName || "";
        case "projectType":
          return p.projectType || "";
        case "stage":
          return p.stage || "";
        case "priority":
          return p.priority || "";
        case "dueDate":
          return p.dueDate || "";
        case "health":
          return p.health || "";
        case "updatedAt":
          return p.updatedAt || "";
        default:
          return "";
      }
    };

    const arr = [...withHealth];
    arr.sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return arr;
  }, [withHealth, sortKey, sortDir]);

  const visibleTotals = useMemo(() => {
    return sorted.reduce(
      (acc, project) => {
        acc.total += 1;
        if (project.health === "Overdue") acc.overdue += 1;
        if (project.health === "At Risk") acc.atRisk += 1;
        if (project.health === "On Track") acc.onTrack += 1;
        return acc;
      },
      { total: 0, overdue: 0, atRisk: 0, onTrack: 0 }
    );
  }, [sorted]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "updatedAt" ? "desc" : "asc");
    }
  }

  const sortBadge = (key: SortKey) => (key !== sortKey ? "" : sortDir === "asc" ? "▲" : "▼");

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

  function openDrawer(project: ProjectRecord) {
    setSelected(project);
    setDrawerOpen(true);
    setEditForm({
      projectName: project.projectName || "",
      projectType: (project.projectType as ProjectType) || "Website",
      stage: (project.stage as ProjectStage) || "Inquiry",
      priority: (project.priority as ProjectPriority) || "Normal",
      ownerAmUid: project.ownerAmUid || "",
      productionUid: project.productionUid || "",
      startDate: toInputDate(project.startDate),
      dueDate: toInputDate(project.dueDate),
      internalNotes: project.internalNotes || "",
    });
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSelected(null);
  }

  function openCreate() {
    setCreateOpen(true);
  }

  function closeCreate() {
    setCreateOpen(false);
    setCreateForm({
      projectName: "",
      clientId: "",
      projectType: "Website",
      stage: "Kickoff",
      dueDate: "",
      ownerAmUid: "",
      priority: "Normal",
    });
  }

  async function refreshList() {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (stageFilter) params.set("stage", stageFilter);
    if (typeFilter) params.set("type", typeFilter);
    if (priorityFilter) params.set("priority", priorityFilter);

    const res = await fetch(`/api/admin/projects/list?${params.toString()}`, {
      method: "GET",
      cache: "no-store",
      credentials: "include",
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load projects");

    setProjects(Array.isArray(json?.projects) ? json.projects : []);
    setCurrentUser(json?.currentUser || null);
  }

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setCreateSaving(true);
      const res = await fetch("/api/admin/projects/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectName: createForm.projectName,
          clientId: createForm.clientId,
          projectType: createForm.projectType,
          stage: createForm.stage,
          dueDate: createForm.dueDate || null,
          ownerAmUid: createForm.ownerAmUid || null,
          priority: createForm.priority,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to create project");

      await refreshList();
      closeCreate();
    } catch (e: any) {
      alert(e?.message || "Failed to create project");
    } finally {
      setCreateSaving(false);
    }
  }

  async function handleUpdate() {
    if (!selected) return;

    try {
      setSaving(true);
      const res = await fetch("/api/admin/projects/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: selected.id,
          projectName: editForm.projectName,
          projectType: editForm.projectType,
          stage: editForm.stage,
          priority: editForm.priority,
          ownerAmUid: editForm.ownerAmUid || null,
          productionUid: editForm.productionUid || null,
          startDate: editForm.startDate || null,
          dueDate: editForm.dueDate || null,
          internalNotes: editForm.internalNotes,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to update project");

      await refreshList();
      closeDrawer();
    } catch (e: any) {
      alert(e?.message || "Failed to update project");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const confirmDelete = window.confirm("Delete this project? This will archive the record.");
    if (!confirmDelete) return;

    try {
      setDeletingId(id);
      const res = await fetch("/api/admin/projects/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to delete project");

      await refreshList();
      if (selected?.id === id) closeDrawer();
    } catch (e: any) {
      alert(e?.message || "Failed to delete project");
    } finally {
      setDeletingId((prev) => (prev === id ? null : prev));
    }
  }

  return (
    <div style={{ width: "100%" }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">All Projects</h1>
          <div className="page-subtitle">Monitor delivery pipeline, ownership, and priority in one live workspace.</div>
        </div>

        {canCreate(currentUser?.role) && (
          <button
            type="button"
            className="btn"
            onClick={openCreate}
            style={{ borderRadius: 999, padding: "10px 20px", fontWeight: 500 }}
          >
            + Create Project
          </button>
        )}
      </div>

      <div className="kpis" style={{ marginTop: 20 }}>
        {[
          { label: "Total Projects", value: visibleTotals.total },
          { label: "Overdue", value: visibleTotals.overdue },
          { label: "At Risk", value: visibleTotals.atRisk },
          { label: "On Track", value: visibleTotals.onTrack },
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
        <input
          className="input"
          placeholder="Search keyword"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <FilterSelect
          value={stageFilter}
          onChange={setStageFilter}
          placeholder="All Stages"
          isDark={isDark}
          options={[{ value: "", label: "All Stages" }, ...PIPELINE_STAGES.map((stage) => ({ value: stage, label: stage }))]}
        />
        <FilterSelect
          value={typeFilter}
          onChange={setTypeFilter}
          placeholder="All Types"
          isDark={isDark}
          options={[{ value: "", label: "All Types" }, ...PROJECT_TYPES.map((type) => ({ value: type, label: type }))]}
        />
        <FilterSelect
          value={priorityFilter}
          onChange={setPriorityFilter}
          placeholder="All Priorities"
          isDark={isDark}
          options={[
            { value: "", label: "All Priorities" },
            ...PRIORITIES.map((priority) => ({ value: priority, label: priority })),
          ]}
        />
        <FilterSelect
          value={ownerFilter}
          onChange={setOwnerFilter}
          placeholder="All Owners"
          isDark={isDark}
          options={[
            { value: "", label: "All Owners" },
            { value: "unassigned", label: "Unassigned" },
            ...ownerOptions.map((owner) => ({ value: owner.uid, label: owner.name || owner.uid })),
          ]}
        />
      </div>

      {!loading && sorted.length > 0 && (
        <div
          style={{
            marginTop: 14,
            fontSize: 12,
            color: isDark ? "rgba(226,232,240,0.68)" : "rgba(15,23,42,0.6)",
            textAlign: "right",
            paddingRight: 6,
          }}
        >
          {sorted.length} projects
        </div>
      )}

      <div className="table-shell" style={{ marginTop: 18 }}>
        {loading ? (
          <p style={{ padding: 16, fontSize: 14 }}>
            Loading projects...
          </p>
        ) : error ? (
          <div
            className="card"
            style={{
              margin: 16,
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
              onClick={() => {
                setLoading(true);
                refreshList()
                  .catch((retryError) => {
                    console.error("Retry failed:", retryError);
                    setError({
                      title: "Projects can’t load yet",
                      message: retryError?.message || "Unable to load projects right now.",
                    });
                  })
                  .finally(() => setLoading(false));
              }}
              style={{ borderRadius: 999, padding: "8px 16px", fontWeight: 500 }}
            >
              Retry
            </button>
          </div>
        ) : sorted.length === 0 ? (
          <div
            className="card"
            style={{
              margin: 16,
              padding: 16,
              borderRadius: 16,
              fontSize: 14,
            }}
          >
            No projects found.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 1120 }}>
              <thead>
                <tr>
                  <th style={headerCellStyle} onClick={() => toggleSort("projectName")}>
                    {headerLabel("Project", sortBadge("projectName"))}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("clientName")}>
                    {headerLabel("Client", sortBadge("clientName"))}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("projectType")}>
                    {headerLabel("Type", sortBadge("projectType"))}
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }} onClick={() => toggleSort("stage")}>
                    {headerLabel("Stage", sortBadge("stage"))}
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }} onClick={() => toggleSort("priority")}>
                    {headerLabel("Priority", sortBadge("priority"))}
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }} onClick={() => toggleSort("dueDate")}>
                    {headerLabel("Due Date", sortBadge("dueDate"))}
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }} onClick={() => toggleSort("health")}>
                    {headerLabel("Health", sortBadge("health"))}
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }} onClick={() => toggleSort("updatedAt")}>
                    {headerLabel("Updated", sortBadge("updatedAt"))}
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "center", cursor: "default" }}>{headerLabel("Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((project, idx) => {
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
                      style={{ background: rowBg, transition: "background 120ms ease", cursor: "pointer" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = hoverBg)}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = rowBg)}
                      onClick={() => openDrawer(project)}
                    >
                      <td style={{ ...cellStyle, whiteSpace: "normal" }}>{project.projectName || "-"}</td>
                      <td style={{ ...cellStyle, whiteSpace: "normal" }}>{project.clientName || "-"}</td>
                      <td style={cellStyle}>{project.projectType || "-"}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        <span style={getStatusStyles(project.stage || "", isDark)}>{project.stage || "-"}</span>
                      </td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        <span style={getStatusStyles(project.priority || "", isDark)}>{project.priority || "-"}</span>
                      </td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>{fmtDate(project.dueDate)}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        <span style={getStatusStyles(project.health || "", isDark)}>{project.health || "-"}</span>
                      </td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>{fmtDate(project.updatedAt)}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openDrawer(project);
                            }}
                            className="btn ghost"
                            style={{ padding: "8px 14px", borderRadius: 999, fontWeight: 400 }}
                          >
                            View / Edit
                          </button>
                          {isAdmin(currentUser?.role) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(project.id);
                              }}
                              className="btn ghost"
                              style={{
                                padding: "8px 14px",
                                borderRadius: 999,
                                fontWeight: 400,
                                border: "1px solid rgba(239,68,68,0.35)",
                                background: isDark ? "rgba(239,68,68,0.12)" : "rgba(239,68,68,0.08)",
                              }}
                              disabled={deletingId === project.id}
                            >
                              {deletingId === project.id ? "Deleting..." : "Delete"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {drawerOpen && selected && (
        <div className="drawer-overlay" onClick={closeDrawer}>
          <div className="drawer-panel drawer-panel--md" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, color: isDark ? "#fff" : "#0f172a" }}>
                  {selected.projectName}
                </div>
                <div style={{ opacity: 0.75, fontSize: 12, color: isDark ? "rgba(255,255,255,0.75)" : "#334155" }}>
                  {selected.clientName} · {selected.projectType}
                </div>
              </div>

              <button
                className="btn ghost"
                onClick={closeDrawer}
                style={{ height: 34, borderRadius: 999, fontWeight: 400 }}
              >
                Close
              </button>
            </div>

            <div style={{ height: 16 }} />

            <Section title="Project Details" isDark={isDark}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Project Name</span>
                <input
                  className="input"
                  value={editForm.projectName}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, projectName: e.target.value }))}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Project Type</span>
                <select
                  className="input"
                  value={editForm.projectType}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, projectType: e.target.value as ProjectType }))
                  }
                >
                  {PROJECT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Stage</span>
                <select
                  className="input"
                  value={editForm.stage}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, stage: e.target.value as ProjectStage }))}
                >
                  {PIPELINE_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Priority</span>
                <select
                  className="input"
                  value={editForm.priority}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, priority: e.target.value as ProjectPriority }))
                  }
                >
                  {PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </label>
            </Section>

            <div style={{ height: 12 }} />

            <Section title="Ownership & Dates" isDark={isDark}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Owner (AM)</span>
                <select
                  className="input"
                  value={editForm.ownerAmUid}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, ownerAmUid: e.target.value }))}
                >
                  <option value="">Unassigned</option>
                  {ownerOptions.map((owner) => (
                    <option key={owner.uid} value={owner.uid}>
                      {owner.name || owner.uid}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Production Owner</span>
                <select
                  className="input"
                  value={editForm.productionUid}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, productionUid: e.target.value }))}
                >
                  <option value="">Unassigned</option>
                  {productionOptions.map((owner) => (
                    <option key={owner.uid} value={owner.uid}>
                      {owner.name || owner.uid}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Start Date</span>
                <input
                  className="input"
                  type="date"
                  value={editForm.startDate}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, startDate: e.target.value }))}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Due Date</span>
                <input
                  className="input"
                  type="date"
                  value={editForm.dueDate}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                />
              </label>
            </Section>

            <div style={{ height: 12 }} />

            <Section title="Internal Notes" isDark={isDark}>
              <textarea
                className="input"
                style={{ minHeight: 120, resize: "vertical" }}
                placeholder="Internal notes for the delivery team"
                value={editForm.internalNotes}
                onChange={(e) => setEditForm((prev) => ({ ...prev, internalNotes: e.target.value }))}
              />
            </Section>

            <div style={{ height: 12 }} />

            <Section title="System" isDark={isDark}>
              <InfoRow label="Project ID" value={selected.id} isDark={isDark} />
              <InfoRow label="Created By" value={selected.createdByName || "-"} isDark={isDark} />
              <InfoRow label="Updated" value={fmtDate(selected.updatedAt)} isDark={isDark} />
              <InfoRow label="Last Activity" value={fmtDate(selected.lastActivityAt)} isDark={isDark} />
            </Section>

            <div style={{ height: 16 }} />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
              {isAdmin(currentUser?.role) && (
                <button
                  type="button"
                  className="btn ghost"
                  disabled={deletingId === selected.id}
                  onClick={() => handleDelete(selected.id)}
                  style={{
                    borderRadius: 12,
                    fontWeight: 400,
                    background: isDark ? "rgba(239,68,68,0.12)" : "rgba(239,68,68,0.10)",
                    border: "1px solid rgba(239,68,68,0.35)",
                    color: isDark ? "rgba(255,255,255,0.92)" : "rgba(15,23,42,0.86)",
                    opacity: deletingId === selected.id ? 0.7 : 1,
                  }}
                >
                  {deletingId === selected.id ? "Deleting..." : "Delete Project"}
                </button>
              )}
              <button
                type="button"
                className="btn"
                disabled={saving}
                onClick={handleUpdate}
                style={{ borderRadius: 12, fontWeight: 400 }}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {createOpen && (
        <div className="drawer-overlay" onClick={closeCreate}>
          <div className="drawer-panel drawer-panel--md" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, color: isDark ? "#fff" : "#0f172a" }}>
                  Create Project
                </div>
                <div style={{ opacity: 0.75, fontSize: 12, color: isDark ? "rgba(255,255,255,0.75)" : "#334155" }}>
                  Add a new delivery project in seconds.
                </div>
              </div>

              <button
                className="btn ghost"
                onClick={closeCreate}
                style={{ height: 34, borderRadius: 999, fontWeight: 400 }}
              >
                Close
              </button>
            </div>

            <div style={{ height: 16 }} />

            <form onSubmit={handleCreateSubmit} style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Project Name</span>
                <input
                  className="input"
                  value={createForm.projectName}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, projectName: e.target.value }))}
                  required
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Client</span>
                <select
                  className="input"
                  value={createForm.clientId}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, clientId: e.target.value }))}
                  required
                >
                  <option value="">Select client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.companyName || client.id}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Project Type</span>
                <select
                  className="input"
                  value={createForm.projectType}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, projectType: e.target.value as ProjectType }))
                  }
                >
                  {PROJECT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Stage</span>
                <select
                  className="input"
                  value={createForm.stage}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, stage: e.target.value as ProjectStage }))}
                >
                  {CREATE_PIPELINE_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Priority</span>
                <select
                  className="input"
                  value={createForm.priority}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, priority: e.target.value as ProjectPriority }))
                  }
                >
                  {PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Due Date</span>
                <input
                  className="input"
                  type="date"
                  value={createForm.dueDate}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                />
              </label>

              {ownerOptions.length > 0 && (
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>Owner (AM)</span>
                  <select
                    className="input"
                    value={createForm.ownerAmUid}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, ownerAmUid: e.target.value }))}
                  >
                    <option value="">Unassigned</option>
                    {ownerOptions.map((owner) => (
                      <option key={owner.uid} value={owner.uid}>
                        {owner.name || owner.uid}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className="btn ghost" onClick={closeCreate} style={{ borderRadius: 12 }}>
                  Cancel
                </button>
                <button type="submit" className="btn" disabled={createSaving} style={{ borderRadius: 12 }}>
                  {createSaving ? "Creating..." : "Create Project"}
                </button>
              </div>
            </form>
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
        <span style={{ color: isPlaceholder ? (isDark ? "rgba(226,232,240,0.55)" : "rgba(100,116,139,0.9)") : "inherit" }}>
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
