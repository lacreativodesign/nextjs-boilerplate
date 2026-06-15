'use client';

import { useEffect, useMemo, useState } from 'react';
import MasterSelect from '@/components/ui/MasterSelect';
import ProductionProjectDrawer, {
  type ProductionProject,
  type ProductionUserOption,
} from '@/components/production/ProductionProjectDrawer';
import { SmartSearchBar } from '@/components/search/SmartSearchBar';
import { smartMatch } from '@/lib/search/smartMatch';

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

function fmtDate(iso?: string | null) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
}

export default function ProductionQAPage() {
  const [projects, setProjects] = useState<ProductionProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [productionFilter, setProductionFilter] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ProductionProject | null>(null);
  const [productionUsers, setProductionUsers] = useState<ProductionUserOption[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<ProductionUserOption[]>([]);
  const [projectTypes, setProjectTypes] = useState<string[]>([]);

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

  async function loadQA(mountedRef?: { current: boolean }) {
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
        throw new Error(queuePayload?.error || 'Unable to load QA projects.');
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
        const types = Array.from(
          new Set(queuePayload.projects.map((project) => project.projectType).filter(Boolean)),
        ) as string[];
        setProjectTypes(types.sort());
      }
    } catch (err: any) {
      console.error(err);
      if (mountedRef ? mountedRef.current : true)
        setError(err?.message || 'Unable to load QA projects.');
    } finally {
      if (mountedRef ? mountedRef.current : true) setLoading(false);
    }
  }

  useEffect(() => {
    const mountedRef = { current: true };
    void loadQA(mountedRef);
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshQA = () => {
    void loadQA();
  };

  const finalProjects = useMemo(() => {
    const list = projects.filter((project) => {
      if (project.stage !== 'Final') return false;
      if (typeFilter !== 'all' && project.projectType !== typeFilter) return false;
      if (ownerFilter && project.ownerAmUid !== ownerFilter) return false;
      if (productionFilter && project.productionUid !== productionFilter) return false;
      return true;
    });
    return smartMatch(list, search, (project) => [
      project.projectName,
      project.clientName,
      project.ownerAmName,
      project.productionName,
    ]);
  }, [projects, search, typeFilter, ownerFilter, productionFilter]);

  const kpis = useMemo(() => {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return finalProjects.reduce(
      (acc, project) => {
        acc.inFinal += 1;
        if (project.updatedAt) {
          const updated = new Date(project.updatedAt);
          if (!Number.isNaN(updated.getTime()) && updated >= startOfToday) acc.approvedToday += 1;
        }
        return acc;
      },
      { inFinal: 0, approvedToday: 0, sentBack: 0 },
    );
  }, [finalProjects]);

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
        <div style={sectionTitleStyle}>QA Filters</div>
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
          <SmartSearchBar value={search} onChange={setSearch} />
          <MasterSelect
            value={typeFilter}
            onChange={setTypeFilter}
            placeholder="Project Type"
            options={[
              { value: 'all', label: 'All Types' },
              ...projectTypes.map((type) => ({ value: type, label: type })),
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
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <div style={sectionTitleStyle}>QA KPIs</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
          }}
        >
          <KpiCard label="In Final" value={kpis.inFinal} />
          <KpiCard label="Approved Today" value={kpis.approvedToday} />
          <KpiCard label="Sent Back" value={kpis.sentBack} />
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <div style={sectionTitleStyle}>QA & Approvals</div>
        {loading ? (
          <div style={{ fontSize: 14, opacity: 0.7 }}>Loading QA queue…</div>
        ) : error ? (
          <div className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)] mb-4">
            {error}
          </div>
        ) : (
          <div className="table-shell">
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 900 }}
              >
                <thead>
                  <tr>
                    <th style={headerCellStyle}>Project</th>
                    <th style={headerCellStyle}>Client</th>
                    <th style={headerCellStyle}>Production Owner</th>
                    <th style={headerCellStyle}>Owner (AM)</th>
                    <th style={{ ...headerCellStyle, textAlign: 'center' }}>Updated</th>
                    <th style={{ ...headerCellStyle, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {finalProjects.length === 0 ? (
                    <tr>
                      <td style={{ ...cellStyle, textAlign: 'left' }} colSpan={6}>
                        No projects ready for QA.
                      </td>
                    </tr>
                  ) : (
                    finalProjects.map((project) => {
                      return (
                        <tr key={project.id}>
                          <td style={{ ...cellStyle, textAlign: 'left' }}>{project.projectName}</td>
                          <td style={{ ...cellStyle, textAlign: 'left' }}>{project.clientName}</td>
                          <td style={{ ...cellStyle, textAlign: 'left' }}>
                            {project.productionName || 'Unassigned'}
                          </td>
                          <td style={{ ...cellStyle, textAlign: 'left' }}>
                            {project.ownerAmName || 'Unassigned'}
                          </td>
                          <td style={{ ...cellStyle, textAlign: 'center' }}>
                            {fmtDate(project.updatedAt)}
                          </td>
                          <td style={{ ...cellStyle, textAlign: 'center' }}>
                            <button className="btn ghost" onClick={() => openDrawer(project)}>
                              Review
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
        mode="qa"
        onClose={closeDrawer}
        onProjectUpdated={handleProjectUpdated}
        onRefresh={refreshQA}
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
