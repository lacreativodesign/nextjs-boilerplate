'use client';

import { useEffect, useMemo, useState } from 'react';
import ProductionProjectDrawer, {
  type ProductionProject,
  type ProductionUserOption,
} from '@/components/production/ProductionProjectDrawer';

const ACTIVE_STAGES = ['Draft', 'Review', 'Revisions', 'Final'] as const;

type OverviewPayload = {
  ok: boolean;
  projects: ProductionProject[];
  kpis: Record<string, number>;
  myQueue: ProductionProject[];
  error?: string;
};

type UserRecord = {
  uid: string;
  name?: string;
  role?: string;
};

function fmtDate(iso?: string | null) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
}

export default function ProductionOverviewPage() {
  const [projects, setProjects] = useState<ProductionProject[]>([]);
  const [kpis, setKpis] = useState<Record<string, number>>({});
  const [myQueue, setMyQueue] = useState<ProductionProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ProductionProject | null>(null);
  const [productionUsers, setProductionUsers] = useState<ProductionUserOption[]>([]);

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

  async function loadOverview(mountedRef?: { current: boolean }) {
    const mounted = mountedRef ? mountedRef.current : true;
    if (!mounted) return;
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, usersRes] = await Promise.all([
        fetch('/api/admin/production/overview', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/admin/users/list', { credentials: 'include', cache: 'no-store' }),
      ]);
      const overviewPayload = (await overviewRes.json()) as OverviewPayload;
      const usersPayload = await usersRes.json();

      if (!overviewRes.ok || !overviewPayload.ok) {
        throw new Error(overviewPayload?.error || 'Unable to load production overview.');
      }

      if (mountedRef ? mountedRef.current : true) {
        setProjects(overviewPayload.projects || []);
        setKpis(overviewPayload.kpis || {});
        setMyQueue(overviewPayload.myQueue || []);
        const users = (usersPayload?.users || []) as UserRecord[];
        const options = users
          .filter((user) => (user.role || '').toLowerCase() === 'production')
          .map((user) => ({ value: user.uid, label: user.name || user.uid }));
        setProductionUsers(options);
      }
    } catch (err: any) {
      console.error(err);
      if (mountedRef ? mountedRef.current : true)
        setError(err?.message || 'Unable to load overview.');
    } finally {
      if (mountedRef ? mountedRef.current : true) setLoading(false);
    }
  }

  useEffect(() => {
    const mountedRef = { current: true };
    void loadOverview(mountedRef);
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshOverview = () => {
    void loadOverview();
  };

  const activeProjects = useMemo(() => {
    return projects.filter((project) =>
      ACTIVE_STAGES.includes(project.stage as (typeof ACTIVE_STAGES)[number]),
    );
  }, [projects]);

  const queueRows = useMemo(() => {
    const base = myQueue.length
      ? myQueue
      : [...activeProjects].sort((a, b) =>
          String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')),
        );
    return base.slice(0, 10);
  }, [myQueue, activeProjects]);

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
    setMyQueue((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    if (selected?.id === updated.id) setSelected(updated);
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 className="page-title">Overview</h1>
        <p className="page-subtitle mt-2">
          Workload, QA queue, and delivery readiness across production.
        </p>
      </div>

      {loading ? (
        <div style={{ fontSize: 14, opacity: 0.7 }}>Loading production overview…</div>
      ) : error ? (
        <div className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)] mb-4">
          {error}
        </div>
      ) : (
        <>
          <section style={{ display: 'grid', gap: 12 }}>
            <div style={sectionTitleStyle}>Overview</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
              }}
            >
              <KpiCard label="Assigned to Production" value={kpis.assigned || 0} />
              <KpiCard label="In Draft" value={kpis.draft || 0} />
              <KpiCard label="In Review" value={kpis.review || 0} />
              <KpiCard label="In Revisions" value={kpis.revisions || 0} />
              <KpiCard label="In Final" value={kpis.final || 0} />
              <KpiCard label="At Risk" value={kpis.atRisk || 0} />
              <KpiCard label="Overdue" value={kpis.overdue || 0} />
              <KpiCard label="Delivered (7d)" value={kpis.delivered7 || 0} />
            </div>
          </section>

          <section style={{ display: 'grid', gap: 12 }}>
            <div style={sectionTitleStyle}>My Queue (Top 10)</div>
            <div className="table-shell">
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 720 }}
                >
                  <thead>
                    <tr>
                      <th style={headerCellStyle}>Project</th>
                      <th style={headerCellStyle}>Client</th>
                      <th style={{ ...headerCellStyle, textAlign: 'center' }}>Stage</th>
                      <th style={{ ...headerCellStyle, textAlign: 'center' }}>Due Date</th>
                      <th style={{ ...headerCellStyle, textAlign: 'center' }}>Updated</th>
                      <th style={{ ...headerCellStyle, textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queueRows.length === 0 ? (
                      <tr>
                        <td style={{ ...cellStyle, textAlign: 'left' }} colSpan={6}>
                          No production projects yet.
                        </td>
                      </tr>
                    ) : (
                      queueRows.map((project) => {
                        return (
                          <tr key={project.id}>
                            <td style={{ ...cellStyle, textAlign: 'left' }}>
                              <div style={{ fontWeight: 600 }}>{project.projectName}</div>
                              <div style={{ fontSize: 12, opacity: 0.65 }}>
                                {project.productionName || 'Unassigned'}
                              </div>
                            </td>
                            <td style={{ ...cellStyle, textAlign: 'left' }}>
                              {project.clientName}
                            </td>
                            <td style={{ ...cellStyle, textAlign: 'center' }}>{project.stage}</td>
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
          </section>
        </>
      )}

      <ProductionProjectDrawer
        open={drawerOpen}
        project={selected}
        productionUsers={productionUsers}
        onClose={closeDrawer}
        onProjectUpdated={handleProjectUpdated}
        onRefresh={refreshOverview}
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
