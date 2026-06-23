'use client';

import { useEffect, useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { CHART_COLORS } from '@/lib/charts/palette';

const COLORS = CHART_COLORS;

type ProjectStats = {
  total?: number;
  active?: number;
  completed?: number;
  onHold?: number;
  byStatus?: Record<string, number>;
  byHealth?: Record<string, number>;
};

export default function ReportsProjectsPage() {
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/projects/overview', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setStats(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const statusData = stats?.byStatus
    ? Object.entries(stats.byStatus).map(([name, value]) => ({ name, value }))
    : [
        { name: 'Active', value: stats?.active ?? 0 },
        { name: 'Completed', value: stats?.completed ?? 0 },
        { name: 'On Hold', value: stats?.onHold ?? 0 },
      ];

  if (loading)
    return (
      <div className="page-frame">
        <p className="text-sm text-[var(--text-muted)]">Loading projects report…</p>
      </div>
    );

  return (
    <div className="page-frame space-y-8">
      <div>
        <h1 className="page-title">Projects Report</h1>
        <p className="page-subtitle">Project status, health, and delivery overview.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Total Projects', value: stats?.total ?? '—' },
          { label: 'Active', value: stats?.active ?? '—' },
          { label: 'Completed', value: stats?.completed ?? '—' },
          { label: 'On Hold', value: stats?.onHold ?? '—' },
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
            Projects by Status
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={statusData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {statusData.map((_, i) => (
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
        </div>

        <div className="card p-6">
          <p className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Status Breakdown</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={statusData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8,
                }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {statusData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
