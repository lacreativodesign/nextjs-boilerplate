'use client';

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { toastError } from '@/lib/toast';
import MasterSelect from '@/components/ui/MasterSelect';
import { TableSkeleton } from '@/components/ui/Skeleton';
import {
  INTERNAL_ROLE_OPTIONS,
  USER_DEPARTMENT_VALUES,
  type InternalRole,
  type UserDepartment,
} from '@/lib/userOptions';
import { apiFetch } from '@/lib/api/client';
import { SmartSearchBar } from '@/components/search/SmartSearchBar';
import { smartMatch } from '@/lib/search/smartMatch';

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
        const res = await apiFetch('/api/admin/hr/employees/list', {
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

  const canAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';

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

  async function saveEdits() {
    if (!selectedUser) return;
    try {
      setSaving(true);
      const payload = {
        uid: getRowId(selectedUser),
        name: formState.name,
        phone: formState.phone,
        role: formState.role,
        department: formState.department,
        designation: formState.designation,
        joiningDate: formState.joiningDate
          ? new Date(`${formState.joiningDate}T00:00:00.000Z`).toISOString()
          : null,
        salary: formState.salary,
        monthlyTarget: formState.monthlyTarget,
        commission: formState.commission,
        status: formState.status,
      };
      const res = await apiFetch('/api/admin/hr/employees/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || 'Unable to update employee.');
      setUsers((prev) =>
        prev.map((user) => (getRowId(user) === payload.uid ? { ...user, ...data.user } : user)),
      );
      setEditMode(false);
    } catch (err: any) {
      toastError(err?.message || 'Unable to update employee.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleDeactivate(nextStatus: 'active' | 'inactive') {
    if (!selectedUser || !canAdmin) return;
    const confirmText =
      nextStatus === 'inactive' ? 'Deactivate this user?' : 'Reactivate this user?';
    if (!window.confirm(confirmText)) return;
    await saveDirectStatus(nextStatus);
  }

  async function saveDirectStatus(status: 'active' | 'inactive') {
    if (!selectedUser) return;
    try {
      setSaving(true);
      const res = await apiFetch('/api/admin/hr/employees/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: getRowId(selectedUser), status }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || 'Unable to update status.');
      setUsers((prev) =>
        prev.map((user) =>
          getRowId(user) === getRowId(selectedUser) ? { ...user, ...data.user } : user,
        ),
      );
      setFormState((prev) => ({ ...prev, status }));
    } catch (err: any) {
      toastError(err?.message || 'Unable to update status.');
    } finally {
      setSaving(false);
    }
  }

  const headerCell: React.CSSProperties = {
    padding: '12px 16px',
    fontWeight: 700,
    textAlign: 'left',
  };

  const cell: React.CSSProperties = {
    padding: '12px 16px',
    textAlign: 'left',
  };

  return (
    <div className="space-y-5">
      <section className="card" style={{ padding: 18, borderRadius: 18 }}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Employees</div>
            <div style={{ color: 'var(--sidebar-text)', fontSize: 14 }}>
              Live, synced employee directory with role-aware controls.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SmartSearchBar value={search} onChange={setSearch} />
            <MasterSelect value={roleFilter} onChange={setRoleFilter} options={ROLE_OPTIONS} />
            <MasterSelect
              value={departmentFilter}
              onChange={setDepartmentFilter}
              options={DEPARTMENT_OPTIONS}
            />
            <MasterSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={STATUS_OPTIONS}
            />
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-[var(--text-muted)]">Joined from</label>
            <input
              className="input"
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-muted)]">Joined to</label>
            <input
              className="input"
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="card" style={{ padding: 0, borderRadius: 18, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 16 }}>
            <TableSkeleton rows={8} columns={9} />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
              <thead>
                <tr style={{ background: 'var(--table-header-bg)' }}>
                  <th
                    style={headerCell}
                    onClick={() => handleSort(setSortKey, setSortDir, sortKey, 'name')}
                  >
                    Name
                  </th>
                  <th
                    style={headerCell}
                    onClick={() => handleSort(setSortKey, setSortDir, sortKey, 'email')}
                  >
                    Email
                  </th>
                  <th
                    style={headerCell}
                    onClick={() => handleSort(setSortKey, setSortDir, sortKey, 'role')}
                  >
                    Role
                  </th>
                  <th
                    style={headerCell}
                    onClick={() => handleSort(setSortKey, setSortDir, sortKey, 'department')}
                  >
                    Department
                  </th>
                  <th
                    style={{ ...headerCell, textAlign: 'right' }}
                    onClick={() => handleSort(setSortKey, setSortDir, sortKey, 'salary')}
                  >
                    Salary PKR
                  </th>
                  <th
                    style={{ ...headerCell, textAlign: 'right' }}
                    onClick={() => handleSort(setSortKey, setSortDir, sortKey, 'target')}
                  >
                    Target
                  </th>
                  <th
                    style={{ ...headerCell, textAlign: 'center' }}
                    onClick={() => handleSort(setSortKey, setSortDir, sortKey, 'status')}
                  >
                    Status
                  </th>
                  <th
                    style={{ ...headerCell, textAlign: 'right' }}
                    onClick={() => handleSort(setSortKey, setSortDir, sortKey, 'joined')}
                  >
                    Joined
                  </th>
                  <th style={{ ...headerCell, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {error ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: 24, color: '#ef4444' }}>
                      {error}
                    </td>
                  </tr>
                ) : sorted.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: 24 }}>
                      No employees found.
                    </td>
                  </tr>
                ) : (
                  sorted.map((user) => {
                    const rowId = getRowId(user);

                    return (
                      <tr
                        key={rowId}
                        style={{ cursor: 'pointer' }}
                        onClick={() => openDrawer(rowId)}
                      >
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
        )}
      </section>

      {drawerOpen && selectedUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
          onClick={closeDrawer}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: 'min(520px, 92vw)',
              height: '100%',
              padding: 20,
              background: 'var(--card-bg)',
              borderLeft: '1px solid var(--border-subtle)',
              overflowY: 'auto',
            }}
          >
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
                    options={ROLE_OPTIONS.filter((opt) => opt.value !== 'all')}
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
                    Joining Date
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
                    Target (USD)
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

            <div style={{ height: 16 }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {canAdmin && (
                  <button
                    className="btn ghost"
                    onClick={() =>
                      toggleDeactivate(formState.status === 'inactive' ? 'active' : 'inactive')
                    }
                    disabled={saving}
                    style={{
                      borderRadius: 12,
                      fontWeight: 600,
                      border: '1px solid rgba(248,113,113,0.35)',
                      color: '#ef4444',
                    }}
                  >
                    {formState.status === 'inactive' ? 'Reactivate' : 'Deactivate'}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {!editMode ? (
                  <button
                    className="btn"
                    style={{ borderRadius: 12 }}
                    onClick={() => setEditMode(true)}
                  >
                    Edit
                  </button>
                ) : (
                  <>
                    <button className="btn ghost" onClick={() => setEditMode(false)}>
                      Cancel
                    </button>
                    <button className="btn" onClick={saveEdits} disabled={saving}>
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmployeeProfile({ user }: { user: UserRecord }) {
  const safe = (value: any) =>
    value === null || value === undefined || value === '' ? '-' : String(value);
  return (
    <div className="space-y-4">
      <ProfileSection title="Profile">
        <ProfileRow label="Designation" value={safe(user.designation)} />
        <ProfileRow label="Role" value={formatRole(String(user.role || ''))} />
        <ProfileRow label="Department" value={formatRole(String(user.department || ''))} />
        <ProfileRow label="Joining Date" value={formatDate(user.joiningDate)} />
        <ProfileRow
          label="Status"
          value={normalizeStatus(user.status) === 'active' ? 'Active' : 'Inactive'}
        />
      </ProfileSection>
      <ProfileSection title="Compensation">
        <ProfileRow label="Salary (PKR)" value={formatPkr(user.salary)} />
        <ProfileRow label="Target (USD)" value={formatNumber(user.monthlyTarget)} />
        <ProfileRow
          label="Commission (%)"
          value={
            user.commission !== undefined && user.commission !== null && user.commission !== ''
              ? `${user.commission}%`
              : '-'
          }
        />
      </ProfileSection>
      <ProfileSection title="System">
        <ProfileRow label="Created" value={formatDate(user.createdAt)} />
        <ProfileRow label="Updated" value={formatDate(user.updatedAt)} />
        <ProfileRow label="User ID" value={safe(getRowId(user))} />
      </ProfileSection>
    </div>
  );
}

function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        borderRadius: 14,
        padding: 14,
        border: '1px solid var(--border-subtle)',
        background: 'var(--surface-muted)',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 10 }}>{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
      <span style={{ color: 'var(--sidebar-text)' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function handleSort(
  setSortKey: Dispatch<SetStateAction<SortKey>>,
  setSortDir: Dispatch<SetStateAction<'asc' | 'desc'>>,
  currentKey: SortKey,
  nextKey: SortKey,
) {
  if (currentKey === nextKey) {
    setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  } else {
    setSortKey(nextKey);
    setSortDir('asc');
  }
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
      return new Date(user.joiningDate || 0).getTime();
    default:
      return '';
  }
}

function formatPkr(value: any) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return `Rs. ${num.toLocaleString('en-PK')}`;
}

function formatNumber(value: any) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return num.toLocaleString('en-US');
}

function formatDate(value: any) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-US');
}
