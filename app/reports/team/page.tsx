'use client';

import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { CHART_COLORS } from '@/lib/charts/palette';

const COLORS = CHART_COLORS;

type TeamStats = {
  totalEmployees?: number;
  activeEmployees?: number;
  departments?: Record<string, number>;
  roles?: Record<string, number>;
};

export default function ReportsTeamPage() {
  const [stats, setStats] = useState<TeamStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/hr/overview', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setStats(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const deptData = stats?.departments
    ? Object.entries(stats.departments).map(([name, value]) => ({ name, value }))
    : [];

  const roleData = stats?.roles
    ? Object.entries(stats.roles).map(([name, value]) => ({ name, value }))
    : [];

  if (loading)
    return (
      <div className="page-frame">
        <p className="text-sm text-[var(--text-muted)]">Loading team report…</p>
      </div>
    );

  return (
    <div className="page-frame space-y-8">
      <div>
        <h1 className="page-title">Team Report</h1>
        <p className="page-subtitle">Headcount, departments, and role distribution.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Total Employees', value: stats?.totalEmployees ?? '—' },
          { label: 'Active', value: stats?.activeEmployees ?? '—' },
          { label: 'Departments', value: deptData.length || '—' },
          { label: 'Roles', value: roleData.length || '—' },
        ].map((kpi) => (
          <div key={kpi.label} className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)]">
              {kpi.label}
            </p>
            <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <p className="mb-4 text-sm font-semibold text-[var(--text-primary)]">
            Headcount by Department
          </p>
          {deptData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={deptData} margin={{ top: 5, right: 20, left: 0, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  angle={-30}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {deptData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">No department data yet.</p>
          )}
        </div>

        <div className="card p-6">
          <p className="mb-4 text-sm font-semibold text-[var(--text-primary)]">
            Team Role Distribution
          </p>
          {roleData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={roleData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                >
                  {roleData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 8,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">No role data yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
