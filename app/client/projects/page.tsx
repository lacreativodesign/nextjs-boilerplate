"use client";

import { useEffect, useMemo, useState } from "react";

const PIPELINE_STAGES = ["Inquiry", "Deposit", "Kickoff", "Draft", "Review", "Revisions", "Final", "Delivered"];

type ProjectRecord = {
  id: string;
  projectName: string;
  projectType: string;
  stage: string;
  dueDate: string | null;
  health: string;
  updatedAt: string | null;
  clientApprovalStatus: string;
};

type ProjectDetail = {
  id: string;
  projectName: string;
  projectType: string;
  stage: string;
  dueDate: string | null;
  updatedAt: string | null;
  description: string;
  clientName: string;
  ownerAmName: string;
  productionName: string;
  clientApprovalStatus: string;
  clientApprovedAt: string | null;
};

type ProjectDetailPayload = {
  ok: boolean;
  project: ProjectDetail;
  files: Array<{ id: string; fileName: string; category: string; downloadUrl: string; uploadedAt: string | null }>;
  messages: Array<{ id: string; senderName: string; senderRole: string; body: string; createdAt: string | null }>;
};


function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

export default function ClientProjectsPage() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ProjectDetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [crOpen, setCrOpen] = useState(false);
  const [crTitle, setCrTitle] = useState("");
  const [crDescription, setCrDescription] = useState("");
  const [crPriority, setCrPriority] = useState("Medium");
  const [actionLoading, setActionLoading] = useState(false);

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

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/client/projects/list", { credentials: "include", cache: "no-store" });
        const payload = await res.json();
        if (!res.ok || !payload?.ok) throw new Error(payload?.error || "Unable to load projects.");
        if (!alive) return;
        setProjects(payload.projects || []);
      } catch (err) {
        if (!alive) return;
        setError((err instanceof Error ? err.message : undefined) || "Unable to load projects.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((project) => {
      const hay = [project.projectName, project.projectType, project.stage].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [projects, search]);

  const openDrawer = async (project: ProjectRecord) => {
    setDrawerOpen(true);
    setDetailLoading(true);
    setSelected(null);
    setCrOpen(false);
    try {
      const res = await fetch(`/api/client/projects/get?id=${project.id}`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await res.json()) as ProjectDetailPayload;
      if (!res.ok || !payload.ok) throw new Error(payload?.error || "Unable to load project.");
      setSelected(payload);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelected(null);
    setCrOpen(false);
  };

  const submitApproval = async () => {
    if (!selected?.project?.id) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/client/projects/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ projectId: selected.project.id }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.ok) throw new Error(payload?.error || "Unable to approve.");
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              project: { ...prev.project, clientApprovalStatus: "approved", clientApprovedAt: new Date().toISOString() },
            }
          : prev
      );
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const submitRevision = async () => {
    if (!selected?.project?.id) return;
    if (!crTitle.trim() || !crDescription.trim()) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/client/change-requests/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId: selected.project.id,
          type: "Revision",
          title: crTitle.trim(),
          description: crDescription.trim(),
          priority: crPriority,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.ok) throw new Error(payload?.error || "Unable to submit change request.");
      setCrOpen(false);
      setCrTitle("");
      setCrDescription("");
      setCrPriority("Medium");
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Projects</h1>
        <p className="page-subtitle">Monitor delivery stages, due dates, and review approvals.</p>
      </div>

      <div className="card p-4">
        <div className="filter-bar filter-bar--search">
          <input className="input" placeholder="Search keyword" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {loading ? "Loading..." : `${filtered.length} project(s)`}
          </div>
        </div>
      </div>

      <div className="table-shell">
        {loading ? (
          <div className="p-4 text-sm text-[var(--text-muted)]">Loading projects...</div>
        ) : error ? (
          <div className="p-4 text-sm text-red-400">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-sm text-[var(--text-muted)]">No projects found.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={headerCellStyle}>Project</th>
                  <th style={headerCellStyle}>Type</th>
                  <th style={headerCellStyle}>Stage</th>
                  <th style={{ ...headerCellStyle, textAlign: "right" }}>Due Date</th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Health</th>
                  <th style={{ ...headerCellStyle, textAlign: "right" }}>Updated</th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((project) => {
                  return (
                    <tr
                      key={project.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => void openDrawer(project)}
                    >
                      <td style={{ ...cellStyle, whiteSpace: "normal" }}>{project.projectName}</td>
                      <td style={cellStyle}>{project.projectType || "-"}</td>
                      <td style={cellStyle}>{project.stage || "-"}</td>
                      <td style={{ ...cellStyle, textAlign: "right" }}>{fmtDate(project.dueDate)}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>{project.health || "On Track"}</td>
                      <td style={{ ...cellStyle, textAlign: "right" }}>{fmtDate(project.updatedAt)}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        <button
                          className="btn ghost"
                          style={{ borderRadius: 999 }}
                          onClick={(event) => {
                            event.stopPropagation();
                            void openDrawer(project);
                          }}
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
        )}
      </div>

      {drawerOpen && (
        <div className="drawer-overlay" onClick={closeDrawer}>
          <div className="drawer-panel drawer-panel--lg" onClick={(e) => e.stopPropagation()}>
            {detailLoading || !selected ? (
              <div className="text-sm text-[var(--text-muted)]">Loading project...</div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>{selected.project.projectName}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {selected.project.projectType || "-"} · {selected.project.stage}
                    </div>
                  </div>
                  <button className="btn ghost" onClick={closeDrawer} style={{ height: 34, borderRadius: 999 }}>
                    Close
                  </button>
                </div>

                <div style={{ height: 16 }} />

                <Section title="Project Summary">
                  <Row label="Stage" value={selected.project.stage || "-"} />
                  <Row label="Due Date" value={fmtDate(selected.project.dueDate)} />
                  <Row label="Account Manager" value={selected.project.ownerAmName || "-"} />
                  <Row label="Production Lead" value={selected.project.productionName || "-"} />
                  <Row
                    label="Client Approval"
                    value={selected.project.clientApprovalStatus === "approved" ? "Approved" : "Pending"}
                  />
                </Section>

                <div style={{ height: 12 }} />

                <Section title="Timeline">
                  <div style={{ display: "grid", gap: 8 }}>
                    {PIPELINE_STAGES.map((stage) => {
                      const isCurrent = stage === selected.project.stage;
                      return (
                        <div
                          key={stage}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            padding: "10px 12px",
                            borderRadius: 10,
                            background: isCurrent ? "rgba(59,130,246,0.12)" : "transparent",
                            border: "1px solid rgba(148,163,184,0.2)",
                            fontWeight: isCurrent ? 600 : 400,
                          }}
                        >
                          <span>{stage}</span>
                          <span style={{ opacity: 0.7 }}>{isCurrent ? "Current" : ""}</span>
                        </div>
                      );
                    })}
                  </div>
                </Section>

                <div style={{ height: 12 }} />

                <Section title="Key Files">
                  {selected.files.length ? (
                    selected.files.map((file) => (
                      <div key={file.id} className="flex items-center justify-between gap-3">
                        <div>
                          <div style={{ fontWeight: 600 }}>{file.fileName}</div>
                          <div style={{ fontSize: 12, opacity: 0.6 }}>{file.category}</div>
                        </div>
                        <a className="btn ghost" href={file.downloadUrl || "#"} target="_blank" rel="noreferrer">
                          Download
                        </a>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-[var(--text-muted)]">No files yet.</div>
                  )}
                </Section>

                <div style={{ height: 12 }} />

                <Section title="Latest Messages">
                  {selected.messages.length ? (
                    selected.messages.map((message) => (
                      <div key={message.id} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.2)" }}>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          {message.senderName || "Team"} · {fmtDate(message.createdAt)}
                        </div>
                        <div style={{ marginTop: 6 }}>{message.body}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-[var(--text-muted)]">No messages yet.</div>
                  )}
                </Section>

                <div style={{ height: 16 }} />

                {["Draft", "Review", "Final"].includes(selected.project.stage) && (
                  <div className="card p-4" style={{ background: "var(--surface-muted)" }}>
                    <div className="text-sm font-semibold">Client Actions</div>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      Approve the current stage or request revisions for your team.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button className="btn" onClick={submitApproval} disabled={actionLoading}>
                        {actionLoading ? "Working..." : "Approve Stage"}
                      </button>
                      <button className="btn ghost" onClick={() => setCrOpen((prev) => !prev)}>
                        Request Revision
                      </button>
                    </div>

                    {crOpen && (
                      <div className="mt-4 grid gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Title</div>
                          <input className="input mt-2" value={crTitle} onChange={(e) => setCrTitle(e.target.value)} />
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Description</div>
                          <textarea
                            className="input mt-2"
                            rows={4}
                            value={crDescription}
                            onChange={(e) => setCrDescription(e.target.value)}
                          />
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Priority</div>
                          <select className="input mt-2" value={crPriority} onChange={(e) => setCrPriority(e.target.value)}>
                            {["Low", "Medium", "High"].map((priority) => (
                              <option key={priority} value={priority}>
                                {priority}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex justify-end">
                          <button className="btn" onClick={submitRevision} disabled={actionLoading || !crTitle || !crDescription}>
                            {actionLoading ? "Submitting..." : "Send Request"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 14, borderRadius: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", opacity: 0.75 }}>{title}</div>
      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", gap: 12 }}>
      <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 500 }}>{label}</div>
      <div style={{ fontWeight: 600, textAlign: "right" }}>{value}</div>
    </div>
  );
}
