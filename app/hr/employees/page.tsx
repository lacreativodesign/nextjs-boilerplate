'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import MasterSelect from '@/components/ui/MasterSelect';
import {
  INTERNAL_ROLE_OPTIONS,
  USER_DEPARTMENT_VALUES,
  type InternalRole,
  type UserDepartment,
} from '@/lib/userOptions';
import { apiFetch } from '@/lib/api/client';
import { showToast } from '@/lib/utils/toast';
import { SmartSearchBar } from '@/components/search/SmartSearchBar';
import { smartMatch } from '@/lib/search/smartMatch';
import EmptyState from '@/components/ui/EmptyState';

const STATUS_OPTIONS = [
  { label: 'All Status', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
];

const ROLE_OPTIONS = [
  { label: 'All Roles', value: 'all' },
  ...INTERNAL_ROLE_OPTIONS.map((role) => ({ label: formatRole(role), value: role })),
];

const DEPARTMENT_OPTIONS = [
  { label: 'All Departments', value: 'all' },
  ...USER_DEPARTMENT_VALUES.map((dept) => ({ label: formatRole(dept), value: dept })),
];

type UserRecord = {
  uid?: string;
  id?: string;
  docId?: string;
  userId?: string;
  firebaseUid?: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  department?: string;
  salary?: number | string;
  monthlyTarget?: number | string;
  commission?: number | string;
  status?: string;
  joiningDate?: string | null;
  designation?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
};

type SortKey = 'name' | 'email' | 'role' | 'department' | 'salary' | 'target' | 'status' | 'joined';

type CurrentUser = {
  uid: string;
  role: string;
  name?: string | null;
  email?: string | null;
};

const getRowId = (u: any) =>
  (u?.uid || u?.id || u?.docId || u?.userId || u?.firebaseUid || u?.email || '') as string;

function formatRole(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace('Am', 'AM');
}

function normalizeStatus(value?: string) {
  const raw = String(value || 'active').toLowerCase();
  if (raw === 'inactive' || raw === 'disabled') return 'inactive';
  return 'active';
}

function toInputDate(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function formatNumber(value: number | string | undefined | null) {
  if (value === null || value === undefined || value === '') return '-';
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return num.toLocaleString();
}

function formatPkr(value: number | string | undefined | null) {
  if (value === null || value === undefined || value === '') return '-';
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return `PKR ${num.toLocaleString()}`;
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
}

const sortIndicator = (active: boolean, dir: 'asc' | 'desc') => (
  <span
    style={{ width: 18, display: 'inline-block', textAlign: 'center', opacity: active ? 1 : 0.35 }}
  >
    {active ? (dir === 'asc' ? '↑' : '↓') : '•'}
  </span>
);

export default function HrEmployeesPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formState, setFormState] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'sales',
    department: 'sales',
    designation: '',
    joiningDate: '',
    salary: '',
    monthlyTarget: '',
    commission: '',
    status: 'active',
  });

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        setLoading(true);
        const res = await apiFetch('/api/hr/employees/list', {
          cache: 'no-store',
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data?.error || 'Failed to load employees.');
        if (!alive) return;
        setUsers(data.users || []);
        setCurrentUser(data.currentUser || null);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || 'Unable to load employees.');
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

  const selectedUser = useMemo(() => {
    if (!drawerOpen || !selectedId) return null;
    return users.find((u) => getRowId(u) === selectedId) || null;
  }, [drawerOpen, selectedId, users]);

  useEffect(() => {
    if (!selectedUser) return;
    setFormState({
      name: selectedUser.name || '',
      email: selectedUser.email || '',
      phone: selectedUser.phone || '',
      role: (selectedUser.role || 'sales') as InternalRole,
      department: (selectedUser.department || 'sales') as UserDepartment,
      designation: selectedUser.designation || '',
      joiningDate: toInputDate(selectedUser.joiningDate || ''),
      salary:
        selectedUser.salary !== undefined && selectedUser.salary !== null
          ? String(selectedUser.salary)
          : '',
      monthlyTarget:
        selectedUser.monthlyTarget !== undefined && selectedUser.monthlyTarget !== null
          ? String(selectedUser.monthlyTarget)
          : '',
      commission:
        selectedUser.commission !== undefined && selectedUser.commission !== null
          ? String(selectedUser.commission)
          : '',
      status: normalizeStatus(selectedUser.status),
    });
  }, [selectedUser]);

  const filtered = useMemo(() => {
    const byFilters = users.filter((user) => {
      const role = String(user.role || '').toLowerCase();
      const department = String(user.department || '').toLowerCase();
      const status = normalizeStatus(user.status);
      const matchesRole = roleFilter === 'all' ? true : role === roleFilter;
      const matchesDept = departmentFilter === 'all' ? true : department === departmentFilter;
      const matchesStatus = statusFilter === 'all' ? true : status === statusFilter;
      const joined = user.joiningDate ? new Date(user.joiningDate) : null;
      const matchesStart = dateStart && joined ? joined >= new Date(dateStart) : true;
      const matchesEnd = dateEnd && joined ? joined <= new Date(`${dateEnd}T23:59:59`) : true;
      return matchesRole && matchesDept && matchesStatus && matchesStart && matchesEnd;
    });
    return smartMatch(byFilters, search, (user) => [
      user.name,
      user.email,
      user.role,
      user.department,
    ]);
  }, [users, search, roleFilter, departmentFilter, statusFilter, dateStart, dateEnd]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const aVal = getSortValue(a, sortKey);
      const bVal = getSortValue(b, sortKey);
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      return 0;
    });
    return arr;
  }, [filtered, sortDir, sortKey]);

  const canEditSuperAdmin = currentUser?.role === 'super_admin';
  const isSelectedSuperAdmin = normalizeRole(selectedUser?.role) === 'super_admin';
  const canEditSelected = selectedUser ? !isSelectedSuperAdmin || canEditSuperAdmin : true;

  function openDrawer(id: string) {
    setSelectedId(id);
    setDrawerOpen(true);
    setEditMode(false);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSelectedId(null);
    setEditMode(false);
  }

  async function saveEmployee() {
    if (!selectedUser) return;
    try {
      setSaving(true);
      const res = await apiFetch('/api/hr/employees/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: selectedUser.uid,
          ...formState,
          joiningDate: formState.joiningDate
            ? new Date(`${formState.joiningDate}T00:00:00.000Z`).toISOString()
            : null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || 'Unable to update employee.');
      setUsers((prev) =>
        prev.map((u) => (getRowId(u) === getRowId(selectedUser) ? { ...u, ...data.user } : u)),
      );
      setEditMode(false);
    } catch (err: any) {
      showToast.error(err?.message || 'Unable to update employee.');
    } finally {
      setSaving(false);
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

  const roleOptions = useMemo(() => {
    if (currentUser?.role === 'super_admin') return ROLE_OPTIONS;
    return ROLE_OPTIONS.filter((opt) => opt.value !== 'super_admin');
  }, [currentUser?.role]);

  const cell: CSSProperties = {
    padding: '12px 16px',
    borderBottom: '1px dashed var(--border-subtle)',
    fontSize: 14,
    color: 'var(--text-primary)',
    textAlign: 'left',
  };

  const headerCell: CSSProperties = {
    padding: '12px 16px',
    fontSize: 11,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    fontWeight: 700,
    color: 'var(--text-muted)',
    borderBottom: '1px solid var(--border-subtle)',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Employees</h1>
        <p className="page-subtitle mt-2">
          Everyone on the team, with role, department, and status.
        </p>
      </div>

      <section className="card" style={{ padding: 18, borderRadius: 18 }}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div style={{ fontSize: 12, color: 'var(--sidebar-text)' }}>
            Click a row to view details.
          </div>
        </div>
        <div className="mt-4 filter-bar filter-bar--search">
          <SmartSearchBar value={search} onChange={setSearch} />
          <MasterSelect value={roleFilter} onChange={setRoleFilter} options={roleOptions} />
          <MasterSelect
            value={departmentFilter}
            onChange={setDepartmentFilter}
            options={DEPARTMENT_OPTIONS}
          />
          <MasterSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} />
          <input
            className="input"
            type="date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
          />
          <input
            className="input"
            type="date"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
          />
        </div>
      </section>

      <section className="card" style={{ padding: 0, borderRadius: 18, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1080 }}>
            <thead>
              <tr style={{ background: 'var(--table-header-bg)' }}>
                <th style={headerCell}>
                  <button type="button" className="table-sort" onClick={() => toggleSort('name')}>
                    Name
                    {sortIndicator(sortKey === 'name', sortDir)}
                  </button>
                </th>
                <th style={headerCell}>
                  <button type="button" className="table-sort" onClick={() => toggleSort('email')}>
                    Email
                    {sortIndicator(sortKey === 'email', sortDir)}
                  </button>
                </th>
                <th style={headerCell}>
                  <button type="button" className="table-sort" onClick={() => toggleSort('role')}>
                    Role
                    {sortIndicator(sortKey === 'role', sortDir)}
                  </button>
                </th>
                <th style={headerCell}>
                  <button
                    type="button"
                    className="table-sort"
                    onClick={() => toggleSort('department')}
                  >
                    Department
                    {sortIndicator(sortKey === 'department', sortDir)}
                  </button>
                </th>
                <th style={{ ...headerCell, textAlign: 'right' }}>
                  <button
                    type="button"
                    className="table-sort table-sort--right"
                    onClick={() => toggleSort('salary')}
                  >
                    Salary
                    {sortIndicator(sortKey === 'salary', sortDir)}
                  </button>
                </th>
                <th style={{ ...headerCell, textAlign: 'right' }}>
                  <button
                    type="button"
                    className="table-sort table-sort--right"
                    onClick={() => toggleSort('target')}
                  >
                    Target
                    {sortIndicator(sortKey === 'target', sortDir)}
                  </button>
                </th>
                <th style={{ ...headerCell, textAlign: 'center' }}>
                  <button
                    type="button"
                    className="table-sort table-sort--center"
                    onClick={() => toggleSort('status')}
                  >
                    Status
                    {sortIndicator(sortKey === 'status', sortDir)}
                  </button>
                </th>
                <th style={{ ...headerCell, textAlign: 'right' }}>
                  <button
                    type="button"
                    className="table-sort table-sort--right"
                    onClick={() => toggleSort('joined')}
                  >
                    Joined
                    {sortIndicator(sortKey === 'joined', sortDir)}
                  </button>
                </th>
                <th style={{ ...headerCell, textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 24 }}>
                    Loading employees…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td
                    colSpan={9}
                    style={{ textAlign: 'center', padding: 24, color: 'var(--danger)' }}
                  >
                    {error}
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <EmptyState
                      variant="table"
                      title="No employees yet"
                      description="Add someone to start tracking role, department and payroll."
                    />
                  </td>
                </tr>
              ) : (
                sorted.map((user) => {
                  const rowId = getRowId(user);
                  return (
                    <tr key={rowId} style={{ cursor: 'pointer' }} onClick={() => openDrawer(rowId)}>
                      <td style={cell}>{user.name || '-'}</td>
                      <td style={cell}>{user.email || '-'}</td>
                      <td style={cell}>{formatRole(String(user.role || ''))}</td>
                      <td style={cell}>{formatRole(String(user.department || ''))}</td>
                      <td style={{ ...cell, textAlign: 'right' }}>{formatPkr(user.salary)}</td>
                      <td style={{ ...cell, textAlign: 'right' }}>
                        {formatNumber(user.monthlyTarget)}
                      </td>
                      <td style={{ ...cell, textAlign: 'center' }}>
                        {normalizeStatus(user.status) === 'active' ? 'Active' : 'Inactive'}
                      </td>
                      <td style={{ ...cell, textAlign: 'right' }}>
                        {formatDate(user.joiningDate)}
                      </td>
                      <td style={{ ...cell, textAlign: 'center' }}>
                        <button
                          className="btn ghost"
                          style={{ padding: '6px 14px', borderRadius: 999 }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {drawerOpen && selectedUser && (
        <div className="drawer-overlay" onClick={closeDrawer}>
          <div className="drawer-panel drawer-panel--md" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900 }}>
                  {selectedUser.name || 'Employee'}
                </div>
                <div style={{ opacity: 0.75, fontSize: 12 }}>
                  {selectedUser.email || 'No email'} · {formatRole(String(selectedUser.role || ''))}
                </div>
              </div>
              <button
                className="btn ghost"
                onClick={closeDrawer}
                style={{ height: 34, borderRadius: 999 }}
              >
                Close
              </button>
            </div>

            <div style={{ height: 16 }} />

            {!editMode ? (
              <EmployeeProfile user={selectedUser} />
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3">
                  <label className="text-xs font-semibold text-[var(--text-muted)]">
                    Full name
                  </label>
                  <input
                    className="input"
                    value={formState.name}
                    onChange={(e) => setFormState((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="grid gap-3">
                  <label className="text-xs font-semibold text-[var(--text-muted)]">
                    Email (locked)
                  </label>
                  <input className="input" value={formState.email} disabled />
                </div>
                <div className="grid gap-3">
                  <label className="text-xs font-semibold text-[var(--text-muted)]">Phone</label>
                  <input
                    className="input"
                    value={formState.phone}
                    onChange={(e) => setFormState((prev) => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
                <div className="grid gap-3">
                  <label className="text-xs font-semibold text-[var(--text-muted)]">Role</label>
                  <MasterSelect
                    value={formState.role}
                    onChange={(value) => setFormState((prev) => ({ ...prev, role: value }))}
                    options={roleOptions.filter((opt) => opt.value !== 'all')}
                  />
                </div>
                <div className="grid gap-3">
                  <label className="text-xs font-semibold text-[var(--text-muted)]">
                    Department
                  </label>
                  <MasterSelect
                    value={formState.department}
                    onChange={(value) => setFormState((prev) => ({ ...prev, department: value }))}
                    options={DEPARTMENT_OPTIONS.filter((opt) => opt.value !== 'all')}
                  />
                </div>
                <div className="grid gap-3">
                  <label className="text-xs font-semibold text-[var(--text-muted)]">
                    Designation
                  </label>
                  <input
                    className="input"
                    value={formState.designation}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, designation: e.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-3">
                  <label className="text-xs font-semibold text-[var(--text-muted)]">
                    Joining date
                  </label>
                  <input
                    className="input"
                    type="date"
                    value={formState.joiningDate}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, joiningDate: e.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-3">
                  <label className="text-xs font-semibold text-[var(--text-muted)]">
                    Salary (PKR)
                  </label>
                  <input
                    className="input"
                    value={formState.salary}
                    onChange={(e) => setFormState((prev) => ({ ...prev, salary: e.target.value }))}
                  />
                </div>
                <div className="grid gap-3">
                  <label className="text-xs font-semibold text-[var(--text-muted)]">
                    Monthly target
                  </label>
                  <input
                    className="input"
                    value={formState.monthlyTarget}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, monthlyTarget: e.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-3">
                  <label className="text-xs font-semibold text-[var(--text-muted)]">
                    Commission (%)
                  </label>
                  <input
                    className="input"
                    value={formState.commission}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, commission: e.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-3">
                  <label className="text-xs font-semibold text-[var(--text-muted)]">Status</label>
                  <MasterSelect
                    value={formState.status}
                    onChange={(value) => setFormState((prev) => ({ ...prev, status: value }))}
                    options={STATUS_OPTIONS.filter((opt) => opt.value !== 'all')}
                  />
                </div>
              </div>
            )}

            <div style={{ height: 18 }} />
            <div className="flex justify-end gap-2">
              {!editMode ? (
                <button
                  className="btn"
                  onClick={() => setEditMode(true)}
                  disabled={!canEditSelected}
                >
                  Edit
                </button>
              ) : (
                <>
                  <button className="btn ghost" onClick={() => setEditMode(false)}>
                    Cancel
                  </button>
                  <button
                    className="btn"
                    onClick={saveEmployee}
                    disabled={saving || !canEditSelected}
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmployeeProfile({ user }: { user: UserRecord }) {
  const info = [
    { label: 'Email', value: user.email || '-' },
    { label: 'Phone', value: user.phone || '-' },
    { label: 'Role', value: formatRole(String(user.role || '')) },
    { label: 'Department', value: formatRole(String(user.department || '')) },
    { label: 'Designation', value: user.designation || '-' },
    { label: 'Joining Date', value: formatDate(user.joiningDate) },
    { label: 'Salary', value: formatPkr(user.salary) },
    { label: 'Monthly Target', value: formatNumber(user.monthlyTarget) },
    { label: 'Commission', value: formatNumber(user.commission) },
    { label: 'Status', value: normalizeStatus(user.status) === 'active' ? 'Active' : 'Inactive' },
  ];

  return (
    <div className="space-y-3">
      {info.map((item) => (
        <div
          key={item.label}
          className="flex items-center justify-between rounded-xl border px-4 py-3"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div style={{ fontSize: 12, color: 'var(--sidebar-text)' }}>{item.label}</div>
          <div style={{ fontWeight: 600 }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function getSortValue(user: UserRecord, key: SortKey) {
  switch (key) {
    case 'name':
      return String(user.name || '').toLowerCase();
    case 'email':
      return String(user.email || '').toLowerCase();
    case 'role':
      return String(user.role || '').toLowerCase();
    case 'department':
      return String(user.department || '').toLowerCase();
    case 'salary':
      return Number(user.salary || 0);
    case 'target':
      return Number(user.monthlyTarget || 0);
    case 'status':
      return normalizeStatus(user.status);
    case 'joined':
      return user.joiningDate ? new Date(user.joiningDate).getTime() : 0;
    default:
      return '';
  }
}

function normalizeRole(value?: string | null) {
  return String(value || '').toLowerCase();
}
