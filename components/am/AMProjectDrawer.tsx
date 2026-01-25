"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import MasterSelect from "@/components/ui/MasterSelect";
import { getFirebaseStorage } from "@/lib/firebaseClient";
import { normalizeRole } from "@/lib/roleRouting";

const FILE_CATEGORIES = ["Draft", "Revision", "Final"] as const;
const STAGES = ["Kickoff", "Draft", "Review", "Revisions", "Final", "Delivered"] as const;
const CHANGE_REQUEST_TYPES = ["Scope Change", "Revision", "New Feature", "Bug Fix", "Other"] as const;
const CHANGE_REQUEST_PRIORITIES = ["Low", "Medium", "High"] as const;

type Stage = (typeof STAGES)[number];

type StageHistoryEntry = {
  from?: string;
  to?: string;
  byUid?: string;
  byName?: string;
  at?: string | null;
  reason?: string | null;
};

export type AMProject = {
  id: string;
  projectName: string;
  clientName: string;
  clientId?: string;
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

type MessageRecord = {
  id: string;
  projectId: string;
  senderId: string;
  senderRole: string;
  senderName?: string | null;
  body: string;
  createdAt?: string | null;
};

type Props = {
  open: boolean;
  project: AMProject | null;
  onClose: () => void;
  onProjectUpdated?: (project: AMProject) => void;
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

export default function AMProjectDrawer({ open, project, onClose, onProjectUpdated }: Props) {
  const isDark = useIsSystemDark();
  const [activeProject, setActiveProject] = useState<AMProject | null>(project);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequestRecord[]>([]);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [loadingPanel, setLoadingPanel] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedStage, setSelectedStage] = useState<string>("");
  const [stageNote, setStageNote] = useState("");
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [crOpen, setCrOpen] = useState(false);
  const [crTitle, setCrTitle] = useState("");
  const [crDescription, setCrDescription] = useState("");
  const [crType, setCrType] = useState(CHANGE_REQUEST_TYPES[0]);
  const [crPriority, setCrPriority] = useState(CHANGE_REQUEST_PRIORITIES[1]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActiveProject(project);
  }, [project]);

  useEffect(() => {
    if (!open || !project) return;
    setLoadingPanel(true);
    setActionError(null);
    Promise.all([
      fetch(`/api/am/files/list?projectId=${project.id}`, {
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
      fetch(`/api/am/change-requests/list?projectId=${project.id}`, {
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
      fetch(`/api/am/messages/list?projectId=${project.id}`, {
        credentials: "include",
        cache: "no-store",
      })
        .then(async (res) => {
          if (!res.ok) throw new Error("Unable to load messages.");
          return (await res.json()) as { ok: boolean; messages: MessageRecord[] };
        })
        .then((payload) => setMessages(payload.messages || []))
        .catch((err) => {
          console.error(err);
          setMessages([]);
        }),
    ]).finally(() => setLoadingPanel(false));
  }, [open, project]);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    }
  }, [open, messages]);

  const latestFiles = useMemo(() => {
    return files.filter((file) => file.isLatest !== false && FILE_CATEGORIES.includes(file.category as any));
  }, [files]);

  const groupedFiles = useMemo(() => {
    return FILE_CATEGORIES.map((category) => ({
      category,
      items: latestFiles.filter((file) => file.category === category),
    }));
  }, [latestFiles]);

  const stageOptions = useMemo(() => {
    return STAGES.map((stage) => ({ value: stage, label: stage }));
  }, []);

  const canDirectMove = activeProject?.stage === "Kickoff";

  const headerStyle: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 700,
    color: isDark ? "rgba(255,255,255,0.92)" : "rgba(15,23,42,0.9)",
  };

  const cardStyle: React.CSSProperties = {
    borderRadius: 16,
    border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.10)",
    padding: 16,
    background: isDark ? "rgba(20,20,20,0.92)" : "rgba(255,255,255,0.9)",
    boxShadow: isDark ? "0 18px 40px rgba(0,0,0,0.45)" : "0 18px 55px rgba(15,23,42,0.10)",
  };

  const handleUploadClick = (category: string) => {
    setUploadingCategory(category);
    setTimeout(() => fileInputRef.current?.click(), 0);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !activeProject || !uploadingCategory) return;
    setActionError(null);
    setActionLoading(true);

    try {
      const storage = await getFirebaseStorage();
      const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const safeName = buildSafeName(file.name);
      const storagePath = `projects/${activeProject.id}/${uploadingCategory}/${fileId}_${safeName}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);

      const res = await fetch("/api/am/files/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: fileId,
          projectId: activeProject.id,
          category: uploadingCategory,
          fileName: file.name,
          storagePath,
          downloadUrl,
          size: file.size,
          mimeType: file.type,
        }),
      });

      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload?.error || "Unable to upload file.");
      }

      const listRes = await fetch(`/api/am/files/list?projectId=${activeProject.id}`, {
        credentials: "include",
        cache: "no-store",
      });
      const listPayload = await listRes.json();
      setFiles(listPayload.files || []);
    } catch (err: any) {
      console.error(err);
      setActionError(err?.message || "Unable to upload file.");
    } finally {
      setActionLoading(false);
      setUploadingCategory(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRequestStageMove = async () => {
    if (!activeProject || !selectedStage) return;
    setActionLoading(true);
    setActionError(null);

    try {
      const res = await fetch("/api/am/projects/request-stage-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId: activeProject.id,
          requestedStage: selectedStage,
          note: stageNote,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload?.error || "Unable to request stage move.");
      }
      setStageNote("");
      setSelectedStage("");
    } catch (err: any) {
      console.error(err);
      setActionError(err?.message || "Unable to request stage move.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDirectMove = async () => {
    if (!activeProject) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/am/projects/move-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId: activeProject.id,
          toStage: "Draft",
          note: stageNote,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload?.error || "Unable to move stage.");
      }
      const updated = payload.project as AMProject;
      setActiveProject(updated);
      onProjectUpdated?.(updated);
      setStageNote("");
      setSelectedStage("");
    } catch (err: any) {
      console.error(err);
      setActionError(err?.message || "Unable to move stage.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!activeProject || !messageBody.trim()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/am/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId: activeProject.id,
          body: messageBody.trim(),
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload?.error || "Unable to send message.");
      }
      setMessageBody("");
      const listRes = await fetch(`/api/am/messages/list?projectId=${activeProject.id}`, {
        credentials: "include",
        cache: "no-store",
      });
      const listPayload = await listRes.json();
      setMessages(listPayload.messages || []);
    } catch (err: any) {
      console.error(err);
      setActionError(err?.message || "Unable to send message.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateChangeRequest = async () => {
    if (!activeProject || !crTitle.trim() || !crDescription.trim()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/am/change-requests/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId: activeProject.id,
          type: crType,
          title: crTitle.trim(),
          description: crDescription.trim(),
          priority: crPriority,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload?.error || "Unable to create change request.");
      }
      setCrTitle("");
      setCrDescription("");
      setCrOpen(false);
      const listRes = await fetch(`/api/am/change-requests/list?projectId=${activeProject.id}`, {
        credentials: "include",
        cache: "no-store",
      });
      const listPayload = await listRes.json();
      setChangeRequests(listPayload.changeRequests || []);
    } catch (err: any) {
      console.error(err);
      setActionError(err?.message || "Unable to create change request.");
    } finally {
      setActionLoading(false);
    }
  };

  if (!open || !activeProject) return null;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-panel drawer-panel--lg" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="drawer-title">{activeProject.projectName}</div>
            <div className="drawer-subtitle">{activeProject.clientName}</div>
          </div>
          <button className="btn ghost" onClick={onClose} style={{ height: 34, borderRadius: 999, fontWeight: 400 }}>
            Close
          </button>
        </div>

        {actionError && (
          <div className="card" style={{ marginTop: 16, padding: 12, borderRadius: 12, borderColor: "var(--danger)" }}>
            <span style={{ color: "var(--danger)", fontSize: 13 }}>{actionError}</span>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2" style={{ marginTop: 18 }}>
          <div style={cardStyle}>
            <div style={headerStyle}>Project Summary</div>
            <div style={{ marginTop: 12, display: "grid", gap: 8, fontSize: 13 }}>
              <div>
                <strong>Stage:</strong> {activeProject.stage}
              </div>
              <div>
                <strong>Priority:</strong> {activeProject.priority || "Normal"}
              </div>
              <div>
                <strong>Health:</strong> {activeProject.health || "On Track"}
              </div>
              <div>
                <strong>Due Date:</strong> {fmtDate(activeProject.dueDate)}
              </div>
              <div>
                <strong>Assigned AM:</strong> {activeProject.ownerAmName || "Unassigned"}
              </div>
              <div>
                <strong>Assigned Production:</strong> {activeProject.productionName || "Unassigned"}
              </div>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={headerStyle}>Stage & Delivery Controls</div>
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                AM can request stage moves. Kickoff → Draft can be moved directly.
              </div>
              <MasterSelect
                value={selectedStage}
                onChange={(value) => setSelectedStage(value)}
                options={[{ value: "", label: "Request stage move" }, ...stageOptions]}
              />
              <textarea
                className="input"
                placeholder="Add a note for production"
                value={stageNote}
                onChange={(event) => setStageNote(event.target.value)}
                rows={2}
              />
              <div className="flex flex-wrap gap-2">
                <button className="btn ghost" onClick={handleRequestStageMove} disabled={!selectedStage || actionLoading}>
                  Request stage move
                </button>
                {canDirectMove && (
                  <button className="btn" onClick={handleDirectMove} disabled={actionLoading}>
                    Move to Draft
                  </button>
                )}
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Stage History</div>
              <div style={{ maxHeight: 160, overflowY: "auto", display: "grid", gap: 8 }}>
                {(activeProject.stageHistory || []).length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No stage history yet.</div>
                )}
                {(activeProject.stageHistory || []).map((entry, idx) => (
                  <div key={`${entry.at || idx}`} style={{ fontSize: 12 }}>
                    <strong>{entry.from || "—"}</strong> → <strong>{entry.to || "—"}</strong>
                    <div style={{ color: "var(--text-muted)" }}>
                      {entry.byName || "Unknown"} · {fmtDateTime(entry.at)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2" style={{ marginTop: 18 }}>
          <div style={cardStyle}>
            <div style={headerStyle}>Client Comms</div>
            <div
              style={{
                marginTop: 12,
                height: 260,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                paddingRight: 6,
              }}
            >
              {messages.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No messages yet.</div>
              )}
              {messages.map((message) => {
                const isMe = normalizeRole(message.senderRole) === "am";
                return (
                  <div
                    key={message.id}
                    style={{
                      alignSelf: isMe ? "flex-end" : "flex-start",
                      maxWidth: "80%",
                      background: isMe ? "rgba(37,99,235,0.18)" : "rgba(148,163,184,0.18)",
                      color: isDark ? "rgba(248,250,252,0.95)" : "rgba(15,23,42,0.9)",
                      borderRadius: 18,
                      padding: "10px 14px",
                      fontSize: 13,
                      lineHeight: 1.4,
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 11, opacity: 0.7 }}>
                      {message.senderName || message.senderRole}
                    </div>
                    {message.body}
                    <div style={{ fontSize: 10, opacity: 0.6, marginTop: 6 }}>{fmtDateTime(message.createdAt)}</div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <input
                className="input"
                placeholder="Type a message..."
                value={messageBody}
                onChange={(event) => setMessageBody(event.target.value)}
              />
              <button className="btn" onClick={handleSendMessage} disabled={actionLoading || !messageBody.trim()}>
                Send
              </button>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={headerStyle}>Files</div>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
            <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
              {groupedFiles.map((group) => (
                <div key={group.category} className="card" style={{ padding: 12, borderRadius: 12 }}>
                  <div className="flex items-center justify-between">
                    <div style={{ fontWeight: 600 }}>{group.category}</div>
                    <button
                      className="btn ghost"
                      onClick={() => handleUploadClick(group.category)}
                      disabled={actionLoading}
                    >
                      Upload
                    </button>
                  </div>
                  <div style={{ marginTop: 8, display: "grid", gap: 6, fontSize: 12 }}>
                    {group.items.length === 0 && <div style={{ color: "var(--text-muted)" }}>No files yet.</div>}
                    {group.items.map((file) => (
                      <a
                        key={file.id}
                        href={file.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "var(--erp-blue)", textDecoration: "none" }}
                      >
                        {file.fileName}
                        <div style={{ fontSize: 11, opacity: 0.7 }}>
                          {file.uploadedByName || "Unknown"} · {fmtDateTime(file.uploadedAt)}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle, marginTop: 18 }}>
          <div className="flex items-center justify-between">
            <div style={headerStyle}>Change Requests</div>
            <button className="btn ghost" onClick={() => setCrOpen((prev) => !prev)}>
              {crOpen ? "Close" : "Create CR"}
            </button>
          </div>
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            {changeRequests.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No CRs yet.</div>}
            {changeRequests.map((item) => (
              <div key={item.id} className="card" style={{ padding: 12, borderRadius: 12 }}>
                <div style={{ fontWeight: 600 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {item.status} · {fmtDateTime(item.createdAt)}
                </div>
              </div>
            ))}
          </div>
          {crOpen && (
            <div style={{ marginTop: 16 }} className="card">
              <div style={{ display: "grid", gap: 10 }}>
                <MasterSelect
                  value={crType}
                  onChange={(value) => setCrType(value)}
                  options={CHANGE_REQUEST_TYPES.map((value) => ({ value, label: value }))}
                />
                <MasterSelect
                  value={crPriority}
                  onChange={(value) => setCrPriority(value)}
                  options={CHANGE_REQUEST_PRIORITIES.map((value) => ({ value, label: value }))}
                />
                <input
                  className="input"
                  placeholder="Change request title"
                  value={crTitle}
                  onChange={(event) => setCrTitle(event.target.value)}
                />
                <textarea
                  className="input"
                  placeholder="Describe the change request"
                  value={crDescription}
                  onChange={(event) => setCrDescription(event.target.value)}
                  rows={4}
                />
                <button className="btn" onClick={handleCreateChangeRequest} disabled={actionLoading}>
                  Submit change request
                </button>
              </div>
            </div>
          )}
        </div>

        {loadingPanel && (
          <div className="card" style={{ marginTop: 16, padding: 12 }}>
            Loading project details...
          </div>
        )}
      </div>
    </div>
  );
}
