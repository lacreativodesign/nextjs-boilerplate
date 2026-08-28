'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatUsd } from '@/components/finance/financeUtils';
import EmptyState from '@/components/ui/EmptyState';

type TeamMember = {
  uid: string;
  name: string;
  email: string;
  leadsAssigned: number;
  dealsAssigned: number;
  closedWon: number;
  closedLost: number;
  revenueWon: number;
};

type TeamResponse = { ok: boolean; team: TeamMember[] };

export default function SalesManagerTeamPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<TeamMember[]>([]);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/sales_manager/team', { cache: 'no-store' });
        const json = (await res.json()) as TeamResponse;
        if (!res.ok || !json.ok) {
          throw new Error(json?.ok ? '' : 'Failed to load team');
        }
        if (!alive) return;
        setRows(Array.isArray(json.team) ? json.team : []);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || 'Unable to load team.');
        setRows([]);
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

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => b.revenueWon - a.revenueWon);
  }, [rows]);

  return (
    <div style={{ width: '100%' }}>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Team</h1>
          <p className="page-subtitle" style={{ marginTop: 6 }}>
            Sales reps, assignment counts, and performance snapshots.
          </p>
        </div>
      </div>

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
          {error}
        </div>
      )}

      <div className="table-shell">
        {loading ? (
          <p style={{ fontSize: 14, color: 'rgba(15,23,42,0.70)' }}>Loading team...</p>
        ) : sortedRows.length === 0 ? (
          <EmptyState
            variant="table"
            title="No sales reps yet"
            description="Assign reps to your team to see their performance."
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 980 }}
            >
              <thead>
                <tr>
                  <th style={headerCellStyle}>Rep</th>
                  <th style={{ ...headerCellStyle, textAlign: 'center' }}>Leads</th>
                  <th style={{ ...headerCellStyle, textAlign: 'center' }}>Deals</th>
                  <th style={{ ...headerCellStyle, textAlign: 'center' }}>Closed Won</th>
                  <th style={{ ...headerCellStyle, textAlign: 'center' }}>Closed Lost</th>
                  <th style={{ ...headerCellStyle, textAlign: 'right' }}>Revenue Won</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr key={row.uid}>
                    <td style={{ ...cellStyle, whiteSpace: 'normal' }}>
                      <div style={{ fontWeight: 700 }}>{row.name}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>{row.email}</div>
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'center' }}>{row.leadsAssigned}</td>
                    <td style={{ ...cellStyle, textAlign: 'center' }}>{row.dealsAssigned}</td>
                    <td style={{ ...cellStyle, textAlign: 'center' }}>{row.closedWon}</td>
                    <td style={{ ...cellStyle, textAlign: 'center' }}>{row.closedLost}</td>
                    <td style={{ ...cellStyle, textAlign: 'right' }}>
                      {formatUsd(row.revenueWon)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
