'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatDate, useInterval } from '@/components/finance/financeUtils';
import MasterSelect from '@/components/ui/MasterSelect';
import {
  CardShell,
  ErrorCard,
  KpiCard,
  MiniBarChart,
  useSortableData,
} from '../_components/ReportsUI';
import { SmartSearchBar } from '@/components/search/SmartSearchBar';
import { smartMatch } from '@/lib/search/smartMatch';
import EmptyState from '@/components/ui/EmptyState';

type DeliveryResponse = {
  projectsByStage: Array<{ stage: string; count: number }>;
  averageStageTime: Array<{ stage: string; avgDays: number }>;
  onTimeVsOverdue: { onTime: number; overdue: number };
  qaPassFail: { pass: number; fail: number; queue: number };
  atRiskProjects: Array<{
    id: string;
    projectName: string;
    clientName: string;
    stage: string;
    priority: string;
    health: string;
    ownerId: string;
    ownerName: string;
    productionOwnerId: string;
    productionOwnerName: string;
    dueDate?: string | null;
    daysLate: number;
  }>;
};

const emptyResponse: DeliveryResponse = {
  projectsByStage: [],
  averageStageTime: [],
  onTimeVsOverdue: { onTime: 0, overdue: 0 },
  qaPassFail: { pass: 0, fail: 0, queue: 0 },
  atRiskProjects: [],
};

const STAGE_OPTIONS = [
  { label: 'All Stages', value: '' },
  { label: 'Deposit', value: 'Deposit' },
  { label: 'Kickoff', value: 'Kickoff' },
  { label: 'Draft', value: 'Draft' },
  { label: 'Review', value: 'Review' },
  { label: 'Revisions', value: 'Revisions' },
  { label: 'Final', value: 'Final' },
  { label: 'Delivered', value: 'Delivered' },
];

const HEALTH_OPTIONS = [
  { label: 'All Health', value: '' },
  { label: 'On Track', value: 'On Track' },
  { label: 'At Risk', value: 'At Risk' },
  { label: 'Overdue', value: 'Overdue' },
];

const PRIORITY_OPTIONS = [
  { label: 'All Priority', value: '' },
  { label: 'Low', value: 'Low' },
  { label: 'Normal', value: 'Normal' },
  { label: 'High', value: 'High' },
  { label: 'Critical', value: 'Critical' },
];

