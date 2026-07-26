'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Pie,
  PieChart,
  Cell,
  Legend,
  CartesianGrid,
} from 'recharts';
import {
  ChartContainer,
  CHART_COLORS,
  chartAxisProps,
  chartGridProps,
  chartTooltipProps,
  useChartAnimation,
} from '@/components/charts/ChartContainer';
import { apiFetch } from '@/lib/api/client';

/**
 * S18: real production reporting.
 *
 * This page previously presented invented operational metrics as though they were the
 * tenant's own: four KPI tiles with hardcoded queue, completion, revision and turnaround
 * figures; a team-performance bar chart naming four people who do not work here; and a
 * project-category pie chart. Every value was a literal, identical for every tenant. A
 * production manager could have made a staffing or capacity decision on numbers that were
 * never real — the most dangerous class of fake data in the product. The accompanying test
 * asserts none of those literals can reappear in this file.
 *
 * All figures below are now derived from the tenant's actual projects, via two endpoints the
 * production role can already call and which are both tenant-scoped:
 *   - /api/production/overview  -> assigned / active / due-soon / QA-queue counts
 *   - /api/production/queue     -> the live project list, for stage / type / health breakdowns
 */
type Kpis = {
  assigned: number;
  active: number;
  dueSoon: number;
  qaQueue: number;
};

type QueueProject = {
  id: string;
  projectName: string;
  projectType: string;
  stage: string;
  health: string;
};

export default function ProductionReportsPage() {
  const chartAnimation = useChartAnimation();

  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [projects, setProjects] = useState<QueueProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [overviewRes, queueRes] = await Promise.all([
        apiFetch('/api/production/overview', { cache: 'no-store' }),
        apiFetch('/api/production/queue', { cache: 'no-store' }),
      ]);

      const overview = (await overviewRes.json().catch(() => null)) as {
        ok?: boolean;
        kpis?: Kpis;
        error?: string;
      } | null;
      const queue = (await queueRes.json().catch(() => null)) as {
        ok?: boolean;
        projects?: QueueProject[];
        error?: string;
      } | null;

      if (!overviewRes.ok || !overview?.ok) {
        setError(overview?.error || `Could not load production reports (${overviewRes.status})`);
        setKpis(null);
        setProjects([]);
        return;
      }

      setKpis(overview.kpis ?? { assigned: 0, active: 0, dueSoon: 0, qaQueue: 0 });
      setProjects(queueRes.ok && queue?.ok ? (queue.projects ?? []) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load production reports');
      setKpis(null);
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isLoading = projects === null && !error;

  /** Group by any string field, dropping blanks so the chart never invents a category. */
  const groupBy = useCallback(
    (field: keyof QueueProject) => {
      if (!projects) return [];
      const buckets = new Map<string, number>();
      projects.forEach((project) => {
        const key = String(project[field] || '').trim();
        if (!key) return;
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
      });
      return Array.from(buckets.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    },
    [projects],
  );

  const byStage = useMemo(() => groupBy('stage'), [groupBy]);
  const byType = useMemo(() => groupBy('projectType'), [groupBy]);
  const byHealth = useMemo(() => groupBy('health'), [groupBy]);

  const kpiTiles = [
    { label: 'Assigned to me', value: kpis?.assigned ?? 0 },
    { label: 'Active', value: kpis?.active ?? 0 },
    { label: 'Due soon', value: kpis?.dueSoon ?? 0 },
    { label: 'Awaiting QA', value: kpis?.qaQueue ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <h1 className="page-title">Production Reports</h1>

      {error && (
        <p className="rounded-xl border border-[var(--danger)] p-4 text-sm font-semibold text-[var(--danger)]">
          {error}
        </p>
      )}

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpiTiles.map((kpi) => (
          <article
            key={kpi.label}
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {kpi.label}
            </p>
            <p className="mt-2 text-3xl font-black text-[var(--text-primary)]">
              {isLoading ? '—' : kpi.value}
            </p>
          </article>
        ))}
      </section>

      <ChartContainer
        title="Projects by stage"
        description="Live projects in your production queue."
        isLoading={isLoading}
        isEmpty={!isLoading && byStage.length === 0}
        height={280}
      >
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={byStage}>
            <CartesianGrid {...chartGridProps} />
            <XAxis dataKey="name" {...chartAxisProps} />
            <YAxis allowDecimals={false} {...chartAxisProps} />
            <Tooltip {...chartTooltipProps} />
            <Bar dataKey="value" fill={CHART_COLORS[0]} {...chartAnimation} />
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>

      <ChartContainer
        title="Projects by type"
        description="Distribution across the project types actually in your queue."
        isLoading={isLoading}
        isEmpty={!isLoading && byType.length === 0}
        height={280}
      >
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={byType} dataKey="value" nameKey="name" outerRadius={100} {...chartAnimation}>
              {byType.map((entry, index) => (
                <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip {...chartTooltipProps} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartContainer>

      <ChartContainer
        title="Projects by health"
        description="On-track, at-risk and overdue projects."
        isLoading={isLoading}
        isEmpty={!isLoading && byHealth.length === 0}
        height={280}
      >
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={byHealth}>
            <CartesianGrid {...chartGridProps} />
            <XAxis dataKey="name" {...chartAxisProps} />
            <YAxis allowDecimals={false} {...chartAxisProps} />
            <Tooltip {...chartTooltipProps} />
            <Bar dataKey="value" fill={CHART_COLORS[1]} {...chartAnimation} />
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
}
