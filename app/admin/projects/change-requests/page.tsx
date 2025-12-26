"use client";

import MasterSelect from "@/components/ui/MasterSelect";
import { useEffect, useMemo, useState } from "react";

type ChangeRequestType = "Scope Change" | "Revision" | "New Feature" | "Bug Fix" | "Other";

type ChangeRequestStatus =
  | "Submitted"
  | "In Review"
  | "Approved"
  | "In Progress"
  | "Completed"
  | "Rejected";

type ChangeRequestPriority = "Low" | "Medium" | "High";

type ChangeRequestHistory = {
  from: string;
  to: string;
  byUid: string;
  byRole: string;
  at: string;
  note?: string;
};

type ChangeRequestRecord = {
  id: string;
  projectId: string;
  projectName: string;
  clientId: string;
  clientName: string;
  type: ChangeRequestType | string;
  title: string;
  description: string;
  status: ChangeRequestStatus | string;
  priority: ChangeRequestPriority | string;
  requestedByUid: string;
  requestedByRole: string;
  assignedToUid?: string | null;
  assignedToRole?: string | null;
  estimatedCost?: number | null;
  estimatedTimelineDays?: number | null;
  approvedAt?: string | null;
  approvedByUid?: string | null;
  attachedFileIds: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
  completedAt?: string | null;
  statusHistory: ChangeRequestHistory[];
};

type CurrentUser = {
  uid: string;
  role: string;
  name?: string;
};

type ProjectOption = {
  id: string;
  projectName: string;
  clientName: string;
};

type FileOption = {
  id: string;
  fileName: string;
  downloadUrl: string;
  projectId: string;
  projectName: string;
};

type UserOption = {
  uid: string;
  email?: string;
  role?: string;
};

type SortKey =
  | "title"
  | "projectName"
  | "type"
  | "status"
  | "priority"
  | "estimatedCost"
  | "estimatedTimelineDays"
  | "updatedAt";

type SortDir = "asc" | "desc";

const CHANGE_REQUEST_TYPES: ChangeRequestType[] = ["Scope Change", "Revision", "New Feature", "Bug Fix", "Other"];
const CHANGE_REQUEST_STATUSES: ChangeRequestStatus[] = [
  "Submitted",
  "In Review",
  "Approved",
  "In Progress",
  "Completed",
  "Rejected",
];
const CHANGE_REQUEST_PRIORITIES: ChangeRequestPriority[] = ["Low", "Medium", "High"];

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
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtMoney(n?: number | null) {
  if (n === null || n === undefined) return "-";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
  } catch {
    return `$ ${Number(n || 0).toLocaleString()}`;
  }
}

function statusStyles(status: string, isDark: boolean) {
  const base = {
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 90,
  } as const;

  const token = status.toLowerCase();
  if (token.includes("rejected")) {
    return {
      ...base,
      color: isDark ? "#fecaca" : "#b91c1c",
      background: isDark ? "rgba(239,68,68,0.18)" : "rgba(239,68,68,0.12)",
      border: "1px solid rgba(239,68,68,0.35)",
    };
  }

  if (token.includes("approved") || token.includes("completed")) {
    return {
      ...base,
      color: isDark ? "#bbf7d0" : "#047857",
      background: isDark ? "rgba(34,197,94,0.18)" : "rgba(34,197,94,0.12)",
      border: "1px solid rgba(34,197,94,0.30)",
    };
  }

  if (token.includes("progress") || token.includes("review")) {
    return {
      ...base,
      color: isDark ? "#fde68a" : "#b45309",
      background: isDark ? "rgba(245,158,11,0.18)" : "rgba(245,158,11,0.12)",
      border: "1px solid rgba(245,158,11,0.35)",
    };
  }

  return {
    ...base,
    color: isDark ? "#bfdbfe" : "#1d4ed8",
    background: isDark ? "rgba(59,130,246,0.18)" : "rgba(59,130,246,0.10)",
    border: "1px solid rgba(59,130,246,0.28)",
  };
}

