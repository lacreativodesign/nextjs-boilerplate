"use client";

import { useEffect, useMemo, useState } from "react";

const CHANGE_REQUEST_TYPES = ["Scope Change", "Revision", "New Feature", "Bug Fix", "Other"];
const CHANGE_REQUEST_PRIORITIES = ["Low", "Medium", "High"];

type ChangeRequestRecord = {
  id: string;
  projectId: string;
  projectName: string;
  type: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  estimatedCost?: number | null;
  estimatedTimelineDays?: number | null;
  approvedAt?: string | null;
  approvedByUid?: string | null;
  createdAt: string | null;
};

type ProjectOption = { value: string; label: string };


function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

export default function ClientChangeRequestsPage() {
  const [changeRequests, setChangeRequests] = useState<ChangeRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ChangeRequestRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [formState, setFormState] = useState({
    projectId: "",
    type: CHANGE_REQUEST_TYPES[0],
    title: "",
    description: "",
    priority: CHANGE_REQUEST_PRIORITIES[1],
  });
  const [actionLoading, setActionLoading] = useState(false);
  const [decisionLoading, setDecisionLoading] = useState(false);

  const headerCellStyle: React.CSSProperties = {
    padding: "12px 14px",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border-subtle)",
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

  const loadChangeRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/client/change-requests/list", { credentials: "include", cache: "no-store" });
      const payload = await res.json();
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || "Unable to load change requests.");
      setChangeRequests(payload.changeRequests || []);
    } catch (err) {
      setError((err instanceof Error ? err.message : undefined) || "Unable to load change requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadChangeRequests();
  }, []);

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const res = await fetch("/api/client/projects/list", { credentials: "include", cache: "no-store" });
        const payload = await res.json();
        if (!res.ok || !payload?.ok) return;
        const options = (payload.projects || []).map((project: unknown) => ({
          value: (project as Record<string, unknown>).id,
          label: (project as Record<string, unknown>).projectName || (project as Record<string, unknown>).id,
        }));
        setProjectOptions(options);
      } catch (err) {
        console.error(err);
      }
    };
    void loadProjects();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return changeRequests;
    return changeRequests.filter((request) => {
      const hay = [request.title, request.projectName, request.type].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [changeRequests, search]);

  const openDrawer = (request: ChangeRequestRecord) => {
    setSelected(request);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelected(null);
  };

  const submitChangeRequest = async () => {
    if (!formState.projectId || !formState.title.trim() || !formState.description.trim()) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/client/change-requests/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId: formState.projectId,
          type: formState.type,
          title: formState.title.trim(),
          description: formState.description.trim(),
          priority: formState.priority,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) throw new Error(payload?.error || "Unable to submit change request.");
      setCreateOpen(false);
      setFormState({
        projectId: "",
        type: CHANGE_REQUEST_TYPES[0],
        title: "",
        description: "",
        priority: CHANGE_REQUEST_PRIORITIES[1],
      });
      await loadChangeRequests();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDecision = async (request: ChangeRequestRecord, decision: "approve" | "reject") => {
    setDecisionLoading(true);
    try {
      const res = await fetch("/api/client/change-requests/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ changeRequestId: request.id, decision }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) throw new Error(payload?.error || "Unable to update change request.");
      await loadChangeRequests();
      closeDrawer();
    } catch (err) {
      console.error(err);
    } finally {
      setDecisionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Change Requests</h1>
        <p className="page-subtitle">Submit updates and track approvals for your projects.</p>
      </div>

      <div className="card p-4">
        <div className="page-header">
          <input className="input" placeholder="Search keyword" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn" onClick={() => setCreateOpen(true)}>
            New Change Request
          </button>
        </div>
      </div>

      <div className="table-shell">
        {loading ? (
          <div className="p-4 text-sm text-[var(--text-muted)]">Loading change requests...</div>
        ) : error ? (
          <div className="p-4 text-sm text-red-400">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-sm text-[var(--text-muted)]">No change requests found.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ minWidth: 860 }}>
              <thead>
                <tr>
                  <th style={headerCellStyle}>Title</th>
                  <th style={headerCellStyle}>Project</th>
                  <th style={headerCellStyle}>Type</th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Status</th>
                  <th style={{ ...headerCellStyle, textAlign: "right" }}>Created</th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((request) => {
                  return (
                    <tr key={request.id} >
                      <td style={{ ...cellStyle, whiteSpace: "normal" }}>{request.title}</td>
                      <td style={cellStyle}>{request.projectName || "-"}</td>
                      <td style={cellStyle}>{request.type}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>{request.status}</td>
                      <td style={{ ...cellStyle, textAlign: "right" }}>{fmtDate(request.createdAt)}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        <button className="btn ghost" style={{ borderRadius: 999 }} onClick={() => openDrawer(request)}>
                          View
                        </button>
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
          <div className="drawer-panel drawer-panel--md" onClick={(event) => event.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{selected.title}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {selected.projectName} · {selected.type}
                </div>
              </div>
              <button className="btn ghost" onClick={closeDrawer} style={{ height: 34, borderRadius: 999 }}>
                Close
              </button>
            </div>

            <div style={{ height: 16 }} />

            <div className="card p-4">
              <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Details</div>
              <div className="mt-3 grid gap-3">
                <Row label="Status" value={selected.status} />
                <Row label="Priority" value={selected.priority} />
                <Row
                  label="Estimated Cost"
                  value={
                    selected.estimatedCost !== null && selected.estimatedCost !== undefined
                      ? `$${selected.estimatedCost.toLocaleString()}`
                      : "Pending"
                  }
                />
                <Row
                  label="Timeline Impact"
                  value={
                    selected.estimatedTimelineDays !== null && selected.estimatedTimelineDays !== undefined
                      ? `${selected.estimatedTimelineDays} days`
                      : "Pending"
                  }
                />
                <Row label="Created" value={fmtDate(selected.createdAt)} />
              </div>
              <div className="mt-3 text-sm">{selected.description}</div>
            </div>

            {["Submitted", "In Review"].includes(selected.status) && (
              <div className="card p-4 mt-3">
                <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Your decision</div>
                <p className="text-sm mt-2 text-[var(--text-muted)]">
                  Approve to move forward or reject if you need more changes.
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    className="btn ghost"
                    onClick={() => handleDecision(selected, "reject")}
                    disabled={decisionLoading}
                  >
                    Reject
                  </button>
                  <button className="btn" onClick={() => handleDecision(selected, "approve")} disabled={decisionLoading}>
                    Approve
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {createOpen && (
        <div className="drawer-overlay" onClick={() => setCreateOpen(false)}>
          <div className="drawer-panel drawer-panel--md" onClick={(event) => event.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>New Change Request</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Submit an update for your delivery team.</div>
              </div>
              <button className="btn ghost" onClick={() => setCreateOpen(false)} style={{ height: 34, borderRadius: 999 }}>
                Close
              </button>
            </div>

            <div style={{ height: 16 }} />

            <div className="card p-4 grid gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Project</div>
                <select
                  className="input mt-2"
                  value={formState.projectId}
                  onChange={(e) => setFormState((prev) => ({ ...prev, projectId: e.target.value }))}
                >
                  <option value="">Select project</option>
                  {projectOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Type</div>
                <select
                  className="input mt-2"
                  value={formState.type}
                  onChange={(e) => setFormState((prev) => ({ ...prev, type: e.target.value }))}
                >
                  {CHANGE_REQUEST_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Title</div>
                <input
                  className="input mt-2"
                  value={formState.title}
                  onChange={(e) => setFormState((prev) => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Description</div>
                <textarea
                  className="input mt-2"
                  rows={4}
                  value={formState.description}
                  onChange={(e) => setFormState((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Priority</div>
                <select
                  className="input mt-2"
                  value={formState.priority}
                  onChange={(e) => setFormState((prev) => ({ ...prev, priority: e.target.value }))}
                >
                  {CHANGE_REQUEST_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end">
                <button
                  className="btn"
                  onClick={submitChangeRequest}
                  disabled={
                    actionLoading || !formState.projectId || !formState.title.trim() || !formState.description.trim()
                  }
                >
                  {actionLoading ? "Submitting..." : "Submit Request"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}
