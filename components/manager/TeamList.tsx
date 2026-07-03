'use client';
import { useEffect, useState } from 'react';

type TeamMember = {
  uid: string;
  name: string;
  email: string;
  role?: string;
  // Sales-only metrics (feature-detected — may be absent for am/production teams).
  leadsAssigned?: number;
  dealsAssigned?: number;
  closedWon?: number;
  closedLost?: number;
  revenueWon?: number;
};

type TeamListProps = {
  endpoint: string;
  title?: string;
};

const fmt = (n: number) => n.toLocaleString();
const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);

export default function TeamList({ endpoint, title = 'My Team' }: TeamListProps) {
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(endpoint, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.ok) setTeam(Array.isArray(d.team) ? d.team : []);
        else setError(d.error || 'Failed to load');
      })
      .catch(() => {
        if (!cancelled) setError('Network error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  // Feature-detect sales-only metric columns — only show them when at least
  // one member actually carries the field (am/production teams won't).
  const showSalesMetrics = !!team && team.some((m) => typeof m.leadsAssigned === 'number');

  return (
    <div className="card space-y-4">
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>

      {loading && <div className="text-[var(--text-muted)]">…</div>}

      {!loading && error && <div className="text-sm text-red-400">{error}</div>}

      {!loading && !error && team && team.length === 0 && (
        <p className="helper-text">
          No direct reports yet. Assign team members from User Management.
        </p>
      )}

      {!loading && !error && team && team.length > 0 && (
        <div className="table-shell">
          <div>
            <table className="table-card">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  {showSalesMetrics && (
                    <>
                      <th className="table-cell-right">Leads</th>
                      <th className="table-cell-right">Deals</th>
                      <th className="table-cell-right">Won</th>
                      <th className="table-cell-right">Lost</th>
                      <th className="table-cell-right">Revenue Won</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {team.map((m) => (
                  <tr key={m.uid}>
                    <td className="table-card-primary" data-label="Name">
                      {m.name}
                    </td>
                    <td data-label="Email">{m.email || '—'}</td>
                    <td data-label="Role">{m.role || '—'}</td>
                    {showSalesMetrics && (
                      <>
                        <td className="table-cell-right" data-label="Leads">
                          {fmt(m.leadsAssigned ?? 0)}
                        </td>
                        <td className="table-cell-right" data-label="Deals">
                          {fmt(m.dealsAssigned ?? 0)}
                        </td>
                        <td className="table-cell-right" data-label="Won">
                          {fmt(m.closedWon ?? 0)}
                        </td>
                        <td className="table-cell-right" data-label="Lost">
                          {fmt(m.closedLost ?? 0)}
                        </td>
                        <td className="table-cell-right" data-label="Revenue Won">
                          {fmtCurrency(m.revenueWon ?? 0)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