export default function DeliveryReportsPage() {
  const [data, setData] = useState<DeliveryResponse>(emptyResponse);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [stage, setStage] = useState('');
  const [health, setHealth] = useState('');
  const [priority, setPriority] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [productionOwnerId, setProductionOwnerId] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] =
    useState<keyof DeliveryResponse['atRiskProjects'][number]>('daysLate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const loadDelivery = async () => {
    try {
      setError(null);
      setLoading(true);
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (stage) params.set('stage', stage);
      if (health) params.set('health', health);
      if (priority) params.set('priority', priority);
      if (ownerId) params.set('ownerId', ownerId);
      if (productionOwnerId) params.set('productionOwnerId', productionOwnerId);

      const res = await fetch(`/api/admin/reports/delivery?${params.toString()}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        if (res.status === 403) throw new Error('You do not have access to Admin reports.');
        if (res.status === 401) throw new Error('Please sign in again to view reports.');
        throw new Error(json?.error || 'Unable to load delivery reports.');
      }
      setData(json as DeliveryResponse);
    } catch (err: any) {
      console.error('reports delivery load error', err);
      setError('Unable to load delivery performance right now.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDelivery();
  }, [dateFrom, dateTo, stage, health, priority, ownerId, productionOwnerId]);

  useInterval(loadDelivery, 45000);

  const filteredProjects = useMemo(
    () =>
      smartMatch(data.atRiskProjects, search, (project) => [
        project.projectName,
        project.clientName,
        project.stage,
        project.health,
      ]),
    [data.atRiskProjects, search],
  );

  const owners = useMemo(() => {
    const unique = new Map<string, string>();
    data.atRiskProjects.forEach((project) => {
      if (project.ownerId) unique.set(project.ownerId, project.ownerName || project.ownerId);
    });
    return [
      { label: 'All Owners', value: '' },
      ...Array.from(unique.entries()).map(([value, label]) => ({ label, value })),
    ];
  }, [data.atRiskProjects]);

  const productionOwners = useMemo(() => {
    const unique = new Map<string, string>();
    data.atRiskProjects.forEach((project) => {
      if (project.productionOwnerId)
        unique.set(
          project.productionOwnerId,
          project.productionOwnerName || project.productionOwnerId,
        );
    });
    return [
      { label: 'All Production', value: '' },
      ...Array.from(unique.entries()).map(([value, label]) => ({ label, value })),
    ];
  }, [data.atRiskProjects]);

  const sortedProjects = useSortableData(filteredProjects, sortKey, sortDirection);

  const toggleSort = (key: keyof DeliveryResponse['atRiskProjects'][number]) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const totalProjects = data.projectsByStage.reduce((sum, row) => sum + row.count, 0);

  const downloadCsv = (path: string) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (stage) params.set('stage', stage);
    if (health) params.set('health', health);
    if (priority) params.set('priority', priority);
    window.open(`${path}?${params.toString()}`, '_blank');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Delivery Performance</h1>
        <p className="page-subtitle mt-2">On-time delivery, cycle times, and slippage.</p>
      </div>

      {error && <ErrorCard message={error} />}

      <section>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Delivery KPIs</div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Projects in Scope"
            value={`${totalProjects}`}
            subtitle="Filtered pipeline"
          />
          <KpiCard
            title="Overdue Projects"
            value={`${data.onTimeVsOverdue.overdue}`}
            subtitle="Past due"
          />
          <KpiCard
            title="QA Pass/Fail"
            value={`${data.qaPassFail.pass}/${data.qaPassFail.fail}`}
            subtitle="QA outcomes"
          />
          <KpiCard title="QA Queue" value={`${data.qaPassFail.queue}`} subtitle="Final stage" />
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Filters</div>
            <p style={{ fontSize: 13, color: 'var(--sidebar-text)' }}>
              Track delivery performance in real time.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn"
              onClick={() => downloadCsv('/api/admin/reports/exports/projects-by-stage')}
              style={{ borderRadius: 999 }}
            >
              Download Projects by Stage
            </button>
            <button
              className="btn ghost"
              onClick={() => downloadCsv('/api/admin/reports/exports/overdue-projects')}
              style={{ borderRadius: 999 }}
            >
              Download Overdue Projects
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <input
            className="input"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <input
            className="input"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
          <MasterSelect value={stage} onChange={setStage} options={STAGE_OPTIONS} />
          <MasterSelect value={health} onChange={setHealth} options={HEALTH_OPTIONS} />
          <MasterSelect value={priority} onChange={setPriority} options={PRIORITY_OPTIONS} />
          <MasterSelect value={ownerId} onChange={setOwnerId} options={owners} />
          <MasterSelect
            value={productionOwnerId}
            onChange={setProductionOwnerId}
            options={productionOwners}
          />
          <div style={{ flex: '1 1 200px', minWidth: 200 }}>
            <SmartSearchBar value={search} onChange={setSearch} />
          </div>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
              setStage('');
              setHealth('');
              setPriority('');
              setOwnerId('');
              setProductionOwnerId('');
              setSearch('');
            }}
            style={{ borderRadius: 999 }}
          >
            Reset Filters
          </button>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <CardShell>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Projects by Stage</div>
          <MiniBarChart
            rows={(data.projectsByStage.length
              ? data.projectsByStage
              : [{ stage: '-', count: 0 }]
            ).map((row) => ({
              label: row.stage,
              value: row.count,
            }))}
          />
        </CardShell>
        <CardShell>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Average Stage Time (Days)</div>
          <MiniBarChart
            rows={(data.averageStageTime.length
              ? data.averageStageTime
              : [{ stage: '-', avgDays: 0 }]
            ).map((row) => ({
              label: row.stage,
              value: row.avgDays,
            }))}
          />
        </CardShell>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <CardShell>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>On-Time vs Overdue</div>
          <MiniBarChart
            rows={[
              { label: 'On Time', value: data.onTimeVsOverdue.onTime },
              { label: 'Overdue', value: data.onTimeVsOverdue.overdue },
            ]}
          />
        </CardShell>
        <CardShell>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>QA Outcomes</div>
          <MiniBarChart
            rows={[
              { label: 'Pass', value: data.qaPassFail.pass },
              { label: 'Fail', value: data.qaPassFail.fail },
              { label: 'Queue', value: data.qaPassFail.queue },
            ]}
          />
        </CardShell>
      </section>

      <section>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
          At-Risk & Overdue Projects
        </div>
        <div className="card" style={{ padding: 0, borderRadius: 18, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
              <thead>
                <tr style={{ background: 'rgba(148,163,184,0.15)' }}>
                  <th style={{ textAlign: 'left', padding: '14px 16px', fontWeight: 700 }}>
                    <button
                      type="button"
                      onClick={() => toggleSort('projectName')}
                      style={{ background: 'none', border: 'none', fontWeight: 700 }}
                    >
                      Project{' '}
                      {sortKey === 'projectName' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </button>
                  </th>
                  <th style={{ textAlign: 'left', padding: '14px 16px', fontWeight: 700 }}>
                    Client
                  </th>
                  <th style={{ textAlign: 'center', padding: '14px 16px', fontWeight: 700 }}>
                    Stage
                  </th>
                  <th style={{ textAlign: 'center', padding: '14px 16px', fontWeight: 700 }}>
                    Health
                  </th>
                  <th style={{ textAlign: 'right', padding: '14px 16px', fontWeight: 700 }}>
                    <button
                      type="button"
                      onClick={() => toggleSort('daysLate')}
                      style={{ background: 'none', border: 'none', fontWeight: 700 }}
                    >
                      Days Late{' '}
                      {sortKey === 'daysLate' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </button>
                  </th>
                  <th style={{ textAlign: 'right', padding: '14px 16px', fontWeight: 700 }}>
                    Due Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 40 }}>
                      Loading projects…
                    </td>
                  </tr>
                ) : sortedProjects.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        variant="table"
                        title="Nothing at risk"
                        description="Every project in this period is tracking to its delivery date."
                      />
                    </td>
                  </tr>
                ) : (
                  sortedProjects.map((project, idx) => {
                    const rowBg = idx % 2 === 0 ? 'rgba(15,23,42,0.02)' : 'transparent';
                    return (
                      <tr key={project.id} style={{ background: rowBg }}>
                        <td style={{ padding: '14px 16px', textAlign: 'left' }}>
                          {project.projectName}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'left' }}>
                          {project.clientName}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                          {project.stage}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                          {project.health}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          {project.daysLate}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          {formatDate(project.dueDate)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
