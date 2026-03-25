"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import MasterSelect from "@/components/ui/MasterSelect";
import { getFirebaseStorage } from "@/lib/firebaseClient";

const FILE_CATEGORIES = ["Draft", "Revision", "Final", "Asset", "Other"] as const;

type FileRecord = {
  id: string;
  projectId: string;
  projectName: string;
  clientName: string;
  category: string;
  fileName: string;
  downloadUrl: string;
  uploadedByName?: string;
  uploadedAt?: string | null;
  size?: number;
  isLatest?: boolean;
};

type FilePayload = {
  ok: boolean;
  files: FileRecord[];
  totals?: Record<string, number>;
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

function buildSafeName(name: string) {
  return name.replace(/\s+/g, "_");
}

export default function AMFilesPage() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [uploadProjectId, setUploadProjectId] = useState("");
  const [uploadCategory, setUploadCategory] = useState(FILE_CATEGORIES[0]);
  const [actionLoading, setActionLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  async function loadFiles(mountedRef?: { current: boolean }) {
    const mounted = mountedRef ? mountedRef.current : true;
    if (!mounted) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (projectFilter !== "all") params.set("projectId", projectFilter);
      const res = await fetch(`/api/am/files/list?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await res.json()) as FilePayload;
      if (!res.ok || !payload.ok) {
        throw new Error(payload?.error || "Unable to load files.");
      }
      if (mountedRef ? mountedRef.current : true) {
        setFiles(payload.files || []);
        setTotals(payload.totals || {});
      }
    } catch (err: any) {
      console.error(err);
      if (mountedRef ? mountedRef.current : true) setError(err?.message || "Unable to load files.");
    } finally {
      if (mountedRef ? mountedRef.current : true) setLoading(false);
    }
  }

  useEffect(() => {
    const mountedRef = { current: true };
    void loadFiles(mountedRef);
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, projectFilter]);

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const res = await fetch("/api/am/projects/list", { credentials: "include", cache: "no-store" });
        const payload = (await res.json()) as { ok: boolean; projects: Array<{ id: string; projectName: string }> };
        if (!res.ok || !payload.ok) return;
        const options = (payload.projects || []).map((project) => ({
          value: project.id,
          label: project.projectName || project.id,
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
      if (categoryFilter !== "all" && file.category !== categoryFilter) return false;
      if (projectFilter !== "all" && file.projectId !== projectFilter) return false;
      if (q) {
        const hay = [file.fileName, file.projectName, file.clientName].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [files, search, categoryFilter, projectFilter]);

  const handleUpload = async () => {
    if (!uploadProjectId || !fileInputRef.current?.files?.[0]) return;
    const file = fileInputRef.current.files[0];
    setActionLoading(true);
    try {
      const storage = await getFirebaseStorage();
      const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const safeName = buildSafeName(file.name);
      const storagePath = `projects/${uploadProjectId}/${uploadCategory}/${fileId}_${safeName}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);

      const res = await fetch("/api/am/files/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: fileId,
          projectId: uploadProjectId,
          category: uploadCategory,
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
        <h1 className="page-title">Global Files</h1>
        <p className="page-subtitle">Upload and track the latest drafts, revisions, and finals for your projects.</p>
      </div>

      <div className="kpis">
        {[
          { label: "Total Files", value: totals.total || 0 },
          { label: "Drafts", value: totals.Draft || 0 },
          { label: "Revisions", value: totals.Revision || 0 },
          { label: "Final", value: totals.Final || 0 },
        ].map((item) => (
          <KpiCard key={item.label} label={item.label} value={item.value} />
        ))}
      </div>

      <div style={tableShellStyle}>
        <div className="flex flex-wrap items-center justify-between gap-3" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Files Library</div>
          <div className="flex gap-2">
            <button className="btn" onClick={() => setUploadOpen(true)}>
              Upload File
            </button>
            <button className="btn ghost" onClick={() => loadFiles()}>
              Refresh
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            className="input"
            placeholder="Search keyword"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <MasterSelect
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[{ value: "all", label: "All Categories" }, ...FILE_CATEGORIES.map((value) => ({ value, label: value }))]}
          />
          <MasterSelect
            value={projectFilter}
            onChange={setProjectFilter}
            options={[{ value: "all", label: "All Projects" }, ...projectOptions]}
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
                <th style={headerCellStyle}>Project</th>
                <th style={headerCellStyle}>Client</th>
                <th style={{ ...headerCellStyle, textAlign: "center" }}>Category</th>
                <th style={headerCellStyle}>File</th>
                <th style={{ ...headerCellStyle, textAlign: "center" }}>Size</th>
                <th style={{ ...headerCellStyle, textAlign: "center" }}>Uploaded</th>
                <th style={{ ...headerCellStyle, textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((file) => (
                <tr key={file.id}>
                  <td style={{ ...cellStyle, textAlign: "left" }}>{file.projectName}</td>
                  <td style={{ ...cellStyle, textAlign: "left" }}>{file.clientName}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>{file.category}</td>
                  <td style={{ ...cellStyle, textAlign: "left" }}>{file.fileName}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>{fmtBytes(file.size)}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>{fmtDate(file.uploadedAt)}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>
                    <a className="btn ghost" href={file.downloadUrl} target="_blank" rel="noreferrer">
                      View
                    </a>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ ...cellStyle, textAlign: "center", padding: "24px 16px" }}>
                    No files found.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={7} style={{ ...cellStyle, textAlign: "center", padding: "24px 16px" }}>
                    Loading files...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {uploadOpen && (
        <div className="drawer-overlay" onClick={() => setUploadOpen(false)}>
          <div className="drawer-panel drawer-panel--md" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-title">Upload File</div>
            <div className="drawer-subtitle">Add deliverables to your project library.</div>
            <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
              <MasterSelect
                value={uploadProjectId}
                onChange={setUploadProjectId}
                options={[{ value: "", label: "Select Project" }, ...projectOptions]}
              />
              <MasterSelect
                value={uploadCategory}
                onChange={setUploadCategory}
                options={FILE_CATEGORIES.map((value) => ({ value, label: value }))}
              />
              <input ref={fileInputRef} type="file" className="input" />
              <button className="btn" onClick={handleUpload} disabled={actionLoading}>
                Upload
              </button>
              <button className="btn ghost" onClick={() => setUploadOpen(false)}>
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
