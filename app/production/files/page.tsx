'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Upload } from 'lucide-react';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { getCurrentTenantId, tenantProjectFilePath } from '@/lib/storage/paths';
import { getFirebaseStorage } from '@/lib/firebaseClient';
import { apiFetch } from '@/lib/api/client';

/**
 * S21: real project files.
 *
 * This page rendered a hardcoded file list — invented project names, invented filenames and
 * three invented uploaders — and its "Upload File" button had no click handler at all. It was
 * a dead control sitting above fabricated records: a production user could select a file,
 * press Upload, and nothing whatsoever happened.
 *
 * Files always belong to a project, and the server only lets a production user see or touch a
 * project assigned to them. So the page now starts from the user's real assigned projects
 * (/api/production/queue), lists that project's real files, and uploads through the same
 * tenant-scoped storage path helper every other upload surface uses.
 */
const CATEGORIES = ['Draft', 'Revision', 'Final', 'Asset', 'Other'] as const;
type Category = (typeof CATEGORIES)[number];

type Project = { id: string; projectName: string };

type ProjectFile = {
  id: string;
  category: string;
  fileName: string;
  downloadUrl: string;
  uploadedByName: string;
  uploadedAt: string | null;
  isLatest: boolean;
};

function buildSafeName(name: string) {
  return name.replace(/\s+/g, '_');
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

export default function ProductionFilesPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectId, setProjectId] = useState('');
  const [category, setCategory] = useState<Category>('Draft');

  const [files, setFiles] = useState<ProjectFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const res = await apiFetch('/api/production/queue', { cache: 'no-store' });
      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean;
        projects?: Project[];
        error?: string;
      } | null;

      if (!res.ok || !payload?.ok) {
        setError(payload?.error || `Could not load your projects (${res.status})`);
        setProjects([]);
        return;
      }

      const list = payload.projects ?? [];
      setProjects(list);
      setProjectId((current) => current || list[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your projects');
      setProjects([]);
    }
  }, []);

  const loadFiles = useCallback(async () => {
    if (!projectId) {
      setFiles([]);
      return;
    }
    setError(null);
    try {
      const res = await apiFetch(
        `/api/production/files/list?projectId=${encodeURIComponent(projectId)}`,
        { cache: 'no-store' },
      );
      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean;
        files?: ProjectFile[];
        error?: string;
      } | null;

      if (!res.ok || !payload?.ok) {
        setError(payload?.error || `Could not load files (${res.status})`);
        setFiles([]);
        return;
      }
      setFiles(payload.files ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load files');
      setFiles([]);
    }
  }, [projectId]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file || !projectId) return;

    setUploading(true);
    setError(null);

    try {
      const storage = await getFirebaseStorage();
      const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const tenantId = await getCurrentTenantId();

      const storagePath = tenantProjectFilePath({
        tenantId,
        projectId,
        category,
        fileId,
        safeName: buildSafeName(file.name),
      });

      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);

      const res = await apiFetch('/api/production/files/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: fileId,
          projectId,
          category,
          fileName: file.name,
          storagePath,
          downloadUrl,
          size: file.size,
          mimeType: file.type,
        }),
      });

      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!res.ok || !payload?.ok) {
        // The object may have reached storage, but the record did not. Say so.
        setError(payload?.error || 'The file did not finish uploading.');
        return;
      }

      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The file did not finish uploading.');
    } finally {
      setUploading(false);
    }
  }

  const visible = (files ?? []).filter((file) => file.category === category);

  return (
    <div className="space-y-6">
      <h1 className="page-title">Files</h1>

      {error && (
        <p className="rounded-xl border border-[var(--danger,#dc2626)] p-4 text-sm font-semibold text-[var(--danger,#dc2626)]">
          {error}
        </p>
      )}

      {projects !== null && projects.length === 0 && !error && (
        <div className="table-shell">
          <p className="helper-text px-4 py-6">
            No projects are assigned to you yet. Files appear here once you are assigned to a
            project.
          </p>
        </div>
      )}

      {projects !== null && projects.length > 0 && (
        <>
          <div className="card space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-primary)]">
                Project
              </label>
              <select
                className="input w-full"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.projectName || project.id}
                  </option>
                ))}
              </select>
            </div>

            <div className="tabs-bar">
              {CATEGORIES.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setCategory(tab)}
                  className={`tab-pill ${category === tab ? 'active' : ''}`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center space-x-3">
              <Upload className="h-6 w-6 text-[var(--text-muted)]" />
              <div>
                <p className="font-semibold text-[var(--text-primary)]">Upload File</p>
                <p className="text-sm text-[var(--text-muted)]">
                  The file is added to the selected project as a <strong>{category}</strong>.
                </p>
              </div>
            </div>
            <div className="mt-4">
              <input ref={fileInputRef} type="file" className="input" disabled={uploading} />
            </div>
            <button
              type="button"
              onClick={() => void handleUpload()}
              disabled={uploading || !projectId}
              className="btn mt-4"
            >
              {uploading ? 'Uploading…' : 'Upload File'}
            </button>
          </div>

          <div className="table-shell">
            <div className="grid grid-cols-4 bg-[var(--table-header-bg)] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              <div>File</div>
              <div>Category</div>
              <div>Uploaded By</div>
              <div>Date</div>
            </div>

            {files === null && <p className="helper-text px-4 py-6">Loading files…</p>}

            {files !== null && visible.length === 0 && (
              <p className="helper-text px-4 py-6">No {category} files on this project yet.</p>
            )}

            {visible.map((file) => (
              <div
                key={file.id}
                className="grid grid-cols-4 items-center border-t border-[var(--border-subtle)] px-4 py-4 text-sm transition hover:bg-[var(--table-row-hover)]"
              >
                <a
                  href={file.downloadUrl || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-2 text-[var(--erp-blue)]"
                >
                  <FileText className="h-4 w-4" />
                  <span>{file.fileName || '—'}</span>
                </a>
                <div className="text-[var(--text-primary)]">{file.category}</div>
                <div className="text-[var(--text-muted)]">{file.uploadedByName || '—'}</div>
                <div className="text-[var(--text-primary)]">{fmtDate(file.uploadedAt)}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
