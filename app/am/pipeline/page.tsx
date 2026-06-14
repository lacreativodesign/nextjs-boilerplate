"use client";

import { useEffect, useMemo, useState } from "react";
import MasterSelect from "@/components/ui/MasterSelect";
import AMProjectDrawer, { type AMProject } from "@/components/am/AMProjectDrawer";
import { apiFetch } from "@/lib/api/client";

const STAGES = ["Kickoff", "Draft", "Review", "Revisions", "Final", "Delivered"] as const;

type PipelinePayload = {
  ok: boolean;
  projects: AMProject[];
  error?: string;
};


function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

export default function AMPipelinePage() {
  const [projects, setProjects] = useState<AMProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<AMProject | null>(null);
  const [stageRequests, setStageRequests] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const shellStyle: React.CSSProperties = {
    borderRadius: 20,
    padding: 14,
    border: "1px solid var(--border-subtle)",
    background: "var(--surface-card)",
    boxShadow: "var(--shadow-md)",
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch("/api/am/pipeline", { cache: "no-store" });
        const payload = (await res.json()) as PipelinePayload;
        if (!res.ok || !payload.ok) {
          throw new Error(payload?.error || "Unable to load pipeline.");
        }
        if (active) setProjects(payload.projects || []);
      } catch (err: any) {
        console.error(err);
        if (active) setError(err?.message || "Unable to load pipeline.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const grouped = useMemo(() => {
    const map: Record<string, AMProject[]> = {};
    STAGES.forEach((stage) => {
      map[stage] = [];
    });
    projects.forEach((project) => {
      const stage = STAGES.includes(project.stage as (typeof STAGES)[number]) ? project.stage : "Kickoff";
      map[stage] = [...(map[stage] || []), project];
    });
    return map;
  }, [projects]);

  const openDrawer = (project: AMProject) => {
    setSelected(project);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelected(null);
  };

  const handleRequestMove = async (project: AMProject) => {
    const requestedStage = stageRequests[project.id];
    if (!requestedStage) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await apiFetch("/api/am/projects/request-stage-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          requestedStage,
          note: "",
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload?.error || "Unable to request stage move.");
      }
      setStageRequests((prev) => ({ ...prev, [project.id]: "" }));
    } catch (err: any) {
      console.error(err);
      setActionError(err?.message || "Unable to request stage move.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDirectMove = async (project: AMProject) => {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await apiFetch("/api/am/projects/move-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          toStage: "Draft",
          note: "",
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload?.error || "Unable to move stage.");
      }
      const updated = payload.project as AMProject;
      setProjects((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err: any) {
      console.error(err);
      setActionError(err?.message || "Unable to move stage.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Delivery Pipeline</h1>
        <p className="page-subtitle">Track and coordinate stage progress for assigned projects.</p>
      </div>

      {error && (
        <div className="card" style={{ padding: 12, borderRadius: 12, borderColor: "var(--danger)" }}>
          <span style={{ color: "var(--danger)", fontSize: 13 }}>{error}</span>
        </div>
      )}

      {actionError && (
        <div className="card" style={{ padding: 12, borderRadius: 12, borderColor: "var(--danger)" }}>
          <span style={{ color: "var(--danger)", fontSize: 13 }}>{actionError}</span>
        </div>
      )}

      <div style={shellStyle}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${STAGES.length}, minmax(220px, 1fr))`, gap: 12 }}>
            {STAGES.map((stage) => (
              <div key={stage} className="card" style={{ padding: 12, borderRadius: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{stage}</div>
                <div style={{ display: "grid", gap: 10 }}>
                  {(grouped[stage] || []).map((project) => (
                    <button
                      key={project.id}
                      onClick={() => openDrawer(project)}
                      className="card"
                      style={{
                        textAlign: "left",
                        padding: 12,
                        borderRadius: 12,
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{project.projectName}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>{project.clientName}</div>
                      <div style={{ fontSize: 12, marginTop: 6 }}>Due: {fmtDate(project.dueDate)}</div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>
                        Priority: {project.priority || "Normal"} · Health: {project.health || "On Track"}
                      </div>
                      <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                        <MasterSelect
                          value={stageRequests[project.id] || ""}
                          onChange={(value) => setStageRequests((prev) => ({ ...prev, [project.id]: value }))}
                          options={[{ value: "", label: "Request stage move" }, ...STAGES.map((value) => ({ value, label: value }))]}
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleRequestMove(project);
                            }}
                            disabled={!stageRequests[project.id] || actionLoading}
                          >
                            Request
                          </button>
                          {project.stage === "Kickoff" && (
                            <button
                              className="btn"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleDirectMove(project);
                              }}
                              disabled={actionLoading}
                            >
                              Move to Draft
                            </button>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                  {loading && (grouped[stage] || []).length === 0 && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading...</div>
                  )}
                  {!loading && (grouped[stage] || []).length === 0 && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No projects</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AMProjectDrawer open={drawerOpen} project={selected} onClose={closeDrawer} />
    </div>
  );
}
