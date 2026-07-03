'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import MasterSelect from '@/components/ui/MasterSelect';
import SalesDrawer from '@/components/sales/SalesDrawer';
import { formatDateTime } from '@/components/finance/financeUtils';
import { FOLLOW_UP_TYPES, FOLLOW_UP_STATUS, isOverdue, toInputDateTime } from '@/lib/sales/utils';
import { SmartSearchBar } from '@/components/search/SmartSearchBar';
import { smartMatch } from '@/lib/search/smartMatch';
import { apiFetch } from '@/lib/api/client';

const TYPE_OPTIONS = [
  { label: 'All Types', value: '' },
  ...FOLLOW_UP_TYPES.map((type) => ({ label: type, value: type })),
];
const STATUS_OPTIONS = [
  { label: 'All Status', value: '' },
  ...FOLLOW_UP_STATUS.map((status) => ({ label: status, value: status })),
];

type FollowUpRecord = {
  id: string;
  relatedType: 'Lead' | 'Deal' | string;
  relatedId?: string | null;
  relatedName: string;
  type: string;
  dueDate?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type UserOption = { uid: string; name?: string; fullName?: string; role?: string };

type ErrorState = { title: string; message: string };

type FollowUpFormState = {
  id?: string;
  relatedType: string;
  relatedName: string;
  type: string;
  dueDate: string;
  ownerId: string;
  ownerName: string;
  status: string;
};

const defaultForm: FollowUpFormState = {
  relatedType: 'Lead',
  relatedName: '',
  type: FOLLOW_UP_TYPES[0],
  dueDate: '',
  ownerId: '',
  ownerName: '',
  status: 'Open',
};

export default function SalesFollowUpsPage() {
  const [followUps, setFollowUps] = useState<FollowUpRecord[]>([]);
  const [owners, setOwners] = useState<UserOption[]>([]);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [form, setForm] = useState<FollowUpFormState>(defaultForm);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadFollowUps = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await apiFetch('/api/admin/sales/follow-ups/list', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || 'Unable to load follow-ups.');
      }
      setFollowUps(data.followUps || []);
    } catch (err) {
      console.error('Follow-ups load error', err);
      setError({ title: 'Unable to load follow-ups', message: 'Please try again in a moment.' });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOwners = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/users/list', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setOwners(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Owners load error', err);
    }
  }, []);

  useEffect(() => {
    loadFollowUps();
    loadOwners();
  }, [loadFollowUps, loadOwners]);

  const ownerOptions = useMemo(
    () => [
      { label: 'All Owners', value: '' },
      ...owners.map((owner) => ({
        label: owner.name || owner.fullName || owner.uid,
        value: owner.uid,
      })),
    ],
    [owners],
  );

  const filteredFollowUps = useMemo(() => {
    const list = followUps.filter((item) => {
      if (typeFilter && item.type !== typeFilter) return false;
      if (statusFilter && item.status !== statusFilter) return false;
      if (ownerFilter && item.ownerId !== ownerFilter) return false;
      return true;
    });
    return smartMatch(list, query, (item) => [item.relatedName, item.type, item.ownerName]);
  }, [followUps, query, typeFilter, statusFilter, ownerFilter]);

  const openCreate = () => {
    setDrawerMode('create');
    setForm(defaultForm);
    setDrawerOpen(true);
  };

  const openEdit = (item: FollowUpRecord) => {
    setDrawerMode('edit');
    setForm({
      id: item.id,
      relatedType: item.relatedType,
      relatedName: item.relatedName,
      type: item.type,
      dueDate: toInputDateTime(item.dueDate),
      ownerId: item.ownerId || '',
      ownerName: item.ownerName || '',
      status: item.status,
    });
    setDrawerOpen(true);
  };

  const handleOwnerChange = (ownerId: string) => {
    const owner = owners.find((item) => item.uid === ownerId);
    setForm((prev) => ({
      ...prev,
      ownerId,
      ownerName: owner?.name || owner?.fullName || '',
    }));
  };

  const handleSave = async () => {
    if (!form.dueDate) {
      setError({ title: 'Due date required', message: 'Follow-ups require both date and time.' });
      return;
    }
    try {
      setActionLoading('save');
      const endpoint =
        drawerMode === 'create'
          ? '/api/admin/sales/follow-ups/create'
          : '/api/admin/sales/follow-ups/update';
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          dueDate: form.dueDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || 'Unable to save follow-up.');
      }
      setDrawerOpen(false);
      setError(null);
      await loadFollowUps();
    } catch (err) {
      console.error('Follow-up save error', err);
      setError({ title: 'Unable to save follow-up', message: 'Please try again.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (item: FollowUpRecord) => {
    try {
      setActionLoading(item.id);
      const res = await apiFetch('/api/admin/sales/follow-ups/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || 'Unable to delete follow-up.');
      }
      await loadFollowUps();
    } catch (err) {
      console.error('Follow-up delete error', err);
      setError({ title: 'Unable to delete follow-up', message: 'Please try again.' });
    } finally {
      setActionLoading(null);
    }
  };

  const markDone = async (item: FollowUpRecord) => {
    try {
      setActionLoading(`${item.id}-done`);
      const res = await apiFetch('/api/admin/sales/follow-ups/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, status: 'Done' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || 'Unable to update follow-up.');
      }
      await loadFollowUps();
    } catch (err) {
      console.error('Follow-up done error', err);
      setError({ title: 'Unable to update follow-up', message: 'Please try again.' });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="w-full">
      {error && (
        <div
          className="card"
          style={{
            borderRadius: 14,
            padding: 16,
            border: '1px solid rgba(239,68,68,0.35)',
            background: 'var(--danger-soft)',
            color: 'var(--danger)',
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          <div style={{ fontWeight: 700 }}>{error.title}</div>
          <div style={{ fontSize: 13, opacity: 0.9 }}>{error.message}</div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 style={{ fontSize: 20, fontWeight: 700 }}>Follow-Ups</h3>
          <p style={{ fontSize: 13, color: 'var(--sidebar-text)' }}>
            Track calls, emails, meetings, and overdue reminders.
          </p>
        </div>
        <button className="btn" onClick={openCreate} style={{ borderRadius: 999 }}>
          Create Follow-Up
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <div style={{ flex: '1 1 240px', minWidth: 220 }}>
          <SmartSearchBar value={query} onChange={setQuery} />
        </div>
        <MasterSelect
          value={typeFilter}
          onChange={(value) => setTypeFilter(value)}
          options={TYPE_OPTIONS}
        />
        <MasterSelect
          value={statusFilter}
          onChange={(value) => setStatusFilter(value)}
          options={STATUS_OPTIONS}
        />
        <MasterSelect
          value={ownerFilter}
          onChange={(value) => setOwnerFilter(value)}
          options={ownerOptions}
        />
        <button
          type="button"
          className="btn"
          onClick={() => {
            setQuery('');
            setTypeFilter('');
            setStatusFilter('');
            setOwnerFilter('');
          }}
          style={{ borderRadius: 999, padding: '10px 16px', fontWeight: 500 }}
        >
          Reset Filters
        </button>
      </div>

      <div className="table-shell">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
            <thead>
              <tr style={{ background: 'var(--surface-muted)' }}>
                <th style={{ textAlign: 'left', padding: '14px 16px', fontWeight: 700 }}>
                  Related Lead/Deal
                </th>
                <th style={{ textAlign: 'left', padding: '14px 16px', fontWeight: 700 }}>Type</th>
                <th style={{ textAlign: 'right', padding: '14px 16px', fontWeight: 700 }}>
                  Due Date
                </th>
                <th style={{ textAlign: 'right', padding: '14px 16px', fontWeight: 700 }}>Owner</th>
                <th style={{ textAlign: 'right', padding: '14px 16px', fontWeight: 700 }}>
                  Status
                </th>
                <th style={{ textAlign: 'center', padding: '14px 16px', fontWeight: 700 }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ padding: 24, textAlign: 'center' }}>
                    Loading follow-ups...
                  </td>
                </tr>
              ) : filteredFollowUps.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 24, textAlign: 'center' }}>
                    No follow-ups found.
                  </td>
                </tr>
              ) : (
                filteredFollowUps.map((item) => {
                  const overdue = item.status !== 'Done' && isOverdue(item.dueDate);
                  return (
                    <tr key={item.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '14px 16px', fontWeight: 600 }}>{item.relatedName}</td>
                      <td style={{ padding: '14px 16px' }}>{item.type}</td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        {formatDateTime(item.dueDate)}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        {item.ownerName || 'Unassigned'}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        {overdue ? 'Overdue' : item.status}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <div
                          style={{
                            display: 'flex',
                            gap: 8,
                            justifyContent: 'center',
                            flexWrap: 'wrap',
                          }}
                        >
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => openEdit(item)}
                            style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12 }}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => markDone(item)}
                            disabled={actionLoading === `${item.id}-done`}
                            style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12 }}
                          >
                            {actionLoading === `${item.id}-done` ? 'Updating' : 'Mark Done'}
                          </button>
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => handleDelete(item)}
                            disabled={actionLoading === item.id}
                            style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12 }}
                          >
                            {actionLoading === item.id ? 'Deleting' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {drawerOpen && (
        <SalesDrawer
          title={drawerMode === 'create' ? 'Create Follow-Up' : 'Follow-Up Details'}
          subtitle={
            drawerMode === 'create'
              ? 'Schedule a follow-up'
              : formatDateTime(form.id ? followUps.find((f) => f.id === form.id)?.updatedAt : null)
          }
          onClose={() => setDrawerOpen(false)}
          actions={
            <button
              className="btn"
              onClick={handleSave}
              disabled={actionLoading === 'save'}
              style={{ borderRadius: 999 }}
            >
              {actionLoading === 'save' ? 'Saving' : 'Save Follow-Up'}
            </button>
          }
        >
          <div className="card" style={{ padding: 16, borderRadius: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Follow-Up Details</div>
            <div style={{ display: 'grid', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Related Type</span>
                <MasterSelect
                  value={form.relatedType}
                  onChange={(value) => setForm((prev) => ({ ...prev, relatedType: value }))}
                  options={[
                    { label: 'Lead', value: 'Lead' },
                    { label: 'Deal', value: 'Deal' },
                  ]}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Related Lead/Deal</span>
                <input
                  className="input"
                  placeholder="Related name"
                  value={form.relatedName}
                  onChange={(e) => setForm((prev) => ({ ...prev, relatedName: e.target.value }))}
                />
              </label>
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Type</span>
                <MasterSelect
                  value={form.type}
                  onChange={(value) => setForm((prev) => ({ ...prev, type: value }))}
                  options={FOLLOW_UP_TYPES.map((type) => ({ label: type, value: type }))}
                />
              </div>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Due Date & Time</span>
                <input
                  className="input"
                  type="datetime-local"
                  value={form.dueDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                />
              </label>
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Owner</span>
                <MasterSelect
                  value={form.ownerId}
                  onChange={handleOwnerChange}
                  options={ownerOptions}
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Status</span>
                <MasterSelect
                  value={form.status}
                  onChange={(value) => setForm((prev) => ({ ...prev, status: value }))}
                  options={FOLLOW_UP_STATUS.map((status) => ({ label: status, value: status }))}
                />
              </div>
            </div>
          </div>
        </SalesDrawer>
      )}
    </div>
  );
}
