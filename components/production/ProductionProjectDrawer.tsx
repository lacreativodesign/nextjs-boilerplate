"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import MasterSelect from "@/components/ui/MasterSelect";
import { getFirebaseStorage } from "@/lib/firebaseClient";

const FILE_CATEGORIES = ["Draft", "Revision", "Final"] as const;
const STAGES = ["Kickoff", "Draft", "Review", "Revisions", "Final", "Delivered"] as const;

type Stage = (typeof STAGES)[number];

type StageHistoryEntry = {
  from?: string;
  to?: string;
  byUid?: string;
  byName?: string;
  at?: string | null;
  reason?: string | null;
};

type ProductionProject = {
  id: string;
  projectName: string;
  clientName: string;
  projectType?: string;
  stage: Stage | string;
  priority?: string;
  health?: string;
  dueDate?: string | null;
  ownerAmUid?: string | null;
  ownerAmName?: string | null;
  productionUid?: string | null;
  productionName?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  stageHistory?: StageHistoryEntry[];
};

type ProductionUserOption = {
  value: string;
  label: string;
};

type FileRecord = {
  id: string;
  category: string;
  fileName: string;
  downloadUrl: string;
  uploadedByName?: string;
  uploadedAt?: string | null;
  isLatest?: boolean;
};

type ChangeRequestRecord = {
  id: string;
  title: string;
  status: string;
  createdAt?: string | null;
};

type DrawerMode = "queue" | "qa";

