'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';

type SalesKpis = {
  totalLeads: number;
  activeDeals: number;
  pipelineValue: number;
  closedWonMonth: number;
  conversionRate: number;
};

type PipelineStage = {
  stage: string;
  count: number;
  value: number;
};

type TopOwner = {
  ownerName: string;
  deals: number;
  value: number;
};

type OverviewData = {
  kpis: SalesKpis;
  pipelineStages: PipelineStage[];
  topOwners: TopOwner[];
};

const COLOR_ACTIVE = '#10b981'; // green-ish
const COLOR_LOCKED = '#ef4444'; // red

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
      <p className="text-sm text-[var(--text-muted)]">{label}</p>
      <p className="mt-2 text-3xl font-bold" style={{ color: color || 'var(--text-primary)' }}>
        {value}
      </p>
      <p className="mt-1 text-xs text-[var(--text-soft)]">{sub}</p>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>;
}

function SkeletonGrid({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5"
        >
          <div className="h-3 w-24 animate-pulse rounded bg-[var(--border-subtle)]" />
          <div className="mt-3 h-8 w-20 animate-pulse rounded bg-[var(--border-subtle)]" />
          <div className="mt-2 h-2 w-28 animate-pulse rounded bg-[var(--border-subtle)]" />
        </div>
      ))}
    </div>
  );
}

function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-3 w-full animate-pulse rounded bg-[var(--border-subtle)]" />
      ))}
    </div>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
      <p className="text-sm" style={{ color: COLOR_LOCKED }}>
        {message}
      </p>
    </div>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatPercent(value: number): string {
  return `${(Number.isFinite(value) ? value : 0).toFixed(1)}%`;
}

export default function AdminPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const res = await apiFetch('/api/admin/sales/overview', { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok || !json?.kpis) {
          throw new Error('Sales overview is temporarily unavailable.');
        }
        if (active) {
          setData({
            kpis: json.kpis,
            pipelineStages: Array.isArray(json.pipelineStages) ? json.pipelineStages : [],
            topOwners: Array.isArray(json.topOwners) ? json.topOwners : [],
          });
        }
      } catch {
        if (active) setError('Sales overview is temporarily unavailable.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  const kpis = data?.kpis;
  const stages = data?.pipelineStages || [];
  const owners = data?.topOwners || [];
  const maxStageValue = stages.reduce((max, s) => Math.max(max, Number(s.value) || 0), 0);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Office Overview</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Your sales pipeline and team performance at a glance.
        </p>
      </header>

      {/* SECTION 1 — Sales Performance */}
      <section className="space-y-3">
        <SectionHeader title="Sales Performance" />
        {loading ? (
          <SkeletonGrid count={3} />
        ) : error ? (
          <ErrorLine message={error} />
        ) : kpis ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              label="Pipeline Value"
              value={formatCurrency(kpis.pipelineValue)}
              sub="Open deals in flight"
              color="var(--erp-blue)"
            />
            <StatCard
              label="Closed Won (mo)"
              value={kpis.closedWonMonth}
              sub="Deals won this month"
              color={COLOR_ACTIVE}
            />
            <StatCard label="Active Deals" value={kpis.activeDeals} sub="Deals not yet closed" />
            <StatCard label="Total Leads" value={kpis.totalLeads} sub="Leads in the system" />
            <StatCard
              label="Conversion Rate"
              value={formatPercent(kpis.conversionRate)}
              sub="Closed won vs. total leads"
            />
          </div>
        ) : (
          <ErrorLine message="No sales data available." />
        )}
      </section>

      {/* SECTION 2 — Pipeline by Stage */}
      <section className="space-y-3">
        <SectionHeader title="Pipeline by Stage" />
        {loading ? (
          <SkeletonRows count={4} />
        ) : error ? (
          <ErrorLine message={error} />
        ) : stages.length ? (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 space-y-4">
            {stages.map((stage) => {
              const value = Number(stage.value) || 0;
              const pct = maxStageValue > 0 ? Math.max((value / maxStageValue) * 100, 2) : 0;
              return (
                <div key={stage.stage} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {stage.stage}
                    </span>
                    <span className="text-xs text-[var(--text-soft)]">
                      {stage.count} {stage.count === 1 ? 'deal' : 'deals'} ·{' '}
                      <span className="text-[var(--text-muted)]">{formatCurrency(value)}</span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded bg-[var(--border-subtle)]">
                    <div
                      className="h-full rounded"
                      style={{ width: `${pct}%`, background: 'var(--erp-blue)' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <ErrorLine message="No pipeline stages to show yet." />
        )}
      </section>

      {/* SECTION 3 — Top Performers */}
      <section className="space-y-3">
        <SectionHeader title="Top Performers" />
        {loading ? (
          <SkeletonRows count={5} />
        ) : error ? (
          <ErrorLine message={error} />
        ) : owners.length ? (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] divide-y divide-[var(--border-subtle)]">
            {owners.map((owner, idx) => (
              <div key={owner.ownerName} className="flex items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--erp-blue-soft)] text-xs font-semibold text-[var(--erp-blue)]">
                    {idx + 1}
                  </span>
                  <span className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {owner.ownerName}
                  </span>
                </div>
                <div className="flex shrink-0 items-baseline gap-3">
                  <span className="text-xs text-[var(--text-soft)]">
                    {owner.deals} {owner.deals === 1 ? 'deal' : 'deals'}
                  </span>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {formatCurrency(owner.value)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <ErrorLine message="No owner activity to show yet." />
        )}
      </section>
    </div>
  );
}
