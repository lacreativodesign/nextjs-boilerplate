"use client";

import { useEffect, useMemo, useState } from "react";
import MasterSelect from "@/components/ui/MasterSelect";
import { apiFetch } from "@/lib/api/client";
import { SmartSearchBar } from "@/components/search/SmartSearchBar";

const CHANGE_REQUEST_TYPES = ["Scope Change", "Revision", "New Feature", "Bug Fix", "Other"] as const;
const CHANGE_REQUEST_STATUSES = [
  "Submitted",
  "In Review",
  "Approved",
  "In Progress",
  "Completed",
  "Rejected",
] as const;
const CHANGE_REQUEST_PRIORITIES = ["Low", "Medium", "High"] as const;

type ChangeRequestRecord = {
  id: string;
  projectId: string;
  projectName: string;
  clientId: string;
  clientName: string;
  type: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  approvalStatus?: string | null;
  approvalId?: string | null;
  requiresApproval?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type ChangeRequestsPayload = {
  ok: boolean;
  changeRequests: ChangeRequestRecord[];
  error?: string;
};


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

export default function AMChangeRequestsPage() {
  const [changeRequests, setChangeRequests] = useState<ChangeRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ChangeRequestRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createProjectId, setCreateProjectId] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createType, setCreateType] = useState<string>(CHANGE_REQUEST_TYPES[0]);
  const [createPriority, setCreatePriority] = useState<string>(CHANGE_REQUEST_PRIORITIES[1]);
  const [actionLoading, setActionLoading] = useState(false);
  const [approvalLoading, setApprovalLoading] = useState(false);

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

  const headerLabel = (label: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span>{label}</span>
      <span style={{ width: 14, display: "inline-block", textAlign: "center", opacity: 0.35 }}>•</span>
    </span>
  );

  async function loadChangeRequests(mountedRef?: { current: boolean }) {
    const mounted = mountedRef ? mountedRef.current : true;
    if (!mounted) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      const res = await apiFetch(`/api/am/change-requests/list?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = (await res.json()) as ChangeRequestsPayload;
      if (!res.ok || !payload.ok) {
        throw new Error(payload?.error || "Unable to load change requests.");
      }
      if (mountedRef ? mountedRef.current : true) {
        setChangeRequests(payload.changeRequests || []);
      }
    } catch (err: any) {
      console.error(err);
      if (mountedRef ? mountedRef.current : true) setError(err?.message || "Unable to load change requests.");
    } finally {
      if (mountedRef ? mountedRef.current : true) setLoading(false);
    }
  }

  useEffect(() => {
    const mountedRef = { current: true };
    void loadChangeRequests(mountedRef);
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return changeRequests.filter((cr) => {
      if (statusFilter !== "all" && cr.status !== statusFilter) return false;
      if (typeFilter !== "all" && cr.type !== typeFilter) return false;
      if (priorityFilter !== "all" && cr.priority !== priorityFilter) return false;
      if (q) {
        const hay = [cr.projectName, cr.clientName, cr.title].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [changeRequests, search, statusFilter, typeFilter, priorityFilter]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, cr) => {
        acc.total += 1;
        if (["Submitted", "In Review", "Approved"].includes(cr.status)) acc.pending += 1;
        if (cr.status === "In Progress") acc.inProgress += 1;
        if (cr.status === "Completed") acc.completed += 1;
        return acc;
      },
      { total: 0, pending: 0, inProgress: 0, completed: 0 }
    );
  }, [filtered]);

  const openDrawer = (cr: ChangeRequestRecord) => {
    setSelected(cr);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setSelected(null);
    setDrawerOpen(false);
  };

  const handleStatusUpdate = async (toStatus: string) => {
    if (!selected) return;
    setActionLoading(true);
    try {
      const res = await apiFetch("/api/am/change-requests/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeRequestId: selected.id, toStatus }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload?.error || "Unable to update status.");
      }
      setSelected((prev) => (prev ? { ...prev, status: toStatus } : prev));
      setChangeRequests((prev) => prev.map((item) => (item.id === selected.id ? { ...item, status: toStatus } : item)));
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const requestApproval = async () => {
    if (!selected) return;
    setApprovalLoading(true);
    try {
      const res = await apiFetch("/api/approvals/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "change_request",
          entityType: "project",
          entityId: selected.projectId,
          requestedData: {
            changeRequestId: selected.id,
            title: selected.title,
            type: selected.type,
          },
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload?.error || "Unable to request approval.");
      }
      setSelected((prev) => (prev ? { ...prev, approvalStatus: "pending" } : prev));
      setChangeRequests((prev) =>
        prev.map((item) => (item.id === selected.id ? { ...item, approvalStatus: "pending" } : item))
      );
    } catch (err) {
      console.error(err);
    } finally {
      setApprovalLoading(false);
    }
  };

  const approvalBadge = (status?: string | null) => {
    const normalized = (status || "").toLowerCase();
    if (normalized === "pending") return { label: "Pending", tone: "rgba(251,191,36,0.15)", color: "#b45309" };
    if (normalized === "approved") return { label: "Approved", tone: "rgba(34,197,94,0.15)", color: "#15803d" };
    if (normalized === "rejected") return { label: "Rejected", tone: "rgba(248,113,113,0.15)", color: "#b91c1c" };
    return { label: "Not required", tone: "rgba(148,163,184,0.15)", color: "var(--text-muted)" };
  };

  const handleCreate = async () => {
    if (!createProjectId.trim() || !createTitle.trim() || !createDescription.trim()) return;
    setActionLoading(true);
    try {
      const res = await apiFetch("/api/am/change-requests/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: createProjectId.trim(),
          title: createTitle.trim(),
          description: createDescription.trim(),
          type: createType,
          priority: createPriority,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload?.error || "Unable to create change request.");
      }
      setCreateProjectId("");
      setCreateTitle("");
      setCreateDescription("");
      setCreateOpen(false);
      await loadChangeRequests();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Change Requests</h1>
        <p className="page-subtitle">Coordinate scope updates and execution progress for your projects.</p>
      </div>

      <div className="kpis">
        <KpiCard label="Total Requests" value={totals.total} />
        <KpiCard label="Pending Approval" value={totals.pending} />
        <KpiCard label="In Progress" value={totals.inProgress} />
        <KpiCard label="Completed" value={totals.completed} />
      </div>

      <div style={tableShellStyle}>
        <div className="flex flex-wrap items-center justify-between gap-3" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Change Requests</div>
          <div className="flex gap-2">
            <button className="btn" onClick={() => setCreateOpen(true)}>
              Create CR
            </button>
            <button className="btn ghost" onClick={() => loadChangeRequests()}>
              Refresh
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <SmartSearchBar
            value={search}
            onChange={setSearch}
            onSubmit={() => loadChangeRequests()}
            placeholder="Search keyword"
          />
          <MasterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[{ value: "all", label: "All Status" }, ...CHANGE_REQUEST_STATUSES.map((value) => ({ value, label: value }))]}
          />
          <MasterSelect
            value={typeFilter}
            onChange={setTypeFilter}
            options={[{ value: "all", label: "All Types" }, ...CHANGE_REQUEST_TYPES.map((value) => ({ value, label: value }))]}
          />
          <MasterSelect
            value={priorityFilter}
            onChange={setPriorityFilter}
            options={[{ value: "all", label: "All Priorities" }, ...CHANGE_REQUEST_PRIORITIES.map((value) => ({ value, label: value }))]}
          />
        </div>
      </div>

      {error && (
        <div className="card" style={{ padding: 12, borderRadius: 12, borderColor: "var(--danger)" }}>
          <span style={{ color: "var(--danger)", fontSize: 13 }}>{error}</span>
        </div>
      )}

      <div style={tableShellStyle}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
            <thead>
              <tr>
                <th style={headerCellStyle}>{headerLabel("Project")}</th>
                <th style={headerCellStyle}>{headerLabel("Client")}</th>
                <th style={{ ...headerCellStyle, textAlign: "center" }}>{headerLabel("Type")}</th>
                <th style={headerCellStyle}>{headerLabel("Title")}</th>
                <th style={{ ...headerCellStyle, textAlign: "center" }}>{headerLabel("Status")}</th>
                <th style={{ ...headerCellStyle, textAlign: "center" }}>{headerLabel("Approval")}</th>
                <th style={{ ...headerCellStyle, textAlign: "center" }}>{headerLabel("Priority")}</th>
                <th style={{ ...headerCellStyle, textAlign: "center" }}>{headerLabel("Updated")}</th>
                <th style={{ ...headerCellStyle, textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((cr) => (
                <tr key={cr.id}>
                  <td style={{ ...cellStyle, textAlign: "left" }}>{cr.projectName}</td>
                  <td style={{ ...cellStyle, textAlign: "left" }}>{cr.clientName}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>{cr.type}</td>
                  <td style={{ ...cellStyle, textAlign: "left" }}>{cr.title}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>{cr.status}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>
                    <span
                      style={{
                        padding: "4px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 600,
                        background: approvalBadge(cr.approvalStatus).tone,
                        color: approvalBadge(cr.approvalStatus).color,
                      }}
                    >
                      {approvalBadge(cr.approvalStatus).label}
                    </span>
                  </td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>{cr.priority}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>{fmtDate(cr.updatedAt || cr.createdAt)}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>
                    <button className="btn ghost" onClick={() => openDrawer(cr)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ ...cellStyle, textAlign: "center", padding: "24px 16px" }}>
                    No change requests found.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={9} style={{ ...cellStyle, textAlign: "center", padding: "24px 16px" }}>
                    Loading change requests...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {drawerOpen && selected && (
        <div className="drawer-overlay" onClick={closeDrawer}>
          <div className="drawer-panel drawer-panel--md" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-title">{selected.title}</div>
            <div className="drawer-subtitle">
              {selected.projectName} · {selected.clientName}
            </div>
            <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Description</div>
                <div style={{ fontSize: 13 }}>{selected.description}</div>
              </div>
              <div className="grid gap-2">
                <div style={{ fontSize: 13 }}>Status: {selected.status}</div>
                <div style={{ fontSize: 13 }}>Priority: {selected.priority}</div>
                <div style={{ fontSize: 13 }}>Type: {selected.type}</div>
                <div style={{ fontSize: 13 }}>
                  Approval: {approvalBadge(selected.approvalStatus).label}
                </div>
                <div style={{ fontSize: 13 }}>Created: {fmtDateTime(selected.createdAt)}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn"
                  onClick={() => handleStatusUpdate("In Progress")}
                  disabled={
                    actionLoading ||
                    selected.status !== "Approved" ||
                    (selected.requiresApproval && selected.approvalStatus !== "approved")
                  }
                >
                  Mark In Progress
                </button>
                <button
                  className="btn ghost"
                  onClick={() => handleStatusUpdate("Completed")}
                  disabled={actionLoading || selected.status !== "In Progress"}
                >
                  Mark Completed
                </button>
                {selected.requiresApproval && selected.approvalStatus !== "pending" && (
                  <button className="btn ghost" onClick={requestApproval} disabled={approvalLoading}>
                    {approvalLoading ? "Requesting..." : "Request Approval"}
                  </button>
                )}
              </div>
            </div>
            <div style={{ marginTop: 18 }}>
              <button className="btn ghost" onClick={closeDrawer} style={{ width: "100%" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {createOpen && (
        <div className="drawer-overlay" onClick={() => setCreateOpen(false)}>
          <div className="drawer-panel drawer-panel--md" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-title">Create Change Request</div>
            <div className="drawer-subtitle">Submit for your assigned project</div>
            <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
              <input
                className="input"
                placeholder="Project ID"
                value={createProjectId}
                onChange={(event) => setCreateProjectId(event.target.value)}
              />
              <MasterSelect
                value={createType}
                onChange={(value) => setCreateType(value)}
                options={CHANGE_REQUEST_TYPES.map((value) => ({ value, label: value }))}
              />
              <MasterSelect
                value={createPriority}
                onChange={(value) => setCreatePriority(value)}
                options={CHANGE_REQUEST_PRIORITIES.map((value) => ({ value, label: value }))}
              />
              <input
                className="input"
                placeholder="Request title"
                value={createTitle}
                onChange={(event) => setCreateTitle(event.target.value)}
              />
              <textarea
                className="input"
                placeholder="Describe the requested change"
                value={createDescription}
                onChange={(event) => setCreateDescription(event.target.value)}
                rows={4}
              />
              <button className="btn" onClick={handleCreate} disabled={actionLoading}>
                Submit change request
              </button>
              <button className="btn ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
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