type Props = {
  open: boolean;
  project: ProductionProject | null;
  productionUsers: ProductionUserOption[];
  mode?: DrawerMode;
  onClose: () => void;
  onProjectUpdated?: (project: ProductionProject) => void;
  onRefresh?: () => void;
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

function fmtDateTime(iso?: string | null) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function buildSafeName(name: string) {
  return name.replace(/\s+/g, "_");
}

function getAllowedMoves(stage?: string) {
  const map: Record<string, Stage[]> = {
    Kickoff: ["Draft"],
    Draft: ["Review"],
    Review: ["Revisions", "Draft"],
    Revisions: ["Review", "Final"],
    Final: ["Delivered", "Revisions"],
    Delivered: [],
  };
  return map[stage || ""] || [];
}

function isOpenChangeRequest(status: string) {
  return !["Completed", "Rejected"].includes(status);
}

export default function ProductionProjectDrawer({
  open,
  project,
  productionUsers,
  mode = "queue",
  onClose,
  onProjectUpdated,
  onRefresh,
}: Props) {
  const isDark = useIsSystemDark();
  const [activeProject, setActiveProject] = useState<ProductionProject | null>(project);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequestRecord[]>([]);
  const [loadingPanel, setLoadingPanel] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedStage, setSelectedStage] = useState<string>("");
  const [selectedProduction, setSelectedProduction] = useState<string>("");
  const [qaNotes, setQaNotes] = useState("");
  const [qaReason, setQaReason] = useState("");
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setActiveProject(project);
  }, [project]);

  useEffect(() => {
    if (!open || !project) return;
    setLoadingPanel(true);
    setActionError(null);
    Promise.all([
      fetch(`/api/admin/production/files/list?projectId=${project.id}`, {
        credentials: "include",
        cache: "no-store",
      })
        .then(async (res) => {
          if (!res.ok) throw new Error("Unable to load files.");
          return (await res.json()) as { ok: boolean; files: FileRecord[] };
        })
        .then((payload) => setFiles(payload.files || []))
        .catch((err) => {
          console.error(err);
          setFiles([]);
        }),
      fetch(`/api/admin/change-requests/list?projectId=${project.id}`, {
        credentials: "include",
        cache: "no-store",
      })
        .then(async (res) => {
          if (!res.ok) throw new Error("Unable to load change requests.");
          return (await res.json()) as { ok: boolean; changeRequests: ChangeRequestRecord[] };
        })
        .then((payload) => setChangeRequests(payload.changeRequests || []))
        .catch((err) => {
          console.error(err);
          setChangeRequests([]);
        }),
    ])
      .finally(() => setLoadingPanel(false));
  }, [open, project]);

  useEffect(() => {
    setSelectedProduction(project?.productionUid || "");
  }, [project?.productionUid]);

  const productionOptions = useMemo(() => {
    return [{ value: "", label: "Unassigned" }, ...productionUsers];
  }, [productionUsers]);

  const latestFiles = useMemo(() => {
    return files.filter((file) => file.isLatest !== false && FILE_CATEGORIES.includes(file.category as any));
  }, [files]);

  const groupedFiles = useMemo(() => {
    const map: Record<string, FileRecord[]> = { Draft: [], Revision: [], Final: [] };
    latestFiles.forEach((file) => {
      if (map[file.category]) map[file.category].push(file);
    });
    return map;
  }, [latestFiles]);

  const openChangeRequests = useMemo(() => {
    return changeRequests.filter((item) => isOpenChangeRequest(item.status));
  }, [changeRequests]);

  const hasFinalFile = groupedFiles.Final.length > 0;
  const noOpenCRs = openChangeRequests.length === 0;

  if (!open || !activeProject) return null;

  async function handleAssignProduction() {
    if (!activeProject) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/production/project/assign", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: activeProject.id, productionUid: selectedProduction || null }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload?.error || "Unable to update production owner.");
      }
      setActiveProject(payload.project);
      onProjectUpdated?.(payload.project);
      onRefresh?.();
    } catch (err: any) {
      console.error(err);
      setActionError(err?.message || "Unable to update production owner.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleMoveStage(targetStage: string, eventType?: string) {
    if (!activeProject || !targetStage) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/production/project/move-stage", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: activeProject.id,
          toStage: targetStage,
          reason: eventType === "project.qa_rejected" ? qaReason.trim() : null,
          eventType,
          qaNotes: qaNotes.trim() || null,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload?.error || "Unable to move stage.");
      }
      setActiveProject(payload.project);
      onProjectUpdated?.(payload.project);
      onRefresh?.();
      setSelectedStage("");
      setQaReason("");
    } catch (err: any) {
      console.error(err);
      setActionError(err?.message || "Unable to move stage.");
    } finally {
      setActionLoading(false);
    }
  }

  async function refreshFiles() {
    if (!activeProject) return;
    try {
      const res = await fetch(`/api/admin/production/files/list?projectId=${activeProject.id}`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = await res.json();
      if (res.ok && payload.ok) {
        setFiles(payload.files || []);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleFileSelected(file: File) {
    if (!activeProject || !uploadingCategory) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const storage = await getFirebaseStorage();
      const fileId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
      const safeName = buildSafeName(file.name);
      const storagePath = `projects/${activeProject.id}/${uploadingCategory}/${fileId}_${safeName}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);

      const createRes = await fetch("/api/admin/files/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: activeProject.id,
          category: uploadingCategory,
          fileName: file.name,
          storagePath,
          downloadUrl,
          size: file.size,
          mimeType: file.type || null,
          version: null,
          notes: null,
        }),
      });
      const createPayload = await createRes.json();
      if (!createRes.ok || !createPayload.ok) {
        throw new Error(createPayload?.error || "Unable to create file record.");
      }

      await fetch("/api/admin/production/events/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "file.uploaded",
          projectId: activeProject.id,
          payload: {
            category: uploadingCategory,
            fileName: file.name,
            fileId: createPayload.id,
          },
        }),
      });

      await refreshFiles();
      onRefresh?.();
    } catch (err: any) {
      console.error(err);
      setActionError(err?.message || "Unable to upload file.");
    } finally {
      setUploadingCategory(null);
      setActionLoading(false);
    }
  }

  function triggerFileUpload(category: string) {
    setUploadingCategory(category);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }

  const allowedMoves = getAllowedMoves(activeProject.stage);

  const headerBadgeStyle: React.CSSProperties = {
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    background: isDark ? "rgba(148,163,184,0.2)" : "rgba(15,23,42,0.08)",
    color: isDark ? "rgba(226,232,240,0.85)" : "rgba(15,23,42,0.7)",
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-panel drawer-panel--lg" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div className="drawer-title">{activeProject.projectName}</div>
            <div className="drawer-subtitle">
              {activeProject.clientName}
              {activeProject.projectType ? ` · ${activeProject.projectType}` : ""}
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
              <span style={headerBadgeStyle}>{activeProject.stage}</span>
              <span style={headerBadgeStyle}>{activeProject.priority || "Normal"}</span>
              <span style={headerBadgeStyle}>{activeProject.health || "On Track"}</span>
            </div>
          </div>

          <button className="btn ghost" onClick={onClose} style={{ height: 34, borderRadius: 999, fontWeight: 400 }}>
            Close
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleFileSelected(file);
            } else {
              setUploadingCategory(null);
            }
          }}
        />

        <div style={{ height: 16 }} />

        {actionError && (
          <div
            style={{
              marginBottom: 12,
              padding: 10,
              borderRadius: 10,
              background: isDark ? "rgba(248,113,113,0.15)" : "rgba(248,113,113,0.12)",
              color: isDark ? "#fecaca" : "#7f1d1d",
              fontSize: 12,
            }}
          >
            {actionError}
          </div>
        )}

        <Section title="Quick Actions" isDark={isDark}>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Assign Production Owner</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <MasterSelect
                  value={selectedProduction}
                  onChange={(value) => setSelectedProduction(value)}
                  options={productionOptions}
                />
                <button
                  className="btn"
                  style={{ borderRadius: 999, padding: "6px 14px" }}
                  onClick={handleAssignProduction}
                  disabled={actionLoading}
                >
                  {actionLoading ? "Saving..." : "Update"}
                </button>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Move Stage</div>
              {allowedMoves.length > 0 ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <MasterSelect
                    value={selectedStage}
                    onChange={(value) => setSelectedStage(value)}
                    options={allowedMoves.map((stage) => ({ value: stage, label: stage }))}
                  />
                  <button
                    className="btn"
                    style={{ borderRadius: 999, padding: "6px 14px" }}
                    onClick={() => handleMoveStage(selectedStage)}
                    disabled={actionLoading || !selectedStage}
                  >
                    {actionLoading ? "Moving..." : "Move"}
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: 12, opacity: 0.6 }}>No stage moves available from {activeProject.stage}.</div>
              )}
            </div>
          </div>
        </Section>

        <div style={{ height: 12 }} />

        <Section title="Files" isDark={isDark}>
          {loadingPanel ? (
            <div style={{ fontSize: 12, opacity: 0.7 }}>Loading files…</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {FILE_CATEGORIES.map((category) => (
                <div key={category} style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontWeight: 600 }}>{category}</div>
                    <button
                      className="btn ghost"
                      style={{ borderRadius: 999, padding: "6px 12px" }}
                      disabled={actionLoading}
                      onClick={() => triggerFileUpload(category)}
                    >
                      Upload {category}
                    </button>
                  </div>
                  {groupedFiles[category]?.length ? (
                    groupedFiles[category].map((file) => (
                      <div
                        key={file.id}
                        style={{
                          padding: 10,
                          borderRadius: 10,
                          border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
                          display: "grid",
                          gap: 4,
                        }}
                      >
                        <a
                          href={file.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontWeight: 600, fontSize: 13 }}
                        >
                          {file.fileName}
                        </a>
                        <div style={{ fontSize: 11, opacity: 0.65 }}>
                          {file.uploadedByName || "Unknown"} · {fmtDateTime(file.uploadedAt)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: 12, opacity: 0.6 }}>No {category.toLowerCase()} files yet.</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        <div style={{ height: 12 }} />

        <Section title="Change Requests" isDark={isDark}>
          {loadingPanel ? (
            <div style={{ fontSize: 12, opacity: 0.7 }}>Loading change requests…</div>
          ) : openChangeRequests.length > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              {openChangeRequests.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
                    display: "grid",
                    gap: 4,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{item.title}</div>
                  <div style={{ fontSize: 11, opacity: 0.6 }}>
                    Status: {item.status} · {fmtDate(item.createdAt)}
                  </div>
                </div>
              ))}
              <a
                href={`/admin/projects/change-requests?projectId=${activeProject.id}`}
                style={{ fontSize: 12, color: isDark ? "#e2e8f0" : "#1f2937", textDecoration: "underline" }}
              >
                View all change requests
              </a>
            </div>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.6 }}>No open change requests.</div>
          )}
        </Section>

        <div style={{ height: 12 }} />

        {mode === "qa" && (
          <>
            <Section title="QA Checklist" isDark={isDark}>
              <div style={{ display: "grid", gap: 10, fontSize: 12 }}>
                <ChecklistRow label="Final file exists" ok={hasFinalFile} isDark={isDark} />
                <ChecklistRow label="No open change requests" ok={noOpenCRs} isDark={isDark} />
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontWeight: 600 }}>Notes (optional)</span>
                  <textarea
                    className="input"
                    value={qaNotes}
                    onChange={(event) => setQaNotes(event.target.value)}
                    rows={3}
                    style={{ resize: "vertical" }}
                  />
                </label>
              </div>
            </Section>

            <div style={{ height: 12 }} />

            <Section title="QA Actions" isDark={isDark}>
              <div style={{ display: "grid", gap: 12 }}>
                <button
                  className="btn"
                  style={{ borderRadius: 999, padding: "8px 16px" }}
                  onClick={() => {
                    void handleMoveStage("Delivered", "project.qa_approved");
                  }}
                  disabled={actionLoading}
                >
                  {actionLoading ? "Processing..." : "Approve & Deliver"}
                </button>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontWeight: 600, fontSize: 12 }}>Reject to Revisions (reason required)</label>
                  <textarea
                    className="input"
                    rows={3}
                    value={qaReason}
                    onChange={(event) => setQaReason(event.target.value)}
                    placeholder="Provide reason for rejection"
                  />
                  <button
                    className="btn ghost"
                    style={{ borderRadius: 999, padding: "8px 16px" }}
                    onClick={() => {
                      if (!qaReason.trim()) {
                        setActionError("Reason is required to reject QA.");
                        return;
                      }
                      void handleMoveStage("Revisions", "project.qa_rejected");
                    }}
                    disabled={actionLoading}
                  >
                    {actionLoading ? "Processing..." : "Reject to Revisions"}
                  </button>
                </div>
              </div>
            </Section>

            <div style={{ height: 12 }} />
          </>
        )}

        <Section title="Stage History" isDark={isDark}>
          {activeProject.stageHistory && activeProject.stageHistory.length > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              {[...activeProject.stageHistory]
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
                    {entry.reason ? <div style={{ opacity: 0.7 }}>Reason: {entry.reason}</div> : null}
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
          <button type="button" className="btn" onClick={onClose} style={{ borderRadius: 12, fontWeight: 400 }}>
            Done
          </button>
        </div>
      </div>
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
        border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function ChecklistRow({ label, ok, isDark }: { label: string; ok: boolean; isDark: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 10,
        borderRadius: 10,
        border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
      }}
    >
      <span>{label}</span>
      <span
        style={{
          padding: "2px 10px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 600,
          background: ok ? "rgba(34,197,94,0.15)" : "rgba(248,113,113,0.15)",
          color: ok ? (isDark ? "#86efac" : "#15803d") : isDark ? "#fecaca" : "#7f1d1d",
        }}
      >
        {ok ? "OK" : "Needs attention"}
      </span>
    </div>
  );
}

export type { ProductionProject, StageHistoryEntry, ProductionUserOption };
