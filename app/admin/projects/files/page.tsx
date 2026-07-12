'use client';

import MasterSelect from '@/components/ui/MasterSelect';
import { getFirebaseStorage } from '@/lib/firebaseClient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { getCurrentTenantId, tenantProjectFilePath } from '@/lib/storage/paths';
import { apiFetch } from '@/lib/api/client';
import { SmartSearchBar } from '@/components/search/SmartSearchBar';

type FileCategory = 'Draft' | 'Revision' | 'Final' | 'Asset' | 'Other';

type FileRecord = {
  id: string;
  projectId: string;
  projectName: string;
  clientId?: string;
  clientName?: string;
  category: FileCategory | string;
  fileName: string;
  storagePath: string;
  downloadUrl: string;
  size: number;
  mimeType: string;
  uploadedByUid: string;
  uploadedByName: string;
  uploadedByRole: string;
  version?: string | number | null;
  notes?: string | null;
  isLatest?: boolean;
  uploadedAt?: string | null;
  updatedAt?: string | null;
};

type ProjectOption = {
  id: string;
  projectName: string;
  clientName?: string;
};

type CurrentUser = {
  uid: string;
  role: string;
  name?: string;
};

type ErrorState = {
  title: string;
  message: string;
};

type Totals = {
  total: number;
  Draft: number;
  Revision: number;
  Final: number;
  Asset: number;
  Other: number;
  storage: number;
};

type SortKey = 'fileName' | 'projectName' | 'category' | 'version' | 'uploadedBy' | 'uploadedAt';

type SortDir = 'asc' | 'desc';

const FILE_CATEGORIES: FileCategory[] = ['Draft', 'Revision', 'Final', 'Asset', 'Other'];

function fmtDate(iso?: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatBytes(value: number) {
  if (!value) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9_.-]+/g, '_');
}

