'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import SalesDrawer from '@/components/sales/SalesDrawer';
import { formatDate } from '@/components/finance/financeUtils';
import { SmartSearchBar } from '@/components/search/SmartSearchBar';
import { smartMatch } from '@/lib/search/smartMatch';
import { apiFetch } from '@/lib/api/client';

const STATUS_OPTIONS = ['All', 'Active', 'Paused', 'Completed'];

type CampaignRecord = {
  id: string;
  name: string;
  channel: string;
  status: string;
  metrics?: Record<string, unknown> | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type CampaignResponse = { ok: boolean; error?: string; campaigns: CampaignRecord[] };

type ErrorState = { title: string; message: string };

type SortKey = 'name' | 'channel' | 'status' | 'updatedAt';

type SortDir = 'asc' | 'desc';

type CampaignForm = {
  id?: string;
  name: string;
  channel: string;
  status: string;
};

const defaultForm: CampaignForm = {
  name: '',
  channel: '',
  status: 'Active',
};

export default function SalesCampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [form, setForm] = useState<CampaignForm>(defaultForm);
  const [actionLoading, setActionLoading] = useState(false);

  const loadCampaigns = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await apiFetch('/api/sales/campaigns/list', { cache: 'no-store' });
      const data = (await res.json()) as CampaignResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || 'Unable to load campaigns.');
      }
      setCampaigns(data.campaigns || []);
    } catch (err) {
      console.error('Campaigns load error', err);
      setError({ title: 'Unable to load campaigns', message: 'Please try again in a moment.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  const filteredCampaigns = useMemo(() => {
    let list = [...campaigns];
    if (statusFilter !== 'All') {
      list = list.filter((campaign) => campaign.status === statusFilter);
    }
    return smartMatch(list, query, (campaign) => [
      campaign.name,
      campaign.channel,
      campaign.status,
    ]);
  }, [campaigns, query, statusFilter]);

  const sortedCampaigns = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const list = [...filteredCampaigns];
    list.sort((a, b) => {
      const valA = String(a[sortKey] ?? '');
      const valB = String(b[sortKey] ?? '');
      return valA.localeCompare(valB) * dir;
    });
    return list;
  }, [filteredCampaigns, sortDir, sortKey]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortBadge = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? '▲' : '▼';
  };

  const headerLabel = (label: string, badge?: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span>{label}</span>
      <span
        style={{
          width: 14,
          display: 'inline-block',
          textAlign: 'center',
          opacity: badge ? 1 : 0.35,
        }}
      >
        {badge || '•'}
      </span>
    </span>
  );

  const headerCellStyle: React.CSSProperties = {
    padding: '12px 14px',
    fontSize: 11,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    borderBottom: '1px solid var(--border-subtle)',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    textAlign: 'left',
  };

  const cellStyle: React.CSSProperties = {
    padding: '12px 14px',
    borderBottom: '1px solid var(--border-subtle)',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    fontWeight: 400,
  };

  const openCreate = () => {
    setDrawerMode('create');
    setForm(defaultForm);
    setDrawerOpen(true);
  };

  const openEdit = (campaign: CampaignRecord) => {
    setDrawerMode('edit');
    setForm({
      id: campaign.id,
      name: campaign.name,
      channel: campaign.channel,
      status: campaign.status,
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    try {
      setActionLoading(true);
      const endpoint =
        drawerMode === 'create' ? '/api/sales/campaigns/create' : '/api/sales/campaigns/update';
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || 'Unable to save campaign.');
      }
      setDrawerOpen(false);
      await loadCampaigns();
    } catch (err) {
      console.error('Campaign save error', err);
      setError({ title: 'Unable to save campaign', message: 'Please try again.' });
    } finally {
      setActionLoading(false);
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
          <h3 style={{ fontSize: 20, fontWeight: 700 }}>Campaigns</h3>
          <p style={{ fontSize: 13, color: 'var(--sidebar-text)' }}>
            Keep outreach campaigns aligned with pipeline goals.
          </p>
        </div>
        <button className="btn" onClick={openCreate} style={{ borderRadius: 999 }}>
          + Create Campaign
        </button>
      </div>

      <div className="card" style={{ marginTop: 18, padding: 18, borderRadius: 18 }}>
        <div className="grid gap-4 md:grid-cols-[1.2fr_0.6fr]">
          <div>
            <label className="text-xs font-semibold text-[var(--text-muted)]">Search</label>
            <SmartSearchBar value={query} onChange={setQuery} className="mt-2" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-muted)]">Status</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="input mt-2"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status === 'All' ? 'All statuses' : status}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <div className="table-shell">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
              <thead>
                <tr style={{ background: 'var(--surface-muted)' }}>
                  <th style={headerCellStyle} onClick={() => toggleSort('name')}>
                    {headerLabel('Campaign', sortBadge('name'))}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort('channel')}>
                    {headerLabel('Channel', sortBadge('channel'))}
                  </th>
                  <th
                    style={{ ...headerCellStyle, textAlign: 'center' }}
                    onClick={() => toggleSort('status')}
                  >
                    {headerLabel('Status', sortBadge('status'))}
                  </th>
                  <th
                    style={{ ...headerCellStyle, textAlign: 'left' }}
                    onClick={() => toggleSort('updatedAt')}
                  >
                    {headerLabel('Updated', sortBadge('updatedAt'))}
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: 'center' }}>
                      Loading campaigns...
                    </td>
                  </tr>
                ) : sortedCampaigns.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: 'center' }}>
                      No campaigns found.
                    </td>
                  </tr>
                ) : (
                  sortedCampaigns.map((campaign) => (
                    <tr key={campaign.id}>
                      <td style={cellStyle}>{campaign.name}</td>
                      <td style={cellStyle}>{campaign.channel || '-'}</td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>{campaign.status}</td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        {formatDate(campaign.updatedAt || campaign.createdAt)}
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        <button
                          className="btn ghost"
                          onClick={() => openEdit(campaign)}
                          style={{ borderRadius: 999 }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {drawerOpen && (
        <SalesDrawer
          title={drawerMode === 'create' ? 'Create Campaign' : 'Campaign Details'}
          subtitle={drawerMode === 'create' ? 'Launch a campaign' : 'Update campaign'}
          onClose={() => setDrawerOpen(false)}
          actions={
            <button className="btn" onClick={handleSave} disabled={actionLoading}>
              {actionLoading ? 'Saving...' : 'Save Campaign'}
            </button>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-[var(--text-muted)]">
                Campaign Name
              </label>
              <input
                className="input mt-2"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-muted)]">Channel</label>
              <input
                className="input mt-2"
                value={form.channel}
                onChange={(event) => setForm((prev) => ({ ...prev, channel: event.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-muted)]">Status</label>
              <select
                className="input mt-2"
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
              >
                {STATUS_OPTIONS.filter((status) => status !== 'All').map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </SalesDrawer>
      )}
    </div>
  );
}