function priorityStyles(priority: string, isDark: boolean) {
  const base = {
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 70,
  } as const;

  const token = priority.toLowerCase();
  if (token === "high") {
    return {
      ...base,
      color: isDark ? "#fecaca" : "#b91c1c",
      background: isDark ? "rgba(239,68,68,0.18)" : "rgba(239,68,68,0.12)",
      border: "1px solid rgba(239,68,68,0.35)",
    };
  }

  if (token === "medium") {
    return {
      ...base,
      color: isDark ? "#fde68a" : "#b45309",
      background: isDark ? "rgba(245,158,11,0.18)" : "rgba(245,158,11,0.12)",
      border: "1px solid rgba(245,158,11,0.35)",
    };
  }

  return {
    ...base,
    color: isDark ? "#bbf7d0" : "#047857",
    background: isDark ? "rgba(34,197,94,0.18)" : "rgba(34,197,94,0.12)",
    border: "1px solid rgba(34,197,94,0.30)",
  };
}

function canCreate(role?: string) {
  const r = (role || "").toLowerCase();
  return r === "admin" || r === "super_admin" || r === "sales_manager" || r === "account_manager";
}

function canApproveOrReject(role?: string) {
  const r = (role || "").toLowerCase();
  return r === "admin" || r === "super_admin" || r === "sales_manager";
}

function canMoveExecution(role?: string) {
  const r = (role || "").toLowerCase();
  return r === "admin" || r === "super_admin" || r === "account_manager" || r === "production";
}

function canMoveToReview(role?: string) {
  const r = (role || "").toLowerCase();
  return r === "admin" || r === "super_admin" || r === "sales_manager" || r === "account_manager";
}

function canEditCommercial(role?: string) {
  const r = (role || "").toLowerCase();
  return r === "admin" || r === "super_admin" || r === "sales_manager";
}

