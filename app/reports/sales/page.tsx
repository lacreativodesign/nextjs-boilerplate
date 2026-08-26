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

type SalesStats = {
  newLeads30d: number;
  activeDeals: number;
  revenueClosed: number;
  closedWonMonth: number;
};

const COLORS = CHART_COLORS;

export default function ReportsSalesPage() {
  const [stats, setStats] = useState<SalesStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/sales_manager/overview', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setStats(d.kpis);
        else setError(d.error || 'Failed to load');
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="space-y-6">
        <p className="text-sm text-[var(--text-muted)]">Loading sales report…</p>
      </div>
    );
  if (error)
    return (
      <div className="space-y-6">
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  if (!stats) return null;

  const pipelineData = [
    { name: 'New Leads', value: stats.newLeads30d },
    { name: 'Active Deals', value: stats.activeDeals },
    { name: 'Won This Month', value: stats.closedWonMonth },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Sales Report</h1>
        <p className="page-subtitle">Pipeline activity, lead volume, and revenue closed.</p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'New Leads (30d)', value: stats.newLeads30d },
          { label: 'Active Deals', value: stats.activeDeals },
          { label: 'Won This Month', value: stats.closedWonMonth },
          { label: 'Revenue Closed', value: `$${stats.revenueClosed.toLocaleString()}` },
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
        {/* Pipeline breakdown bar chart */}
        <div className="card p-6">
          <p className="mb-4 text-sm font-semibold text-[var(--text-primary)]">
            Pipeline Breakdown
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={pipelineData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8,
                }}
                labelStyle={{ color: 'var(--text-primary)' }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {pipelineData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pipeline distribution pie chart */}
        <div className="card p-6">
          <p className="mb-4 text-sm font-semibold text-[var(--text-primary)]">
            Pipeline Distribution
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={pipelineData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {pipelineData.map((_, i) => (
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
      </div>
    </div>
  );
}
