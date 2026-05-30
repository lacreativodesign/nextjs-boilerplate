"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getFirebaseStorage } from "@/lib/firebaseClient";

type FileRecord = {
  id: string;
  projectId: string;
  projectName: string;
  category: string;
  fileName: string;
  downloadUrl: string;
  uploadedAt?: string | null;
  size?: number;
};

type ProjectOption = { value: string; label: string };


function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function fmtBytes(bytes = 0) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, index)).toFixed(1)} ${units[index]}`;
}

export default function ClientFilesPage() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [uploadProjectId, setUploadProjectId] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const loadFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/client/files/list", { credentials: "include", cache: "no-store" });
      const payload = await res.json();
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || "Unable to load files.");
      setFiles(payload.files || []);
    } catch (err) {
      setError((err instanceof Error ? err.message : undefined) || "Unable to load files.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFiles();
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
    return files.filter((file) => {
      if (!q) return true;
      const hay = [file.fileName, file.projectName, file.category].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [files, search]);

  const handleUpload = async () => {
    if (!uploadProjectId || !fileInputRef.current?.files?.[0]) return;
    const file = fileInputRef.current.files[0];
    setActionLoading(true);
    try {
      const storage = await getFirebaseStorage();
      const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const storagePath = `client-files/${uploadProjectId}/${fileId}_${file.name.replace(/\s+/g, "_")}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);

      const res = await fetch("/api/client/files/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId: uploadProjectId,
          fileName: file.name,
          storagePath,
          downloadUrl,
          size: file.size,
          mimeType: file.type,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) throw new Error(payload?.error || "Unable to upload file.");
      setUploadOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadFiles();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Files</h1>
        <p className="page-subtitle">Access approved deliverables and upload client assets.</p>
      </div>

      <div className="card p-4">
        <div className="page-header">
          <div>
            <div className="section-title">Files Library</div>
            <p className="section-subtitle">All files scoped to your client account.</p>
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={() => setUploadOpen(true)}>
              Upload Client File
            </button>
            <button className="btn ghost" onClick={loadFiles}>
              Refresh
            </button>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <input className="input" placeholder="Search keyword" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="table-shell">
        {loading ? (
          <div className="p-4 text-sm text-[var(--text-muted)]">Loading files...</div>
        ) : error ? (
          <div className="p-4 text-sm text-red-400">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-sm text-[var(--text-muted)]">No files found.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ minWidth: 860 }}>
              <thead>
                <tr>
                  <th style={headerCellStyle}>File Name</th>
                  <th style={headerCellStyle}>Project</th>
                  <th style={headerCellStyle}>Category</th>
                  <th style={{ ...headerCellStyle, textAlign: "right" }}>Size</th>
                  <th style={{ ...headerCellStyle, textAlign: "right" }}>Uploaded</th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((file) => {
                  return (
                    <tr key={file.id} >
                      <td style={{ ...cellStyle, whiteSpace: "normal" }}>{file.fileName}</td>
                      <td style={cellStyle}>{file.projectName || "-"}</td>
                      <td style={cellStyle}>{file.category}</td>
                      <td style={{ ...cellStyle, textAlign: "right" }}>{fmtBytes(file.size || 0)}</td>
                      <td style={{ ...cellStyle, textAlign: "right" }}>{fmtDate(file.uploadedAt)}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        <a className="btn ghost" href={file.downloadUrl || "#"} target="_blank" rel="noreferrer">
                          Download
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {uploadOpen && (
        <div className="drawer-overlay" onClick={() => setUploadOpen(false)}>
          <div className="drawer-panel drawer-panel--md" onClick={(event) => event.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>Upload Client File</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Share briefs, assets, or reference files with your team.</div>
              </div>
              <button className="btn ghost" onClick={() => setUploadOpen(false)} style={{ height: 34, borderRadius: 999 }}>
                Close
              </button>
            </div>

            <div style={{ height: 16 }} />

            <div className="card p-4">
              <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Project</div>
              <select className="input mt-2" value={uploadProjectId} onChange={(e) => setUploadProjectId(e.target.value)}>
                <option value="">Select project</option>
                {projectOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)] mt-4">File</div>
              <input className="input mt-2" type="file" ref={fileInputRef} />

              <div className="flex justify-end mt-4">
                <button className="btn" onClick={handleUpload} disabled={actionLoading || !uploadProjectId}>
                  {actionLoading ? "Uploading..." : "Upload"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