export default function ChangeRequestsPage() {
  const isDark = useIsSystemDark();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);

  const [rows, setRows] = useState<ChangeRequestRecord[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");

  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ChangeRequestRecord | null>(null);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [drawerNote, setDrawerNote] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createProjectId, setCreateProjectId] = useState("");
  const [createType, setCreateType] = useState<ChangeRequestType>("Scope Change");
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createPriority, setCreatePriority] = useState<ChangeRequestPriority>("Medium");
  const [createFileIds, setCreateFileIds] = useState<string[]>([]);
  const [availableFiles, setAvailableFiles] = useState<FileOption[]>([]);

  const [commercialCost, setCommercialCost] = useState("");
  const [commercialTimeline, setCommercialTimeline] = useState("");

  const [attachedFiles, setAttachedFiles] = useState<FileOption[]>([]);

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

  useEffect(() => {
    let alive = true;

    async function loadChangeRequests() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/admin/change-requests/list", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || res.statusText || "Unable to load change requests");
        }

        if (!alive) return;
        setRows(Array.isArray(json?.changeRequests) ? json.changeRequests : []);
        setCurrentUser(json?.currentUser || null);
      } catch (e: any) {
        console.error("change requests list error:", e);
        if (!alive) return;
        const message = String(e?.message || "");
        const isForbidden = message.toLowerCase().includes("forbidden");
        const isUnauthorized = message.toLowerCase().includes("unauthorized");
        setError({
          title: isForbidden || isUnauthorized ? "Access restricted" : "Change requests can’t load yet",
          message: isForbidden || isUnauthorized ? "You don’t have access to view change requests." : "Please try again in a moment.",
        });
        setRows([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    async function loadProjects() {
      try {
        const res = await fetch("/api/admin/projects/list", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) return;
        const list = Array.isArray(json?.projects) ? json.projects : [];
        if (!alive) return;
        setProjects(
          list.map((project: any) => ({
            id: project.id,
            projectName: project.projectName || "",
            clientName: project.clientName || "",
          }))
        );
      } catch (err) {
        console.error("projects list error:", err);
      }
    }

    async function loadUsers() {
      try {
        const res = await fetch("/api/admin/list-users", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !Array.isArray(json?.users)) return;
        if (!alive) return;
        setUsers(json.users);
      } catch (err) {
        console.error("users list error:", err);
      }
    }

    loadChangeRequests();
    loadProjects();
    loadUsers();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!createOpen || !createProjectId) {
      setAvailableFiles([]);
      return;
    }

    let alive = true;

    async function loadFiles() {
      try {
        const res = await fetch(`/api/admin/files/list?projectId=${createProjectId}`,
          {
            method: "GET",
            cache: "no-store",
            credentials: "include",
          }
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) return;
        const list = Array.isArray(json?.files) ? json.files : [];
        if (!alive) return;
        setAvailableFiles(
          list.map((file: any) => ({
            id: file.id,
            fileName: file.fileName || "",
            downloadUrl: file.downloadUrl || "",
            projectId: file.projectId || "",
            projectName: file.projectName || "",
          }))
        );
      } catch (err) {
        console.error("files list error:", err);
      }
    }

    loadFiles();

    return () => {
      alive = false;
    };
  }, [createOpen, createProjectId]);

  useEffect(() => {
    if (!drawerOpen || !selected?.projectId) {
      setAttachedFiles([]);
      return;
    }

    let alive = true;

    async function loadFiles() {
      try {
        const res = await fetch(`/api/admin/files/list?projectId=${selected.projectId}`,
          {
            method: "GET",
            cache: "no-store",
            credentials: "include",
          }
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) return;
        const list = Array.isArray(json?.files) ? json.files : [];
        if (!alive) return;
        const ids = new Set(selected.attachedFileIds || []);
        setAttachedFiles(
          list
            .filter((file: any) => ids.has(file.id))
            .map((file: any) => ({
              id: file.id,
              fileName: file.fileName || "",
              downloadUrl: file.downloadUrl || "",
              projectId: file.projectId || "",
              projectName: file.projectName || "",
            }))
        );
      } catch (err) {
        console.error("files list error:", err);
      }
    }

    loadFiles();

    return () => {
      alive = false;
    };
  }, [drawerOpen, selected]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();

    let list = [...rows];

    if (projectFilter) {
      list = list.filter((row) => row.projectId === projectFilter);
    }

    if (statusFilter) {
      list = list.filter((row) => row.status === statusFilter);
    }

    if (typeFilter) {
      list = list.filter((row) => row.type === typeFilter);
    }

    if (priorityFilter) {
      list = list.filter((row) => row.priority === priorityFilter);
    }

    if (assignedFilter) {
      list = list.filter((row) => row.assignedToUid === assignedFilter);
    }

    if (q) {
      list = list.filter((row) => {
        const hay = [row.title, row.description, row.projectName, row.clientName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    list.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const aValue = a[sortKey];
      const bValue = b[sortKey];

      if (typeof aValue === "number" || typeof bValue === "number") {
        return (Number(aValue || 0) - Number(bValue || 0)) * dir;
      }

      return String(aValue || "").localeCompare(String(bValue || "")) * dir;
    });

    return list;
  }, [rows, query, projectFilter, statusFilter, typeFilter, priorityFilter, assignedFilter, sortDir, sortKey]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.status === "Submitted" || row.status === "In Review") acc.pending += 1;
        if (row.status === "In Progress") acc.inProgress += 1;
        if (row.status === "Completed") acc.completed += 1;
        return acc;
      },
      { total: 0, pending: 0, inProgress: 0, completed: 0 }
    );
  }, [filteredRows]);

  function toggleSort(next: SortKey) {
    if (sortKey === next) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(next);
      setSortDir("asc");
    }
  }

  function openDrawer(row: ChangeRequestRecord) {
    setSelected(row);
    setDrawerNote("");
    setDrawerError(null);
    setCommercialCost(row.estimatedCost !== null && row.estimatedCost !== undefined ? String(row.estimatedCost) : "");
    setCommercialTimeline(
      row.estimatedTimelineDays !== null && row.estimatedTimelineDays !== undefined
        ? String(row.estimatedTimelineDays)
        : ""
    );
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSelected(null);
    setDrawerError(null);
    setDrawerNote("");
    setAttachedFiles([]);
  }

  function openCreate() {
    setCreateError(null);
    setCreateProjectId("");
    setCreateType("Scope Change");
    setCreateTitle("");
    setCreateDescription("");
    setCreatePriority("Medium");
    setCreateFileIds([]);
    setCreateOpen(true);
  }

  function closeCreate() {
    setCreateOpen(false);
    setCreateError(null);
    setAvailableFiles([]);
  }

  async function refreshList() {
    try {
      const res = await fetch("/api/admin/change-requests/list", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || res.statusText || "Unable to load change requests");
      }
      const list = Array.isArray(json?.changeRequests) ? json.changeRequests : [];
      setRows(list);
      setCurrentUser(json?.currentUser || null);
      return list as ChangeRequestRecord[];
    } catch (err) {
      console.error("refresh list error:", err);
      return null;
    }
  }

  async function handleCreate() {
    setCreateError(null);

    if (!createProjectId || !createTitle.trim() || !createDescription.trim()) {
      setCreateError("Please complete the required fields.");
      return;
    }

    try {
      const res = await fetch("/api/admin/change-requests/create", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: createProjectId,
          type: createType,
          title: createTitle,
          description: createDescription,
          priority: createPriority,
          attachedFileIds: createFileIds,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || res.statusText || "Unable to create change request");
      }

      closeCreate();
      await refreshList();
    } catch (err: any) {
      setCreateError(err?.message || "Unable to create change request.");
    }
  }

  async function handleStatusUpdate(toStatus: ChangeRequestStatus) {
    if (!selected) return;
    setDrawerError(null);

    try {
      const res = await fetch("/api/admin/change-requests/update-status", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          changeRequestId: selected.id,
          toStatus,
          note: drawerNote,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || res.statusText || "Unable to update status");
      }
      const updatedList = await refreshList();
      const updated = updatedList?.find((row) => row.id === selected.id) || null;
      setSelected(updated);
      setDrawerNote("");
    } catch (err: any) {
      setDrawerError(err?.message || "Unable to update status.");
    }
  }

  async function handleCommercialUpdate() {
    if (!selected) return;
    setDrawerError(null);

    try {
      const res = await fetch("/api/admin/change-requests/update-commercial", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          changeRequestId: selected.id,
          estimatedCost: commercialCost === "" ? null : Number(commercialCost),
          estimatedTimelineDays: commercialTimeline === "" ? null : Number(commercialTimeline),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || res.statusText || "Unable to update commercial details");
      }
      await refreshList();
    } catch (err: any) {
      setDrawerError(err?.message || "Unable to update commercial details.");
    }
  }

  const createAllowed = canCreate(currentUser?.role);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h1
            style={{
              fontSize: 34,
              fontWeight: 900,
              marginBottom: 8,
              color: isDark ? "rgba(255,255,255,0.95)" : "rgba(15,23,42,0.95)",
            }}
          >
            Change Requests
          </h1>
          <p style={{ fontSize: 14, color: isDark ? "rgba(255,255,255,0.75)" : "rgba(15,23,42,0.65)" }}>
            Track scope changes, revisions, and new work across projects.
          </p>
        </div>
        {createAllowed && (
          <button className="btn" onClick={openCreate} style={{ borderRadius: 999, padding: "10px 20px", fontWeight: 500 }}>
            + Create Change Request
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 20 }}>
        <KpiCard label="Total Requests" value={totals.total} isDark={isDark} />
        <KpiCard label="Pending Approval" value={totals.pending} isDark={isDark} />
        <KpiCard label="In Progress" value={totals.inProgress} isDark={isDark} />
        <KpiCard label="Completed" value={totals.completed} isDark={isDark} />
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
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(220px, 1.3fr) repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            alignItems: "center",
          }}
        >
          <input
            className="input"
            placeholder="Search keyword"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <MasterSelect
            className="input"
            value={projectFilter}
            onChange={setProjectFilter}
            isDark={isDark}
            placeholder="All Projects"
            options={[
              { label: "All Projects", value: "" },
              ...projects.map((project) => ({
                label: `${project.projectName || "Untitled"} · ${project.clientName || "Client"}`,
                value: project.id,
              })),
            ]}
          />
          <MasterSelect
            className="input"
            value={statusFilter}
            onChange={setStatusFilter}
            isDark={isDark}
            placeholder="All Statuses"
            options={[
              { label: "All Statuses", value: "" },
              ...CHANGE_REQUEST_STATUSES.map((status) => ({ label: status, value: status })),
            ]}
          />
          <MasterSelect
            className="input"
            value={typeFilter}
            onChange={setTypeFilter}
            isDark={isDark}
            placeholder="All Types"
            options={[
              { label: "All Types", value: "" },
              ...CHANGE_REQUEST_TYPES.map((type) => ({ label: type, value: type })),
            ]}
          />
          <MasterSelect
            className="input"
            value={priorityFilter}
            onChange={setPriorityFilter}
            isDark={isDark}
            placeholder="All Priorities"
            options={[
              { label: "All Priorities", value: "" },
              ...CHANGE_REQUEST_PRIORITIES.map((priority) => ({ label: priority, value: priority })),
            ]}
          />
          <MasterSelect
            className="input"
            value={assignedFilter}
            onChange={setAssignedFilter}
            isDark={isDark}
            placeholder="Assigned To"
            options={[
              { label: "Assigned To", value: "" },
              ...users.map((user) => ({
                label: `${user.email || user.uid}${user.role ? ` (${user.role})` : ""}`,
                value: user.uid,
              })),
            ]}
          />
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        {loading ? (
          <div style={{ padding: 30, color: isDark ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.70)" }}>
            Loading change requests...
          </div>
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
          </div>
        ) : (
          <div style={tableShellStyle}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 1100 }}>
                <thead>
                  <tr>
                    <th style={{ ...headerCellStyle, textAlign: "left" }} onClick={() => toggleSort("title")}>
                      {headerLabel("Title", sortKey === "title" ? (sortDir === "asc" ? "↑" : "↓") : undefined)}
                    </th>
                    <th style={{ ...headerCellStyle, textAlign: "left" }} onClick={() => toggleSort("projectName")}>
                      {headerLabel("Project", sortKey === "projectName" ? (sortDir === "asc" ? "↑" : "↓") : undefined)}
                    </th>
                    <th style={{ ...headerCellStyle, textAlign: "center" }} onClick={() => toggleSort("type")}>
                      {headerLabel("Type", sortKey === "type" ? (sortDir === "asc" ? "↑" : "↓") : undefined)}
                    </th>
                    <th style={{ ...headerCellStyle, textAlign: "center" }} onClick={() => toggleSort("status")}>
                      {headerLabel("Status", sortKey === "status" ? (sortDir === "asc" ? "↑" : "↓") : undefined)}
                    </th>
                    <th style={{ ...headerCellStyle, textAlign: "center" }} onClick={() => toggleSort("priority")}>
                      {headerLabel("Priority", sortKey === "priority" ? (sortDir === "asc" ? "↑" : "↓") : undefined)}
                    </th>
                    <th
                      style={{ ...headerCellStyle, textAlign: "center" }}
                      onClick={() => toggleSort("estimatedCost")}
                    >
                      {headerLabel("Cost", sortKey === "estimatedCost" ? (sortDir === "asc" ? "↑" : "↓") : undefined)}
                    </th>
                    <th
                      style={{ ...headerCellStyle, textAlign: "center" }}
                      onClick={() => toggleSort("estimatedTimelineDays")}
                    >
                      {headerLabel(
                        "Timeline",
                        sortKey === "estimatedTimelineDays" ? (sortDir === "asc" ? "↑" : "↓") : undefined
                      )}
                    </th>
                    <th style={{ ...headerCellStyle, textAlign: "center" }} onClick={() => toggleSort("updatedAt")}>
                      {headerLabel("Updated At", sortKey === "updatedAt" ? (sortDir === "asc" ? "↑" : "↓") : undefined)}
                    </th>
                    <th style={{ ...headerCellStyle, textAlign: "center" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, idx) => {
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
                        key={row.id}
                        onClick={() => openDrawer(row)}
                        style={{ background: rowBg, transition: "background 120ms ease", cursor: "pointer" }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = hoverBg)}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = rowBg)}
                      >
                      <td style={{ ...cellStyle, textAlign: "left", whiteSpace: "normal" }}>{row.title}</td>
                      <td style={{ ...cellStyle, textAlign: "left" }}>{row.projectName || "-"}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>{row.type}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        <span style={statusStyles(row.status, isDark)}>{row.status}</span>
                      </td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        <span style={priorityStyles(row.priority, isDark)}>{row.priority}</span>
                      </td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>{fmtMoney(row.estimatedCost)}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        {row.estimatedTimelineDays ? `${row.estimatedTimelineDays} days` : "-"}
                      </td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>{fmtDate(row.updatedAt)}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDrawer(row);
                          }}
                          className="btn ghost"
                          style={{ padding: "8px 14px", borderRadius: 999, fontWeight: 400 }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredRows.length === 0 && (
              <div
                className="card"
                style={{
                  padding: 16,
                  borderRadius: 16,
                  border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
                  background: isDark ? "rgba(24,24,24,0.9)" : "rgba(255,255,255,0.85)",
                  color: isDark ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.7)",
                  fontSize: 14,
                  marginTop: 12,
                  textAlign: "center",
                }}
              >
                No change requests yet.
              </div>
            )}
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
              width: "min(520px, 92vw)",
              height: "100%",
              padding: 18,
              background: isDark ? "rgba(18,18,18,0.96)" : "rgba(255,255,255,0.96)",
              borderLeft: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, color: isDark ? "#fff" : "#0f172a" }}>
                  {selected.title}
                </div>
                <div style={{ opacity: 0.75, fontSize: 12, color: isDark ? "rgba(255,255,255,0.75)" : "#334155" }}>
                  {selected.projectName} · {selected.clientName}
                </div>
              </div>
              <button className="btn ghost" onClick={closeDrawer} style={{ height: 34, borderRadius: 999 }}>
                Close
              </button>
            </div>

            {drawerError && (
              <div style={{ marginTop: 10, color: "tomato", fontWeight: 600, fontSize: 13 }}>{drawerError}</div>
            )}

            <div style={{ height: 14 }} />

            <Section title="Overview" isDark={isDark}>
              <Row label="Type" value={selected.type || "-"} isDark={isDark} />
              <Row label="Status" value={selected.status || "-"} isDark={isDark} />
              <Row label="Priority" value={selected.priority || "-"} isDark={isDark} />
              <Row label="Requested By" value={selected.requestedByRole || "-"} isDark={isDark} />
            </Section>

            <div style={{ height: 12 }} />

            <Section title="Description" isDark={isDark}>
              <div style={{ fontSize: 13, lineHeight: 1.5, color: isDark ? "rgba(226,232,240,0.9)" : "#0f172a" }}>
                {selected.description || "-"}
              </div>
            </Section>

            <div style={{ height: 12 }} />

            <Section title="Commercial" isDark={isDark}>
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 700 }}>Estimated Cost (USD)</label>
                  <input
                    className="input"
                    type="number"
                    value={commercialCost}
                    onChange={(e) => setCommercialCost(e.target.value)}
                    disabled={!canEditCommercial(currentUser?.role)}
                    style={{ height: 38, borderRadius: 10 }}
                  />
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 700 }}>Estimated Timeline (days)</label>
                  <input
                    className="input"
                    type="number"
                    value={commercialTimeline}
                    onChange={(e) => setCommercialTimeline(e.target.value)}
                    disabled={!canEditCommercial(currentUser?.role)}
                    style={{ height: 38, borderRadius: 10 }}
                  />
                </div>
                {canEditCommercial(currentUser?.role) && (
                  <button
                    className="btn"
                    onClick={handleCommercialUpdate}
                    style={{ borderRadius: 10, fontWeight: 700 }}
                  >
                    Save Commercial Details
                  </button>
                )}
              </div>
            </Section>

            <div style={{ height: 12 }} />

            <Section title="Attached Files" isDark={isDark}>
              {attachedFiles.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--sidebar-text)" }}>No files attached.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {attachedFiles.map((file) => (
                    <a
                      key={file.id}
                      href={file.downloadUrl || "#"}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(15,23,42,0.12)",
                        textDecoration: "none",
                        color: isDark ? "#e2e8f0" : "#0f172a",
                        fontSize: 13,
                      }}
                    >
                      {file.fileName || "File"}
                    </a>
                  ))}
                </div>
              )}
            </Section>

            <div style={{ height: 12 }} />

            <Section title="Status History" isDark={isDark}>
              {selected.statusHistory.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--sidebar-text)" }}>No updates yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {selected.statusHistory.map((entry, idx) => (
                    <div
                      key={`${entry.at}-${idx}`}
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        border: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: 13 }}>
                        {entry.from ? `${entry.from} → ${entry.to}` : entry.to}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                        {entry.byRole || ""} · {fmtDateTime(entry.at)}
                      </div>
                      {entry.note && (
                        <div style={{ fontSize: 12, marginTop: 6, color: isDark ? "#e2e8f0" : "#0f172a" }}>
                          Note: {entry.note}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <div style={{ height: 12 }} />

            <Section title="Actions" isDark={isDark}>
              <div style={{ display: "grid", gap: 10 }}>
                <textarea
                  className="input"
                  placeholder="Optional status note"
                  value={drawerNote}
                  onChange={(e) => setDrawerNote(e.target.value)}
                  style={{ minHeight: 70, borderRadius: 12 }}
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {selected.status === "Submitted" && canMoveToReview(currentUser?.role) && (
                    <button
                      className="btn"
                      onClick={() => handleStatusUpdate("In Review")}
                      style={{ borderRadius: 999, fontWeight: 700 }}
                    >
                      Start Review
                    </button>
                  )}
                  {selected.status === "In Review" && canApproveOrReject(currentUser?.role) && (
                    <>
                      <button
                        className="btn"
                        onClick={() => handleStatusUpdate("Approved")}
                        style={{ borderRadius: 999, fontWeight: 700 }}
                      >
                        Approve
                      </button>
                      <button
                        className="btn ghost"
                        onClick={() => handleStatusUpdate("Rejected")}
                        style={{ borderRadius: 999, fontWeight: 700 }}
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {selected.status === "Approved" && canMoveExecution(currentUser?.role) && (
                    <button
                      className="btn"
                      onClick={() => handleStatusUpdate("In Progress")}
                      style={{ borderRadius: 999, fontWeight: 700 }}
                    >
                      Move to In Progress
                    </button>
                  )}
                  {selected.status === "In Progress" && canMoveExecution(currentUser?.role) && (
                    <button
                      className="btn"
                      onClick={() => handleStatusUpdate("Completed")}
                      style={{ borderRadius: 999, fontWeight: 700 }}
                    >
                      Mark Completed
                    </button>
                  )}
                  {(selected.status === "Rejected" || selected.status === "Completed") && (
                    <span style={{ fontSize: 13, color: "var(--sidebar-text)" }}>
                      No further actions available.
                    </span>
                  )}
                </div>
              </div>
            </Section>
          </div>
        </div>
      )}

      {createOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: isDark ? "rgba(0,0,0,0.55)" : "rgba(15,23,42,0.35)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
          onClick={closeCreate}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: "min(520px, 92vw)",
              height: "100%",
              padding: 18,
              background: isDark ? "rgba(18,18,18,0.96)" : "rgba(255,255,255,0.96)",
              borderLeft: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, color: isDark ? "#fff" : "#0f172a" }}>
                  Create Change Request
                </div>
                <div style={{ opacity: 0.75, fontSize: 12, color: isDark ? "rgba(255,255,255,0.75)" : "#334155" }}>
                  Submit a new scope update for review.
                </div>
              </div>
              <button className="btn ghost" onClick={closeCreate} style={{ height: 34, borderRadius: 999 }}>
                Close
              </button>
            </div>

            {createError && (
              <div style={{ marginTop: 10, color: "tomato", fontWeight: 600, fontSize: 13 }}>{createError}</div>
            )}

            <div style={{ height: 14 }} />

            <Section title="Details" isDark={isDark}>
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 700 }}>Project</label>
                  <MasterSelect
                    className="input"
                    value={createProjectId}
                    onChange={setCreateProjectId}
                    isDark={isDark}
                    placeholder="Select project"
                    buttonStyle={{ height: 38, borderRadius: 10 }}
                    options={[
                      { label: "Select project", value: "" },
                      ...projects.map((project) => ({
                        label: `${project.projectName || "Untitled"} · ${project.clientName || "Client"}`,
                        value: project.id,
                      })),
                    ]}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 700 }}>Type</label>
                  <MasterSelect
                    className="input"
                    value={createType}
                    onChange={(next) => setCreateType(next as ChangeRequestType)}
                    isDark={isDark}
                    buttonStyle={{ height: 38, borderRadius: 10 }}
                    options={CHANGE_REQUEST_TYPES.map((type) => ({ label: type, value: type }))}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 700 }}>Title</label>
                  <input
                    className="input"
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    style={{ height: 38, borderRadius: 10 }}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 700 }}>Description</label>
                  <textarea
                    className="input"
                    value={createDescription}
                    onChange={(e) => setCreateDescription(e.target.value)}
                    style={{ minHeight: 110, borderRadius: 10 }}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 700 }}>Priority</label>
                  <MasterSelect
                    className="input"
                    value={createPriority}
                    onChange={(next) => setCreatePriority(next as ChangeRequestPriority)}
                    isDark={isDark}
                    buttonStyle={{ height: 38, borderRadius: 10 }}
                    options={CHANGE_REQUEST_PRIORITIES.map((priority) => ({ label: priority, value: priority }))}
                  />
                </div>
              </div>
            </Section>

            <div style={{ height: 12 }} />

            <Section title="Attach Files" isDark={isDark}>
              {createProjectId ? (
                availableFiles.length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--sidebar-text)" }}>No files for this project yet.</div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {availableFiles.map((file) => (
                      <label
                        key={file.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(15,23,42,0.12)",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={createFileIds.includes(file.id)}
                          onChange={(e) => {
                            setCreateFileIds((prev) =>
                              e.target.checked ? [...prev, file.id] : prev.filter((id) => id !== file.id)
                            );
                          }}
                        />
                        <span style={{ fontSize: 13 }}>{file.fileName || "File"}</span>
                      </label>
                    ))}
                  </div>
                )
              ) : (
                <div style={{ fontSize: 13, color: "var(--sidebar-text)" }}>Select a project to attach files.</div>
              )}
            </Section>

            <div style={{ height: 16 }} />

            <button className="btn" onClick={handleCreate} style={{ borderRadius: 12, fontWeight: 700, width: "100%" }}>
              Submit Change Request
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, isDark }: { label: string; value: number; isDark: boolean }) {
  return (
    <div
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
      <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.65 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{value}</div>
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
        background: isDark ? "rgba(255,255,255,0.02)" : "rgba(15,23,42,0.02)",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.06em", opacity: 0.75 }}>{title}</div>
      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>{children}</div>
    </div>
  );
}

function Row({ label, value, isDark }: { label: string; value: string; isDark: boolean }) {
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
      <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 900 }}>{label}</div>
      <div style={{ fontWeight: 800, textAlign: "right" }}>{value}</div>
    </div>
  );
}
