'use client';

import { useEffect, useMemo, useState } from 'react';
import MasterSelect from '@/components/ui/MasterSelect';
import ProductionProjectDrawer, {
  type ProductionProject,
  type ProductionUserOption,
} from '@/components/production/ProductionProjectDrawer';

const ACTIVE_STAGES = ['Draft', 'Review', 'Revisions', 'Final'] as const;
const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'] as const;
const HEALTH_OPTIONS = ['On Track', 'At Risk', 'Overdue'] as const;

type QueuePayload = {
  ok: boolean;
  projects: ProductionProject[];
  error?: string;
};

type UserRecord = {
  uid: string;
  name?: string;
  role?: string;
};

type SortKey =
  | 'projectName'
  | 'clientName'
  | 'stage'
  | 'priority'
  | 'health'
  | 'dueDate'
  | 'owner'
  | 'production'
  | 'updatedAt';

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
  const [ownerFilter, setOwnerFilter] = useState('');
  const [productionFilter, setProductionFilter] = useState('');
  const [dueFilter, setDueFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ProductionProject | null>(null);
  const [productionUsers, setProductionUsers] = useState<ProductionUserOption[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<ProductionUserOption[]>([]);

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text-primary)',
  };

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

  async function loadQueue(mountedRef?: { current: boolean }) {
    const mounted = mountedRef ? mountedRef.current : true;
    if (!mounted) return;
    setLoading(true);
    setError(null);
    try {
      const [queueRes, usersRes] = await Promise.all([
        fetch('/api/admin/production/queue', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/admin/users/list', { credentials: 'include', cache: 'no-store' }),
      ]);
      const queuePayload = (await queueRes.json()) as QueuePayload;
      const usersPayload = await usersRes.json();

      if (!queueRes.ok || !queuePayload.ok) {
        throw new Error(queuePayload?.error || 'Unable to load queue.');
      }

      if (mountedRef ? mountedRef.current : true) {
        setProjects(queuePayload.projects || []);
        const users = (usersPayload?.users || []) as UserRecord[];
        const production = users
          .filter((user) => (user.role || '').toLowerCase() === 'production')
          .map((user) => ({ value: user.uid, label: user.name || user.uid }));
        const owners = users
          .filter((user) =>
            ['am', 'admin', 'super_admin'].includes((user.role || '').toLowerCase()),
          )
          .map((user) => ({ value: user.uid, label: user.name || user.uid }));
        setProductionUsers(production);
        setOwnerOptions(owners);
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
    const q = search.trim().toLowerCase();
    return projects.filter((project) => {
      if (!ACTIVE_STAGES.includes(project.stage as (typeof ACTIVE_STAGES)[number])) return false;
      if (stageFilter !== 'all' && project.stage !== stageFilter) return false;
      if (priorityFilter !== 'all' && project.priority !== priorityFilter) return false;
      if (healthFilter !== 'all' && project.health !== healthFilter) return false;
      if (ownerFilter && project.ownerAmUid !== ownerFilter) return false;
      if (productionFilter && project.productionUid !== productionFilter) return false;
      if (dueFilter === 'overdue' && !isOverdue(project.dueDate)) return false;
      if (dueFilter === 'week' && !isDueThisWeek(project.dueDate)) return false;
      if (q) {
        const hay = [
          project.projectName,
          project.clientName,
          project.ownerAmName,
          project.productionName,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    projects,
    search,
    stageFilter,
    priorityFilter,
    healthFilter,
    ownerFilter,
    productionFilter,
    dueFilter,
  ]);

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
        case 'owner':
          return project.ownerAmName || '';
        case 'production':
          return project.productionName || '';
        case 'updatedAt':
          return project.updatedAt || '';
        default:
          return '';
      }
    };
    return [...filtered].sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, project) => {
        acc.total += 1;
        if (project.health === 'At Risk') acc.atRisk += 1;
        if (project.health === 'Overdue') acc.overdue += 1;
        if (isDueThisWeek(project.dueDate)) acc.dueWeek += 1;
        return acc;
      },
      { total: 0, atRisk: 0, overdue: 0, dueWeek: 0 },
    );
  }, [filtered]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'updatedAt' ? 'desc' : 'asc');
    }
  }

  const sortBadge = (key: SortKey) => (key !== sortKey ? '' : sortDir === 'asc' ? '▲' : '▼');

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
      <section style={{ display: 'grid', gap: 12 }}>
        <div style={sectionTitleStyle}>Queue Filters</div>
        <div
          className="card"
          style={{
            padding: 14,
            borderRadius: 16,
            background: 'var(--surface-card)',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-md)',
            display: 'grid',
            gridTemplateColumns: 'minmax(220px, 1.3fr) repeat(auto-fit, minmax(170px, 1fr))',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <input
            className="input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search keyword"
          />
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
          <MasterSelect
            value={ownerFilter}
            onChange={setOwnerFilter}
            placeholder="Owner (AM)"
            options={[{ value: '', label: 'All Owners' }, ...ownerOptions]}
          />
          <MasterSelect
            value={productionFilter}
            onChange={setProductionFilter}
            placeholder="Production Owner"
            options={[{ value: '', label: 'All Production' }, ...productionUsers]}
          />
          <MasterSelect
            value={dueFilter}
            onChange={setDueFilter}
            placeholder="Due Range"
            options={[
              { value: 'all', label: 'All Due Dates' },
              { value: 'week', label: 'Due this week' },
              { value: 'overdue', label: 'Overdue' },
            ]}
          />
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <div style={sectionTitleStyle}>Queue KPIs</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
          }}
        >
          <KpiCard label="Total in Queue" value={totals.total} />
          <KpiCard label="At Risk" value={totals.atRisk} />
          <KpiCard label="Overdue" value={totals.overdue} />
          <KpiCard label="Due This Week" value={totals.dueWeek} />
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <div style={sectionTitleStyle}>Queue</div>
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
                style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 1200 }}
              >
                <thead>
                  <tr>
                    <th style={headerCellStyle} onClick={() => toggleSort('projectName')}>
                      Project {sortBadge('projectName')}
                    </th>
                    <th style={headerCellStyle} onClick={() => toggleSort('clientName')}>
                      Client {sortBadge('clientName')}
                    </th>
                    <th
                      style={{ ...headerCellStyle, textAlign: 'center' }}
                      onClick={() => toggleSort('stage')}
                    >
                      Stage {sortBadge('stage')}
                    </th>
                    <th
                      style={{ ...headerCellStyle, textAlign: 'center' }}
                      onClick={() => toggleSort('priority')}
                    >
                      Priority {sortBadge('priority')}
                    </th>
                    <th
                      style={{ ...headerCellStyle, textAlign: 'center' }}
                      onClick={() => toggleSort('health')}
                    >
                      Health {sortBadge('health')}
                    </th>
                    <th
                      style={{ ...headerCellStyle, textAlign: 'center' }}
                      onClick={() => toggleSort('dueDate')}
                    >
                      Due Date {sortBadge('dueDate')}
                    </th>
                    <th style={headerCellStyle} onClick={() => toggleSort('owner')}>
                      Owner (AM) {sortBadge('owner')}
                    </th>
                    <th style={headerCellStyle} onClick={() => toggleSort('production')}>
                      Production Owner {sortBadge('production')}
                    </th>
                    <th
                      style={{ ...headerCellStyle, textAlign: 'center' }}
                      onClick={() => toggleSort('updatedAt')}
                    >
                      Updated {sortBadge('updatedAt')}
                    </th>
                    <th style={{ ...headerCellStyle, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.length === 0 ? (
                    <tr>
                      <td style={{ ...cellStyle, textAlign: 'left' }} colSpan={10}>
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
                          <td style={{ ...cellStyle, textAlign: 'left' }}>
                            {project.ownerAmName || 'Unassigned'}
                          </td>
                          <td style={{ ...cellStyle, textAlign: 'left' }}>
                            {project.productionName || 'Unassigned'}
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
        productionUsers={productionUsers}
        onClose={closeDrawer}
        onProjectUpdated={handleProjectUpdated}
        onRefresh={refreshQueue}
      />
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card kpi-card" style={{ padding: '16px 18px', borderRadius: 16 }}>
      <div
        style={{
          fontSize: 12,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{value}</div>
    </div>
  );
}
