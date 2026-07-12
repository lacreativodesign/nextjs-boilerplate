'use client';

import { useEffect, useMemo, useState } from 'react';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { getCurrentTenantId, tenantEmployeeDocumentPath } from '@/lib/storage/paths';
import { getFirebaseStorage } from '@/lib/firebaseClient';
import MasterSelect from '@/components/ui/MasterSelect';
import { formatDate } from '@/components/finance/financeUtils';
import { apiFetch } from '@/lib/api/client';
import { showToast } from '@/lib/utils/toast';
import { SmartSearchBar } from '@/components/search/SmartSearchBar';
import { smartMatch } from '@/lib/search/smartMatch';

const DOC_TYPES = [
  { label: 'Contract', value: 'Contract' },
  { label: 'Offer Letter', value: 'OfferLetter' },
  { label: 'ID', value: 'ID' },
  { label: 'Certificate', value: 'Certificate' },
  { label: 'Other', value: 'Other' },
];

type UserRecord = {
  uid: string;
  name?: string;
  role?: string;
};

type DocumentRecord = {
  id: string;
  userId: string;
  docType: string;
  fileName: string;
  downloadUrl: string;
  createdAt?: string | null;
  isDeleted?: boolean;
};

type SortKey = 'employee' | 'docType' | 'file' | 'uploaded';

type SortDir = 'asc' | 'desc';

const sortIndicator = (active: boolean, dir: SortDir) => (
  <span
    style={{ width: 18, display: 'inline-block', textAlign: 'center', opacity: active ? 1 : 0.35 }}
  >
    {active ? (dir === 'asc' ? '↑' : '↓') : '•'}
  </span>
);

