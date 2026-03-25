'use client';

import { useEffect, useMemo, useState } from 'react';

type ActivityEntry = {
  id: string;
  projectId: string;
  projectName: string;
  clientName: string;
  fromStage?: string;
  toStage?: string;
  byName?: string;
  at?: string | null;
};

type OverviewPayload = {
  ok: boolean;
  recentActivityTop10: ActivityEntry[];
};

function fmtDateTime(iso?: string | null) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export default function ProductionActivityPage() {
  const [rows, setRows] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

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

  async function loadActivity(mountedRef?: { current: boolean }) {
    const mounted = mountedRef ? mountedRef.current : true;
    if (!mounted) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/production/overview', {
        credentials: 'include',
        cache: 'no-store',
      });
      const payload = (await res.json()) as OverviewPayload;
      if (!res.ok || !payload.ok) {
        throw new Error(payload?.error || 'Unable to load activity.');
      }
      if (mountedRef ? mountedRef.current : true) {
        setRows(payload.recentActivityTop10 || []);
      }
    } catch (err: any) {
      console.error(err);
      if (mountedRef ? mountedRef.current : true)
        setError(err?.message || 'Unable to load activity.');
    } finally {
      if (mountedRef ? mountedRef.current : true) setLoading(false);
    }
  }

  useEffect(() => {
    const mountedRef = { current: true };
    void loadActivity(mountedRef);
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((item) => {
      const hay = [item.projectName, item.clientName, item.byName, item.fromStage, item.toStage]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <section style={{ display: 'grid', gap: 12 }}>
        <div style={sectionTitleStyle}>Activity</div>
        <div
          className="card"
          style={{
            padding: 14,
            borderRadius: 16,
            background: 'var(--surface-card)',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-md)',
            display: 'grid',
            gridTemplateColumns: 'minmax(220px, 1.3fr)',
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
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <div style={sectionTitleStyle}>Recent Activity</div>
        {loading ? (
          <div style={{ fontSize: 14, opacity: 0.7 }}>Loading activity…</div>
        ) : error ? (
          <div className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)] mb-4">
            {error}
          </div>
        ) : (
          <div className="table-shell">
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 720 }}
              >
                <thead>
                  <tr>
                    <th style={headerCellStyle}>Project</th>
                    <th style={headerCellStyle}>Update</th>
                    <th style={{ ...headerCellStyle, textAlign: 'center' }}>Stage</th>
                    <th style={{ ...headerCellStyle, textAlign: 'center' }}>When</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td style={{ ...cellStyle, textAlign: 'left' }} colSpan={4}>
                        No activity matches your filters.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((item) => {
                      return (
                        <tr key={item.id}>
                          <td style={{ ...cellStyle, textAlign: 'left' }}>
                            {item.projectName || 'Project'}
                            <div style={{ fontSize: 12, opacity: 0.65 }}>{item.clientName}</div>
                          </td>
                          <td style={{ ...cellStyle, textAlign: 'left' }}>
                            {item.byName ? `${item.byName} moved stage` : 'Stage updated'}
                          </td>
                          <td style={{ ...cellStyle, textAlign: 'center' }}>
                            {item.fromStage || '-'} → {item.toStage || '-'}
                          </td>
                          <td style={{ ...cellStyle, textAlign: 'center' }}>
                            {fmtDateTime(item.at)}
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
    </div>
  );
}
