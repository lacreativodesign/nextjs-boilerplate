'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import {
  ChartContainer,
  chartAxisProps,
  chartGridProps,
  chartTooltipProps,
  useChartAnimation,
} from '@/components/charts/ChartContainer';
import PerformanceCard from '@/components/performance/PerformanceCard';
import PeriodSelector from '@/components/performance/PeriodSelector';
import { getCurrentPeriod, PeriodType } from '@/lib/performance/periods';

type MonthPoint = { month: string; leads: number; closed: number };
type SummaryKPIs = {
  totalLeads: number;
  totalClosed: number;
  conversionRate: string;
  totalRevenue: number;
};

type TargetResponse = {
  ok: boolean;
  targets?: Array<{
    metrics?: Record<string, { target: number; label: string; unit: 'USD' | 'count' | '%' }>;
  }>;
};

export default function SalesPerformancePage() {
  const chartAnimation = useChartAnimation();
  const [monthlyData, setMonthlyData] = useState<MonthPoint[]>([]);
  const [kpis, setKpis] = useState<SummaryKPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodType, setPeriodType] = useState<PeriodType>('monthly');
  const [period, setPeriod] = useState(getCurrentPeriod('monthly'));
  const [targetLoading, setTargetLoading] = useState(true);
  const [targets, setTargets] = useState<
    Record<string, { target: number; label: string; unit: 'USD' | 'count' | '%' }>
  >({});
  const [actuals, setActuals] = useState<Record<string, number>>({});

  useEffect(() => setPeriod(getCurrentPeriod(periodType)), [periodType]);

  useEffect(() => {
    fetch('/api/sales_manager/overview', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) {
          setError(d.error || 'Failed to load');
          return;
        }

        const totalLeads = d.kpis?.newLeads30d ?? 0;
        const totalClosed = d.kpis?.closedWonMonth ?? 0;
        const totalRevenue = d.kpis?.revenueClosed ?? 0;
        const convRate = totalLeads > 0 ? `${Math.round((totalClosed / totalLeads) * 100)}%` : '0%';

        setKpis({ totalLeads, totalClosed, conversionRate: convRate, totalRevenue });

        if (d.pipelineStages && Array.isArray(d.pipelineStages)) {
          const points: MonthPoint[] = d.pipelineStages.map((s: any) => ({
            month: s.stage ?? s.label ?? '',
            leads: s.count ?? 0,
            closed: s.stage === 'Closed Won' ? (s.count ?? 0) : 0,
          }));
          setMonthlyData(points);
        }
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let active = true;
    setTargetLoading(true);
    Promise.all([
      fetch(
        `/api/performance/targets?period=${encodeURIComponent(period)}&periodType=${periodType}`,
        { credentials: 'include' },
      ).then((r) => r.json()),
      fetch(
        `/api/performance/actuals?period=${encodeURIComponent(period)}&periodType=${periodType}&role=sales`,
        { credentials: 'include' },
      ).then((r) => r.json()),
    ])
      .then(([targetJson, actualJson]: [TargetResponse, { actuals?: Record<string, number> }]) => {
        if (!active) return;
        const merged = (targetJson.targets || [])[0]?.metrics || {};
        setTargets(merged);
        setActuals(actualJson.actuals || {});
      })
      .finally(() => active && setTargetLoading(false));
    return () => {
      active = false;
    };
  }, [period, periodType]);

  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(n);

  const stats = kpis
    ? [
        { label: 'New Leads (30d)', value: kpis.totalLeads.toLocaleString() },
        { label: 'Deals Closed', value: kpis.totalClosed.toLocaleString() },
        { label: 'Conversion Rate', value: kpis.conversionRate },
        { label: 'Revenue Closed', value: fmtCurrency(kpis.totalRevenue) },
      ]
    : [
        { label: 'New Leads (30d)', value: '—' },
        { label: 'Deals Closed', value: '—' },
        { label: 'Conversion Rate', value: '—' },
        { label: 'Revenue Closed', value: '—' },
      ];

  const cards = useMemo(
    () => [
      { key: 'leadsCreated', label: 'Leads Created', unit: 'count' as const },
      { key: 'dealsClosed', label: 'Deals Closed', unit: 'count' as const },
      { key: 'revenueGenerated', label: 'Revenue Generated', unit: 'USD' as const },
    ],
    [],
  );

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-bold">Sales Performance</h1>

      <PeriodSelector
        period={period}
        periodType={periodType}
        onTypeChange={setPeriodType}
        onPeriodChange={setPeriod}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">My Targets</h2>
        {targetLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="card p-5 space-y-3 animate-pulse">
                <div className="h-4 bg-[var(--surface-muted)] rounded" />
                <div className="h-8 bg-[var(--surface-muted)] rounded" />
                <div className="h-2 bg-[var(--surface-muted)] rounded" />
              </div>
            ))}
          </div>
        ) : Object.keys(targets).length === 0 ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 p-4 text-sm">
            Your manager hasn&apos;t set targets for this period yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {cards.map((item) => (
              <PerformanceCard
                key={item.key}
                metricKey={item.key}
                label={item.label}
                unit={item.unit}
                target={Number(targets[item.key]?.target || 0)}
                actual={Number(actuals[item.key] || 0)}
              />
            ))}
          </div>
        )}
      </section>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((s, idx) => (
          <div key={idx} className="card p-5">
            <p className="helper-text">{s.label}</p>
            {loading ? (
              <div className="skeleton h-8 w-24 rounded mt-2" />
            ) : (
              <p className="text-2xl font-semibold mt-2 text-[var(--text-primary)]">{s.value}</p>
            )}
          </div>
        ))}
      </div>

      {!loading && monthlyData.length > 0 && (
        <ChartContainer title="Pipeline by Stage">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyData} {...chartAnimation}>
              <CartesianGrid {...chartGridProps} />
              <XAxis dataKey="month" {...chartAxisProps} />
              <YAxis {...chartAxisProps} />
              <Tooltip {...chartTooltipProps} />
              <Bar dataKey="leads" name="Leads" fill="var(--erp-blue)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="closed" name="Closed Won" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      )}

      {!loading && monthlyData.length === 0 && !error && (
        <div className="card p-8 text-center text-[var(--text-muted)] text-sm">
          No pipeline data available yet.
        </div>
      )}
    </div>
  );
}
