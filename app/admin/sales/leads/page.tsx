'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import MasterSelect from '@/components/ui/MasterSelect';
import SalesDrawer from '@/components/sales/SalesDrawer';
import { formatDate, formatDateTime } from '@/components/finance/financeUtils';
import { LEAD_STAGES } from '@/lib/sales/utils';
import { SmartSearchBar } from '@/components/search/SmartSearchBar';
import { smartMatch } from '@/lib/search/smartMatch';
import { apiFetch } from '@/lib/api/client';

const STAGE_OPTIONS = [
  { label: 'All Stages', value: '' },
  ...LEAD_STAGES.map((stage) => ({ label: stage, value: stage })),
];

type LeadRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  stage: string;
  ownerId?: string | null;
  ownerName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type UserOption = { uid: string; name?: string; fullName?: string; role?: string };

type ErrorState = { title: string; message: string };

type LeadFormState = {
  id?: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  stage: string;
  ownerId: string;
  ownerName: string;
};

const defaultForm: LeadFormState = {
  name: '',
  email: '',
  phone: '',
  source: '',
  stage: LEAD_STAGES[0],
  ownerId: '',
  ownerName: '',
};

export default function SalesLeadsPage() {
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [owners, setOwners] = useState<UserOption[]>([]);
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [form, setForm] = useState<LeadFormState>(defaultForm);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadLeads = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await apiFetch('/api/admin/sales/leads/list', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || 'Unable to load leads.');
      }
      setLeads(data.leads || []);
    } catch (err) {
      console.error('Leads load error', err);
      setError({ title: 'Unable to load leads', message: 'Please try again in a moment.' });
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
    loadLeads();
    loadOwners();
  }, [loadLeads, loadOwners]);

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

  const filteredLeads = useMemo(() => {
    const list = leads.filter((lead) => {
      if (stageFilter && lead.stage !== stageFilter) return false;
      if (ownerFilter && lead.ownerId !== ownerFilter) return false;
      return true;
    });
    return smartMatch(list, query, (lead) => [
      lead.name,
      lead.email,
      lead.phone,
      lead.source,
      lead.ownerName,
    ]);
  }, [leads, query, stageFilter, ownerFilter]);

  const openCreate = () => {
    setDrawerMode('create');
    setForm(defaultForm);
    setDrawerOpen(true);
  };

  const openEdit = (lead: LeadRecord) => {
    setDrawerMode('edit');
    setForm({
      id: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      source: lead.source,
      stage: lead.stage,
      ownerId: lead.ownerId || '',
      ownerName: lead.ownerName || '',
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
    try {
      setActionLoading('save');
      const payload = {
        ...form,
      };
      const endpoint =
        drawerMode === 'create' ? '/api/admin/sales/leads/create' : '/api/admin/sales/leads/update';
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || 'Unable to save lead.');
      }
      setDrawerOpen(false);
      await loadLeads();
    } catch (err) {
      console.error('Lead save error', err);
      setError({ title: 'Unable to save lead', message: 'Please try again.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (lead: LeadRecord) => {
    try {
      setActionLoading(lead.id);
      const res = await apiFetch('/api/admin/sales/leads/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lead.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || 'Unable to delete lead.');
      }
      await loadLeads();
    } catch (err) {
      console.error('Lead delete error', err);
      setError({ title: 'Unable to delete lead', message: 'Please try again.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleConvert = async (lead: LeadRecord) => {
    try {
      setActionLoading(`${lead.id}-convert`);
      const res = await apiFetch('/api/admin/sales/deals/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          leadName: lead.name,
          leadEmail: lead.email,
          leadPhone: lead.phone,
          clientName: lead.name,
          source: lead.source,
          ownerId: lead.ownerId || '',
          ownerName: lead.ownerName || '',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || 'Unable to convert lead.');
      }
      await apiFetch('/api/admin/sales/leads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lead.id, stage: 'Converted' }),
      });
      await loadLeads();
    } catch (err) {
      console.error('Lead convert error', err);
      setError({ title: 'Unable to convert lead', message: 'Please try again.' });
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
          <h3 style={{ fontSize: 20, fontWeight: 700 }}>Leads</h3>
          <p style={{ fontSize: 13, color: 'var(--sidebar-text)' }}>
            Live lead capture with owner assignment and conversion tools.
          </p>
        </div>
        <button className="btn" onClick={openCreate} style={{ borderRadius: 999 }}>
          Create Lead
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <div style={{ flex: '1 1 240px', minWidth: 220 }}>
          <SmartSearchBar value={query} onChange={setQuery} />
        </div>
        <MasterSelect
          value={stageFilter}
          onChange={(value) => setStageFilter(value)}
          options={STAGE_OPTIONS}
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
            setStageFilter('');
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
                <th style={{ textAlign: 'left', padding: '14px 16px', fontWeight: 700 }}>Name</th>
                <th style={{ textAlign: 'left', padding: '14px 16px', fontWeight: 700 }}>Email</th>
                <th style={{ textAlign: 'left', padding: '14px 16px', fontWeight: 700 }}>Phone</th>
                <th style={{ textAlign: 'left', padding: '14px 16px', fontWeight: 700 }}>Source</th>
                <th style={{ textAlign: 'right', padding: '14px 16px', fontWeight: 700 }}>Stage</th>
                <th style={{ textAlign: 'right', padding: '14px 16px', fontWeight: 700 }}>Owner</th>
                <th style={{ textAlign: 'right', padding: '14px 16px', fontWeight: 700 }}>
                  Created At
                </th>
                <th style={{ textAlign: 'center', padding: '14px 16px', fontWeight: 700 }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: 24, textAlign: 'center' }}>
                    Loading leads...
                  </td>
                </tr>
              ) : filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 24, textAlign: 'center' }}>
                    No leads found.
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => (
                  <tr key={lead.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 600 }}>{lead.name}</td>
                    <td style={{ padding: '14px 16px' }}>{lead.email || '-'}</td>
                    <td style={{ padding: '14px 16px' }}>{lead.phone || '-'}</td>
                    <td style={{ padding: '14px 16px' }}>{lead.source || '-'}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>{lead.stage}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      {lead.ownerName || 'Unassigned'}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      {formatDate(lead.createdAt)}
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
                          onClick={() => openEdit(lead)}
                          style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12 }}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => handleConvert(lead)}
                          disabled={actionLoading === `${lead.id}-convert`}
                          style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12 }}
                        >
                          {actionLoading === `${lead.id}-convert` ? 'Converting' : 'Convert'}
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => handleDelete(lead)}
                          disabled={actionLoading === lead.id}
                          style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12 }}
                        >
                          {actionLoading === lead.id ? 'Deleting' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {drawerOpen && (
        <SalesDrawer
          title={drawerMode === 'create' ? 'Create Lead' : 'Lead Details'}
          subtitle={
            drawerMode === 'create'
              ? 'Capture a new lead'
              : formatDateTime(form.id ? leads.find((l) => l.id === form.id)?.updatedAt : null)
          }
          onClose={() => setDrawerOpen(false)}
          actions={
            <>
              <button
                className="btn"
                onClick={handleSave}
                disabled={actionLoading === 'save'}
                style={{ borderRadius: 999 }}
              >
                {actionLoading === 'save' ? 'Saving' : 'Save Lead'}
              </button>
              {drawerMode === 'edit' && (
                <button
                  className="btn ghost"
                  onClick={() => {
                    if (form.id) {
                      const lead = leads.find((item) => item.id === form.id);
                      if (lead) handleConvert(lead);
                    }
                  }}
                  style={{ borderRadius: 999 }}
                >
                  Convert to Deal
                </button>
              )}
            </>
          }
        >
          <div className="card" style={{ padding: 16, borderRadius: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Lead Profile</div>
            <div style={{ display: 'grid', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Name</span>
                <input
                  className="input"
                  placeholder="Lead name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Email</span>
                <input
                  className="input"
                  placeholder="Lead email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Phone</span>
                <input
                  className="input"
                  placeholder="Lead phone"
                  value={form.phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Source</span>
                <input
                  className="input"
                  placeholder="Source"
                  value={form.source}
                  onChange={(e) => setForm((prev) => ({ ...prev, source: e.target.value }))}
                />
              </label>
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Stage</span>
                <MasterSelect
                  value={form.stage}
                  onChange={(value) => setForm((prev) => ({ ...prev, stage: value }))}
                  options={LEAD_STAGES.map((stage) => ({ label: stage, value: stage }))}
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Owner</span>
                <MasterSelect
                  value={form.ownerId}
                  onChange={handleOwnerChange}
                  options={ownerOptions}
                />
              </div>
            </div>
          </div>
        </SalesDrawer>
      )}
    </div>
  );
}
