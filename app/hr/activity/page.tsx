'use client';

import { useEffect, useMemo, useState } from 'react';
import MasterSelect from '@/components/ui/MasterSelect';
import { formatDateTime } from '@/components/finance/financeUtils';
import { SmartSearchBar } from '@/components/search/SmartSearchBar';
import { smartMatch } from '@/lib/search/smartMatch';
import EmptyState from '@/components/ui/EmptyState';

const TYPE_OPTIONS = [
  { label: 'All Types', value: 'all' },
  { label: 'User Updated', value: 'hr.user_updated' },
  { label: 'Role Changed', value: 'hr.role_changed' },
  { label: 'Onboarding Assigned', value: 'hr.onboarding_assigned' },
  { label: 'Onboarding Completed', value: 'hr.onboarding_completed' },
  { label: 'Document Uploaded', value: 'hr.document_uploaded' },
  { label: 'Performance Review Added', value: 'hr.performance_review_added' },
];

type ActivityRecord = {
  id: string;
  type: string;
  title: string;
  description: string;
  createdAt?: string | null;
  createdByName?: string | null;
  entityType?: string | null;
  entityId?: string | null;
};

type SortKey = 'event' | 'actor' | 'summary' | 'timestamp';

type SortDir = 'asc' | 'desc';

const sortIndicator = (active: boolean, dir: SortDir) => (
  <span
    style={{ width: 18, display: 'inline-block', textAlign: 'center', opacity: active ? 1 : 0.35 }}
  >
    {active ? (dir === 'asc' ? '↑' : '↓') : '•'}
  </span>
);

export default function HrActivityPage() {
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('timestamp');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch('/api/hr/activity/list', {
          cache: 'no-store',
          credentials: 'include',
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data?.error || 'Unable to load activity.');
        if (!alive) return;
        setActivity(data.activity || []);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || 'Unable to load activity.');
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

  const filtered = useMemo(() => {
    const byFilters = activity.filter((event) => {
      const matchesType = typeFilter === 'all' ? true : event.type === typeFilter;
      const created = event.createdAt ? new Date(event.createdAt) : null;
      const matchesStart = dateStart && created ? created >= new Date(dateStart) : true;
      const matchesEnd = dateEnd && created ? created <= new Date(`${dateEnd}T23:59:59`) : true;
      return matchesType && matchesStart && matchesEnd;
    });
    return smartMatch(byFilters, search, (event) => [
      event.title,
      event.description,
      event.createdByName,
    ]);
  }, [activity, search, typeFilter, dateStart, dateEnd]);

  const sorted = useMemo(() => {
    const list = [...filtered].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const aVal = getSortValue(a, sortKey);
      const bVal = getSortValue(b, sortKey);
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      return 0;
    });
    return list;
  }, [filtered, sortDir, sortKey]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Activity</h1>
        <p className="page-subtitle mt-2">
          Recent HR events across leave, onboarding, and records.
        </p>
      </div>

      <section className="card" style={{ padding: 18, borderRadius: 18 }}>
        <div style={{ fontSize: 14, color: 'var(--sidebar-text)' }}>
          Audit trail of HR actions across onboarding, users, and documents.
        </div>
        <div className="mt-4 filter-bar filter-bar--search">
          <SmartSearchBar value={search} onChange={setSearch} />
          <MasterSelect value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} />
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
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
            <thead>
              <tr style={{ background: 'var(--table-header-bg)' }}>
                <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 700 }}>
                  <button type="button" className="table-sort" onClick={() => toggleSort('event')}>
                    Event
                    {sortIndicator(sortKey === 'event', sortDir)}
                  </button>
                </th>
                <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 700 }}>
                  <button type="button" className="table-sort" onClick={() => toggleSort('actor')}>
                    Actor
                    {sortIndicator(sortKey === 'actor', sortDir)}
                  </button>
                </th>
                <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 700 }}>
                  <button
                    type="button"
                    className="table-sort"
                    onClick={() => toggleSort('summary')}
                  >
                    Summary
                    {sortIndicator(sortKey === 'summary', sortDir)}
                  </button>
                </th>
                <th style={{ textAlign: 'right', padding: '12px 16px', fontWeight: 700 }}>
                  <button
                    type="button"
                    className="table-sort table-sort--right"
                    onClick={() => toggleSort('timestamp')}
                  >
                    Timestamp
                    {sortIndicator(sortKey === 'timestamp', sortDir)}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: 24 }}>
                    Loading activity…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td
                    colSpan={4}
                    style={{ textAlign: 'center', padding: 24, color: 'var(--danger)' }}
                  >
                    {error}
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <EmptyState
                      variant="table"
                      title="No HR activity yet"
                      description="Leave, onboarding and record changes will appear here."
                    />
                  </td>
                </tr>
              ) : (
                sorted.map((event) => {
                  return (
                    <tr key={event.id}>
                      <td style={{ textAlign: 'left', padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600 }}>{event.title || event.type}</div>
                        <div style={{ fontSize: 12, color: 'var(--sidebar-text)' }}>
                          {event.type}
                        </div>
                      </td>
                      <td style={{ textAlign: 'left', padding: '12px 16px' }}>
                        {event.createdByName || '-'}
                      </td>
                      <td style={{ textAlign: 'left', padding: '12px 16px' }}>
                        {event.description || '-'}
                      </td>
                      <td style={{ textAlign: 'right', padding: '12px 16px' }}>
                        {formatDateTime(event.createdAt)}
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

function getSortValue(event: ActivityRecord, key: SortKey) {
  switch (key) {
    case 'event':
      return String(event.title || event.type || '').toLowerCase();
    case 'actor':
      return String(event.createdByName || '').toLowerCase();
    case 'summary':
      return String(event.description || '').toLowerCase();
    case 'timestamp':
      return event.createdAt ? new Date(event.createdAt).getTime() : 0;
    default:
      return '';
  }
}