function makeFileId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `file_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function canUpload(role?: string) {
  const r = (role || '').toLowerCase();
  return ['admin', 'super_admin', 'sales_manager', 'am', 'production'].includes(r);
}

function canDelete(role?: string) {
  const r = (role || '').toLowerCase();
  return r === 'admin' || r === 'super_admin';
}

function getBadgeClass(value: string): string {
  const t = (value || '').toLowerCase();
  if (
    t.includes('high') ||
    t.includes('critical') ||
    t.includes('overdue') ||
    t.includes('rejected') ||
    t.includes('failed') ||
    t.includes('cancelled') ||
    t.includes('canceled')
  )
    return 'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-red-500/10 text-red-500';
  if (
    t.includes('medium') ||
    t.includes('pending') ||
    t.includes('review') ||
    t.includes('draft') ||
    t.includes('waiting')
  )
    return 'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-amber-500/10 text-amber-600';
  if (
    t.includes('low') ||
    t.includes('completed') ||
    t.includes('approved') ||
    t.includes('active') ||
    t.includes('done')
  )
    return 'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-green-500/10 text-green-600';
  if (
    t.includes('progress') ||
    t.includes('open') ||
    t.includes('new') ||
    t.includes('design') ||
    t.includes('dev')
  )
    return 'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-[var(--erp-blue-soft)] text-[var(--erp-blue)]';
  return 'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-[var(--surface-muted)] text-[var(--text-muted)]';
}

function AlertCard({ error }: { error: ErrorState }) {
  return (
    <div
      className="card"
      style={{
        borderRadius: 14,
        padding: '14px 16px',
        border: '1px solid rgba(239,68,68,0.35)',
        background: 'rgba(239,68,68,0.08)',
        color: '#991b1b',
        marginTop: 16,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{error.title}</div>
      <div style={{ fontSize: 13 }}>{error.message}</div>
    </div>
  );
}

export default function GlobalFilesPage() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [totals, setTotals] = useState<Totals>({
    total: 0,
    Draft: 0,
    Revision: 0,
    Final: 0,
    Asset: 0,
    Other: 0,
    storage: 0,
  });
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [uploaderFilter, setUploaderFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('uploadedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProjectId, setUploadProjectId] = useState('');
  const [uploadCategory, setUploadCategory] = useState<FileCategory>('Draft');
  const [uploadVersion, setUploadVersion] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const uploaderOptions = useMemo(() => {
    const map = new Map<string, string>();
    files.forEach((file) => {
      if (file.uploadedByUid) {
        map.set(file.uploadedByUid, file.uploadedByName || file.uploadedByUid);
      }
    });
    return Array.from(map.entries()).map(([uid, name]) => ({ uid, name }));
  }, [files]);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (projectFilter) params.set('projectId', projectFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (uploaderFilter) params.set('uploadedBy', uploaderFilter);
      if (startDate) params.set('start', startDate);
      if (endDate) params.set('end', endDate);

      const res = await apiFetch(`/api/admin/files/list?${params.toString()}`, {
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Unable to load files.');
      }

      setFiles(payload.files || []);
      setTotals(
        payload.totals || {
          total: 0,
          Draft: 0,
          Revision: 0,
          Final: 0,
          Asset: 0,
          Other: 0,
          storage: 0,
        },
      );
      setCurrentUser(payload.currentUser || null);
    } catch (err: any) {
      setError({ title: 'Something went wrong', message: err?.message || 'Unable to load files.' });
    } finally {
      setLoading(false);
    }
  }, [query, projectFilter, categoryFilter, uploaderFilter, startDate, endDate]);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/projects/pipeline', { cache: 'no-store' });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) {
        return;
      }
      const options = (payload.projects || []).map((project: any) => ({
        id: project.id,
        projectName: project.projectName || 'Untitled',
        clientName: project.clientName || '',
      }));
      setProjects(options);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const sortedFiles = useMemo(() => {
    const items = [...files];
    items.sort((a, b) => {
      let left: string | number = '';
      let right: string | number = '';

      switch (sortKey) {
        case 'fileName':
          left = a.fileName.toLowerCase();
          right = b.fileName.toLowerCase();
          break;
        case 'projectName':
          left = a.projectName.toLowerCase();
          right = b.projectName.toLowerCase();
          break;
        case 'category':
          left = a.category.toString();
          right = b.category.toString();
          break;
        case 'version':
          left = a.version ? a.version.toString() : '';
          right = b.version ? b.version.toString() : '';
          break;
        case 'uploadedBy':
          left = a.uploadedByName.toLowerCase();
          right = b.uploadedByName.toLowerCase();
          break;
        case 'uploadedAt':
        default:
          left = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
          right = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
          break;
      }

      if (left < right) return sortDir === 'asc' ? -1 : 1;
      if (left > right) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return items;
  }, [files, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  }

  function resetUploadState() {
    setUploadProjectId('');
    setUploadCategory('Draft');
    setUploadVersion('');
    setUploadNotes('');
    setSelectedFile(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleUpload() {
    if (!selectedFile) {
      setUploadError('Please choose a file to upload.');
      return;
    }
    if (!uploadProjectId) {
      setUploadError('Select a project before uploading.');
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const storage = await getFirebaseStorage();
      const fileId = makeFileId();
      const safeName = sanitizeFileName(selectedFile.name);
      const tenantId = await getCurrentTenantId();
      const path = tenantProjectFilePath({
        tenantId,
        projectId: uploadProjectId,
        category: uploadCategory,
        fileId,
        safeName,
      });
      const storageRef = ref(storage, path);

      await uploadBytes(storageRef, selectedFile);
      const downloadUrl = await getDownloadURL(storageRef);

      const res = await apiFetch('/api/admin/files/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: fileId,
          projectId: uploadProjectId,
          category: uploadCategory,
          fileName: selectedFile.name,
          storagePath: path,
          downloadUrl,
          size: selectedFile.size,
          mimeType: selectedFile.type,
          version: uploadVersion || null,
          notes: uploadNotes || null,
        }),
        cache: 'no-store',
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Upload failed.');
      }

      setUploadOpen(false);
      resetUploadState();
      await fetchFiles();
    } catch (err: any) {
      setUploadError(err?.message || 'Unable to upload right now.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(file: FileRecord) {
    if (!canDelete(currentUser?.role)) return;
    setDeletingId(file.id);
    try {
      const res = await apiFetch('/api/admin/files/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: file.id }),
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Unable to delete file.');
      }
      await fetchFiles();
    } catch (err: any) {
      setError({ title: 'Delete failed', message: err?.message || 'Unable to delete file.' });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div style={{ width: '100%' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Global Files</h1>
          <div className="page-subtitle">
            Centralized source of truth for every draft, revision, and final delivery asset.
          </div>
        </div>

        {canUpload(currentUser?.role) && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              resetUploadState();
              setUploadOpen(true);
            }}
            style={{ borderRadius: 999, padding: '10px 20px', fontWeight: 500 }}
          >
            + Upload File
          </button>
        )}
      </div>

      <div className="kpis" style={{ marginTop: 20 }}>
        {[
          { label: 'Total Files', value: totals.total },
          { label: 'Drafts', value: totals.Draft },
          { label: 'Revisions', value: totals.Revision },
          { label: 'Finals', value: totals.Final },
          { label: 'Storage Used', value: formatBytes(totals.storage) },
        ].map((card) => (
          <div key={card.label} className="card kpi-card" style={{ padding: '16px 18px' }}>
            <div
              style={{
                fontSize: 12,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                opacity: 0.65,
              }}
            >
              {card.label}
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{card.value}</div>
          </div>
        ))}
      </div>

      {error && <AlertCard error={error} />}

      <div className="card filter-bar filter-bar--search" style={{ marginTop: 20, padding: 14 }}>
        <SmartSearchBar
          value={query}
          onChange={setQuery}
          onSubmit={fetchFiles}
          placeholder="Search keyword"
        />
        <MasterSelect
          className="input"
          value={projectFilter}
          onChange={setProjectFilter}
          placeholder="All Projects"
          options={[
            { label: 'All Projects', value: '' },
            ...projects.map((project) => ({ label: project.projectName, value: project.id })),
          ]}
        />
        <MasterSelect
          className="input"
          value={categoryFilter}
          onChange={setCategoryFilter}
          placeholder="All Categories"
          options={[
            { label: 'All Categories', value: '' },
            ...FILE_CATEGORIES.map((category) => ({ label: category, value: category })),
          ]}
        />
        <MasterSelect
          className="input"
          value={uploaderFilter}
          onChange={setUploaderFilter}
          placeholder="Uploaded By"
          options={[
            { label: 'Uploaded By', value: '' },
            ...uploaderOptions.map((option) => ({ label: option.name, value: option.uid })),
          ]}
        />
        <input
          className="input"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <input
          className="input"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
        <button
          type="button"
          className="btn"
          onClick={() => {
            setQuery('');
            setProjectFilter('');
            setCategoryFilter('');
            setUploaderFilter('');
            setStartDate('');
            setEndDate('');
          }}
          style={{ borderRadius: 999, padding: '10px 16px', fontWeight: 500 }}
        >
          Reset Filters
        </button>
      </div>

      <div className="table-shell">
        <div style={{ marginTop: 20 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>
                    <button
                      type="button"
                      onClick={() => toggleSort('fileName')}
                      className="table-sort"
                    >
                      File Name {sortKey === 'fileName' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </button>
                  </th>
                  <th style={{ textAlign: 'left' }}>
                    <button
                      type="button"
                      onClick={() => toggleSort('projectName')}
                      className="table-sort"
                    >
                      Project {sortKey === 'projectName' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </button>
                  </th>
                  <th style={{ textAlign: 'left' }}>
                    <button
                      type="button"
                      onClick={() => toggleSort('category')}
                      className="table-sort"
                    >
                      Category {sortKey === 'category' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </button>
                  </th>
                  <th style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => toggleSort('version')}
                      className="table-sort"
                    >
                      Version {sortKey === 'version' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </button>
                  </th>
                  <th style={{ textAlign: 'left' }}>
                    <button
                      type="button"
                      onClick={() => toggleSort('uploadedBy')}
                      className="table-sort"
                    >
                      Uploaded By {sortKey === 'uploadedBy' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </button>
                  </th>
                  <th style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => toggleSort('uploadedAt')}
                      className="table-sort"
                    >
                      Uploaded At {sortKey === 'uploadedAt' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </button>
                  </th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>
                      Loading files...
                    </td>
                  </tr>
                ) : sortedFiles.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>
                      No files found. Upload a file to get started.
                    </td>
                  </tr>
                ) : (
                  sortedFiles.map((file) => (
                    <tr key={file.id}>
                      <td style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 600 }}>{file.fileName}</div>
                        <div style={{ fontSize: 12, opacity: 0.65 }}>{formatBytes(file.size)}</div>
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 600 }}>{file.projectName}</div>
                        <div style={{ fontSize: 12, opacity: 0.65 }}>{file.clientName || ''}</div>
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        <span className={getBadgeClass(file.category)}>{file.category}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>{file.version || '-'}</td>
                      <td style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 600 }}>{file.uploadedByName || '-'}</div>
                        <div style={{ fontSize: 12, opacity: 0.65 }}>
                          {file.uploadedByRole || ''}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>{fmtDate(file.uploadedAt)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div
                          style={{
                            display: 'flex',
                            gap: 8,
                            justifyContent: 'center',
                            flexWrap: 'wrap',
                          }}
                        >
                          <a
                            className="btn"
                            href={file.downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12 }}
                          >
                            Download
                          </a>
                          {canDelete(currentUser?.role) && (
                            <button
                              type="button"
                              className="btn"
                              onClick={() => handleDelete(file)}
                              disabled={deletingId === file.id}
                              style={{
                                padding: '6px 12px',
                                borderRadius: 999,
                                fontSize: 12,
                                background: 'rgba(239,68,68,0.12)',
                                color: '#b91c1c',
                              }}
                            >
                              {deletingId === file.id ? 'Deleting...' : 'Delete'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {uploadOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: 16,
          }}
        >
          <div
            className="card"
            style={{
              width: 'min(680px, 100%)',
              borderRadius: 20,
              padding: 24,
              background: 'var(--surface-card)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
                  Upload Global File
                </h2>
                <div style={{ fontSize: 13, opacity: 0.7 }}>
                  Files sync automatically across all projects.
                </div>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setUploadOpen(false);
                  resetUploadState();
                }}
                style={{ borderRadius: 999, padding: '6px 12px', fontSize: 12 }}
              >
                Close
              </button>
            </div>

            {uploadError && (
              <div
                style={{
                  border: '1px solid rgba(239,68,68,0.35)',
                  background: 'rgba(239,68,68,0.08)',
                  color: '#b91c1c',
                  borderRadius: 12,
                  padding: '10px 12px',
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                {uploadError}
              </div>
            )}

            <div style={{ display: 'grid', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.75 }}>Project</span>
                <MasterSelect
                  className="input"
                  value={uploadProjectId}
                  onChange={setUploadProjectId}
                  placeholder="Select project"
                  buttonStyle={{ height: 38, borderRadius: 10 }}
                  options={[
                    { label: 'Select project', value: '' },
                    ...projects.map((project) => ({
                      label: project.projectName,
                      value: project.id,
                    })),
                  ]}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.75 }}>Category</span>
                <MasterSelect
                  className="input"
                  value={uploadCategory}
                  onChange={(next) => setUploadCategory(next as FileCategory)}
                  buttonStyle={{ height: 38, borderRadius: 10 }}
                  options={FILE_CATEGORIES.map((category) => ({
                    label: category,
                    value: category,
                  }))}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.75 }}>File</span>
                <input
                  ref={fileInputRef}
                  className="input"
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
              </label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: 12,
                }}
              >
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.75 }}>
                    Version (optional)
                  </span>
                  <input
                    className="input"
                    value={uploadVersion}
                    onChange={(e) => setUploadVersion(e.target.value)}
                    placeholder="v1, v2..."
                  />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.75 }}>
                    Notes (optional)
                  </span>
                  <input
                    className="input"
                    value={uploadNotes}
                    onChange={(e) => setUploadNotes(e.target.value)}
                    placeholder="Optional context"
                  />
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setUploadOpen(false);
                  resetUploadState();
                }}
                style={{ borderRadius: 999, padding: '10px 16px' }}
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                onClick={handleUpload}
                style={{ borderRadius: 999, padding: '10px 16px' }}
                disabled={uploading}
              >
                {uploading ? 'Uploading...' : 'Upload File'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