export default function HrDocumentsPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedDocType, setSelectedDocType] = useState('Contract');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [filterUser, setFilterUser] = useState('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('uploaded');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        setLoading(true);
        const [usersRes, docsRes] = await Promise.all([
          apiFetch('/api/hr/employees/list', { cache: 'no-store' }),
          apiFetch('/api/hr/documents/list', { cache: 'no-store' }),
        ]);
        const usersJson = await usersRes.json();
        const docsJson = await docsRes.json();
        if (!usersRes.ok || !usersJson.ok)
          throw new Error(usersJson?.error || 'Unable to load users.');
        if (!docsRes.ok || !docsJson.ok)
          throw new Error(docsJson?.error || 'Unable to load documents.');
        if (!alive) return;
        setUsers(usersJson.users || []);
        setCurrentUserRole(usersJson.currentUser?.role || null);
        setDocuments(docsJson.documents || []);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || 'Unable to load documents.');
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

  const userOptions = useMemo(
    () => [
      { label: 'Select employee', value: '' },
      ...users.map((u) => ({ label: u.name || 'Employee', value: u.uid })),
    ],
    [users],
  );

  const filterOptions = useMemo(
    () => [
      { label: 'All Employees', value: 'all' },
      ...users.map((u) => ({ label: u.name || 'Employee', value: u.uid })),
    ],
    [users],
  );

  const filteredDocuments = useMemo(() => {
    const byFilters = documents.filter((doc) => {
      if (doc.isDeleted) return false;
      if (filterUser !== 'all' && doc.userId !== filterUser) return false;
      return true;
    });
    return smartMatch(byFilters, search, (doc) => [doc.docType, doc.fileName]);
  }, [documents, filterUser, search]);

  const sortedDocuments = useMemo(() => {
    const list = [...filteredDocuments].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const aVal = getSortValue(a, sortKey, users);
      const bVal = getSortValue(b, sortKey, users);
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      return 0;
    });
    return list;
  }, [filteredDocuments, sortDir, sortKey, users]);

  async function uploadDocument() {
    if (!selectedUserId || !selectedDocType || !selectedFile) {
      showToast.error('Select an employee, document type, and file.');
      return;
    }

    try {
      setUploading(true);
      const storage = await getFirebaseStorage();
      const docId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}`;
      const safeName = selectedFile.name.replace(/\s+/g, '_');
      const tenantId = await getCurrentTenantId();
      const storagePath = tenantEmployeeDocumentPath({
        tenantId,
        userId: selectedUserId,
        docId,
        safeName,
      });
      const fileRef = ref(storage, storagePath);

      await uploadBytes(fileRef, selectedFile);
      const downloadUrl = await getDownloadURL(fileRef);

      const res = await apiFetch('/api/hr/documents/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: docId,
          userId: selectedUserId,
          docType: selectedDocType,
          fileName: selectedFile.name,
          storagePath,
          downloadUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || 'Unable to store document metadata.');

      const refresh = await apiFetch('/api/hr/documents/list', { cache: 'no-store' });
      const refreshData = await refresh.json();
      setDocuments(refreshData.documents || []);
      setSelectedFile(null);
      setSelectedUserId('');
      setSelectedDocType('Contract');
    } catch (err: any) {
      showToast.error(err?.message || 'Unable to upload document.');
    } finally {
      setUploading(false);
    }
  }

  async function deleteDocument(doc: DocumentRecord) {
    if (!window.confirm('Delete this document?')) return;
    try {
      const res = await apiFetch('/api/hr/documents/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId: doc.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || 'Unable to delete document.');
      setDocuments((prev) => prev.map((d) => (d.id === doc.id ? { ...d, isDeleted: true } : d)));
    } catch (err: any) {
      showToast.error(err?.message || 'Unable to delete document.');
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  }

  const canDelete =
    currentUserRole === 'admin' || currentUserRole === 'super_admin' || currentUserRole === 'hr';

  return (
    <div className="page-frame space-y-6">
      <section className="card" style={{ padding: 18, borderRadius: 18 }}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Employee Documents</div>
            <div style={{ fontSize: 14, color: 'var(--sidebar-text)' }}>
              Store HR documents securely in Firebase Storage.
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <div>
            <label className="text-xs font-semibold text-slate-500">Employee</label>
            <MasterSelect
              value={selectedUserId}
              onChange={setSelectedUserId}
              options={userOptions}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Document type</label>
            <MasterSelect
              value={selectedDocType}
              onChange={setSelectedDocType}
              options={DOC_TYPES}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">File</label>
            <input
              className="input"
              type="file"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            />
          </div>
          <div className="flex items-end">
            <button className="btn" onClick={uploadDocument} disabled={uploading}>
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div
          className="card"
          style={{ padding: 16, borderRadius: 16, border: '1px solid rgba(248,113,113,0.35)' }}
        >
          {error}
        </div>
      )}

      <section className="card" style={{ padding: 0, borderRadius: 18, overflow: 'hidden' }}>
        <div className="p-4 filter-bar filter-bar--search">
          <SmartSearchBar value={search} onChange={setSearch} />
          <MasterSelect value={filterUser} onChange={setFilterUser} options={filterOptions} />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
            <thead>
              <tr style={{ background: 'var(--table-header-bg)' }}>
                <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 700 }}>
                  <button
                    type="button"
                    className="table-sort"
                    onClick={() => toggleSort('employee')}
                  >
                    Employee
                    {sortIndicator(sortKey === 'employee', sortDir)}
                  </button>
                </th>
                <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 700 }}>
                  <button
                    type="button"
                    className="table-sort"
                    onClick={() => toggleSort('docType')}
                  >
                    Doc Type
                    {sortIndicator(sortKey === 'docType', sortDir)}
                  </button>
                </th>
                <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 700 }}>
                  <button type="button" className="table-sort" onClick={() => toggleSort('file')}>
                    File
                    {sortIndicator(sortKey === 'file', sortDir)}
                  </button>
                </th>
                <th style={{ textAlign: 'right', padding: '12px 16px', fontWeight: 700 }}>
                  <button
                    type="button"
                    className="table-sort table-sort--right"
                    onClick={() => toggleSort('uploaded')}
                  >
                    Uploaded
                    {sortIndicator(sortKey === 'uploaded', sortDir)}
                  </button>
                </th>
                <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 700 }}>
                  Status
                </th>
                <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 700 }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 24 }}>
                    Loading documents…
                  </td>
                </tr>
              ) : sortedDocuments.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 24 }}>
                    No documents found.
                  </td>
                </tr>
              ) : (
                sortedDocuments.map((doc) => {
                  const user = users.find((u) => u.uid === doc.userId);
                  return (
                    <tr key={doc.id}>
                      <td style={{ textAlign: 'left', padding: '12px 16px' }}>
                        {user?.name || 'Employee'}
                      </td>
                      <td style={{ textAlign: 'left', padding: '12px 16px' }}>{doc.docType}</td>
                      <td style={{ textAlign: 'left', padding: '12px 16px' }}>{doc.fileName}</td>
                      <td style={{ textAlign: 'right', padding: '12px 16px' }}>
                        {formatDate(doc.createdAt)}
                      </td>
                      <td style={{ textAlign: 'center', padding: '12px 16px' }}>
                        {doc.isDeleted ? 'Deleted' : 'Active'}
                      </td>
                      <td style={{ textAlign: 'center', padding: '12px 16px' }}>
                        <div className="flex items-center justify-center gap-2">
                          <a
                            className="btn ghost"
                            href={doc.downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Download
                          </a>
                          {canDelete && (
                            <button className="btn ghost" onClick={() => deleteDocument(doc)}>
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function getSortValue(doc: DocumentRecord, key: SortKey, users: UserRecord[]) {
  const user = users.find((u) => u.uid === doc.userId);
  switch (key) {
    case 'employee':
      return String(user?.name || '').toLowerCase();
    case 'docType':
      return String(doc.docType || '').toLowerCase();
    case 'file':
      return String(doc.fileName || '').toLowerCase();
    case 'uploaded':
      return doc.createdAt ? new Date(doc.createdAt).getTime() : 0;
    default:
      return '';
  }
}
