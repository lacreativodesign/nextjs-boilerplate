'use client';

import { useEffect, useMemo, useState } from 'react';
import MasterSelect from '@/components/ui/MasterSelect';
import ProductionProjectDrawer, {
  type ProductionProject,
} from '@/components/production/ProductionProjectDrawer';
import { SmartSearchBar } from '@/components/search/SmartSearchBar';
import { smartMatch } from '@/lib/search/smartMatch';

const ACTIVE_STAGES = ['Draft', 'Review', 'Revisions', 'Final'] as const;
const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'] as const;
const HEALTH_OPTIONS = ['On Track', 'At Risk', 'Overdue'] as const;

type QueuePayload = {
  ok: boolean;
  error?: string;
  projects: ProductionProject[];
};

type SortKey =
  'projectName' | 'clientName' | 'stage' | 'priority' | 'health' | 'dueDate' | 'updatedAt';

type SortDir = 'asc' | 'desc';

function fmtDate(iso?: string | null) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
}

function isOverdue(iso?: string | null) {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return date.getTime() < startOfToday.getTime();
}

function isDueThisWeek(iso?: string | null) {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = date.getTime() - startOfToday.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= 7;
}

export default function ProductionQueuePage() {
  const [projects, setProjects] = useState<ProductionProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [healthFilter, setHealthFilter] = useState('all');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ProductionProject | null>(null);

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
    borderBottom: '1px dashed var(--border-subtle)',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    fontWeight: 400,
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

  async function loadQueue(mountedRef?: { current: boolean }) {
    const mounted = mountedRef ? mountedRef.current : true;
    if (!mounted) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/production/queue', {
        credentials: 'include',
        cache: 'no-store',
      });
      const payload = (await res.json()) as QueuePayload;

      if (!res.ok || !payload.ok) {
        throw new Error(payload?.error || 'Unable to load queue.');
      }

      if (mountedRef ? mountedRef.current : true) {
        setProjects(payload.projects || []);
      }
    } catch (err: any) {
      console.error(err);
      if (mountedRef ? mountedRef.current : true) setError(err?.message || 'Unable to load queue.');
    } finally {
      if (mountedRef ? mountedRef.current : true) setLoading(false);
    }
  }

  useEffect(() => {
    const mountedRef = { current: true };
    void loadQueue(mountedRef);
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshQueue = () => {
    void loadQueue();
  };

  const filtered = useMemo(() => {
    const byFilters = projects.filter((project) => {
      if (!ACTIVE_STAGES.includes(project.stage as (typeof ACTIVE_STAGES)[number])) return false;
      if (stageFilter !== 'all' && project.stage !== stageFilter) return false;
      if (priorityFilter !== 'all' && project.priority !== priorityFilter) return false;
      if (healthFilter !== 'all' && project.health !== healthFilter) return false;
      if (dueFrom) {
        const fromDate = new Date(dueFrom);
        if (!Number.isNaN(fromDate.getTime())) {
          const due = project.dueDate ? new Date(project.dueDate) : null;
          if (!due || Number.isNaN(due.getTime()) || due < fromDate) return false;
        }
      }
      if (dueTo) {
        const toDate = new Date(dueTo);
        if (!Number.isNaN(toDate.getTime())) {
          const due = project.dueDate ? new Date(project.dueDate) : null;
          if (!due || Number.isNaN(due.getTime()) || due > toDate) return false;
        }
      }
      return true;
    });
    return smartMatch(byFilters, search, (project) => [project.projectName, project.clientName]);
  }, [projects, search, stageFilter, priorityFilter, healthFilter, dueFrom, dueTo]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const getValue = (project: ProductionProject) => {
      switch (sortKey) {
        case 'projectName':
          return project.projectName || '';
        case 'clientName':
          return project.clientName || '';
        case 'stage':
          return project.stage || '';
        case 'priority':
          return project.priority || '';
        case 'health':
          return project.health || '';
        case 'dueDate':
          return project.dueDate || '';
        case 'updatedAt':
          return project.updatedAt || '';
        default:
          return project.updatedAt || '';
      }
    };
    return [...filtered].sort(
      (a, b) => String(getValue(a)).localeCompare(String(getValue(b))) * dir,
    );
  }, [filtered, sortDir, sortKey]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, project) => {
        acc.total += 1;
        if (project.health === 'At Risk') acc.atRisk += 1;
        if (isOverdue(project.dueDate)) acc.overdue += 1;
        if (isDueThisWeek(project.dueDate)) acc.dueWeek += 1;
        return acc;
      },
      { total: 0, atRisk: 0, overdue: 0, dueWeek: 0 },
    );
  }, [filtered]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sortBadge = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? '▲' : '▼';
  };

  function openDrawer(project: ProductionProject) {
    setSelected(project);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSelected(null);
  }

  function handleProjectUpdated(updated: ProductionProject) {
    setProjects((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    if (selected?.id === updated.id) setSelected(updated);
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 className="page-title">Jobs</h1>
        <p className="page-subtitle mt-2">The production queue, filtered and prioritised.</p>
      </div>

      <section style={{ display: 'grid', gap: 12 }}>
        <h2 className="section-title mb-2">Filters</h2>
        <div
          className="card"
          style={{
            padding: 14,
            borderRadius: 16,
            background: 'var(--surface-card)',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-md)',
            display: 'grid',
            gridTemplateColumns: 'minmax(220px, 1.3fr) repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <SmartSearchBar value={search} onChange={setSearch} placeholder="Search keyword" />
          <MasterSelect
            value={stageFilter}
            onChange={setStageFilter}
            placeholder="Stage"
            options={[
              { value: 'all', label: 'All Stages' },
              ...ACTIVE_STAGES.map((stage) => ({ value: stage, label: stage })),
            ]}
          />
          <MasterSelect
            value={priorityFilter}
            onChange={setPriorityFilter}
            placeholder="Priority"
            options={[
              { value: 'all', label: 'All Priorities' },
              ...PRIORITIES.map((p) => ({ value: p, label: p })),
            ]}
          />
          <MasterSelect
            value={healthFilter}
            onChange={setHealthFilter}
            placeholder="Health"
            options={[
              { value: 'all', label: 'All Health' },
              ...HEALTH_OPTIONS.map((h) => ({ value: h, label: h })),
            ]}
          />
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 11, textTransform: 'uppercase', opacity: 0.7 }}>
              Due range
            </label>
            <div style={{ display: 'grid', gap: 8 }}>
              <input
                className="input"
                type="date"
                value={dueFrom}
                onChange={(event) => setDueFrom(event.target.value)}
              />
              <input
                className="input"
                type="date"
                value={dueTo}
                onChange={(event) => setDueTo(event.target.value)}
              />
            </div>
          </div>
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <h2 className="section-title mb-2">Queue KPIs</h2>
        <div className="kpis">
          <KpiCard label="Total Assigned" value={totals.total} />
          <KpiCard label="At Risk" value={totals.atRisk} />
          <KpiCard label="Overdue" value={totals.overdue} />
          <KpiCard label="Due This Week" value={totals.dueWeek} />
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <h2 className="section-title mb-2">My Queue</h2>
        {loading ? (
          <div style={{ fontSize: 14, opacity: 0.7 }}>Loading queue…</div>
        ) : error ? (
          <div className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)] mb-4">
            {error}
          </div>
        ) : (
          <div className="table-shell">
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 980 }}
              >
                <thead>
                  <tr>
                    <th style={headerCellStyle} onClick={() => toggleSort('projectName')}>
                      {headerLabel('Project', sortBadge('projectName'))}
                    </th>
                    <th style={headerCellStyle} onClick={() => toggleSort('clientName')}>
                      {headerLabel('Client', sortBadge('clientName'))}
                    </th>
                    <th
                      style={{ ...headerCellStyle, textAlign: 'center' }}
                      onClick={() => toggleSort('stage')}
                    >
                      {headerLabel('Stage', sortBadge('stage'))}
                    </th>
                    <th
                      style={{ ...headerCellStyle, textAlign: 'center' }}
                      onClick={() => toggleSort('priority')}
                    >
                      {headerLabel('Priority', sortBadge('priority'))}
                    </th>
                    <th
                      style={{ ...headerCellStyle, textAlign: 'center' }}
                      onClick={() => toggleSort('health')}
                    >
                      {headerLabel('Health', sortBadge('health'))}
                    </th>
                    <th
                      style={{ ...headerCellStyle, textAlign: 'center' }}
                      onClick={() => toggleSort('dueDate')}
                    >
                      {headerLabel('Due', sortBadge('dueDate'))}
                    </th>
                    <th
                      style={{ ...headerCellStyle, textAlign: 'center' }}
                      onClick={() => toggleSort('updatedAt')}
                    >
                      {headerLabel('Updated', sortBadge('updatedAt'))}
                    </th>
                    <th style={{ ...headerCellStyle, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.length === 0 ? (
                    <tr>
                      <td style={{ ...cellStyle, textAlign: 'left' }} colSpan={8}>
                        No projects match these filters.
                      </td>
                    </tr>
                  ) : (
                    sorted.map((project) => {
                      return (
                        <tr key={project.id}>
                          <td style={{ ...cellStyle, textAlign: 'left' }}>{project.projectName}</td>
                          <td style={{ ...cellStyle, textAlign: 'left' }}>{project.clientName}</td>
                          <td style={{ ...cellStyle, textAlign: 'center' }}>{project.stage}</td>
                          <td style={{ ...cellStyle, textAlign: 'center' }}>{project.priority}</td>
                          <td style={{ ...cellStyle, textAlign: 'center' }}>{project.health}</td>
                          <td style={{ ...cellStyle, textAlign: 'center' }}>
                            {fmtDate(project.dueDate)}
                          </td>
                          <td style={{ ...cellStyle, textAlign: 'center' }}>
                            {fmtDate(project.updatedAt)}
                          </td>
                          <td style={{ ...cellStyle, textAlign: 'center' }}>
                            <button className="btn ghost" onClick={() => openDrawer(project)}>
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
          </div>
        )}
      </section>

      <ProductionProjectDrawer
        open={drawerOpen}
        project={selected}
        productionUsers={[]}
        onClose={closeDrawer}
        onProjectUpdated={handleProjectUpdated}
        onRefresh={refreshQueue}
        role="production"
      />
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card kpi-card">
      <p className="helper-text mb-1">{label}</p>
      <p className="text-3xl font-bold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}
