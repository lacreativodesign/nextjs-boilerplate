'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCountUp } from '@/lib/hooks/useCountUp';
import dynamic from 'next/dynamic';
const SalesAgentWidget = dynamic(() => import('@/components/ai/SalesAgentWidget'), { ssr: false });
import FirstRunHint from '@/components/onboarding/FirstRunHint';

type SalesStats = {
  totalLeads: number;
  activeDeals: number;
  pipelineValue: number;
  closedWonThisMonth: number;
  conversionRate: number;
};

const fmt = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`);

function StatCard({
  label,
  value,
  sub,
  href,
  color,
}: {
  label: string;
  value: string | number;
  sub: string;
  href?: string;
  color?: string;
}) {
  const numericTarget = typeof value === 'number' ? value : 0;
  const animated = useCountUp(numericTarget);
  const display = typeof value === 'number' ? animated : value;
  const inner = (
    <div
      className={`card ${href ? 'cursor-pointer hover:border-[var(--erp-blue)] transition-all group' : ''}`}
    >
      <div className="helper-text mb-2">{label}</div>
      <div
        className="text-3xl font-bold group-hover:text-[var(--erp-blue)]"
        style={{ color: color || 'var(--text-primary)' }}
      >
        {display}
      </div>
      <div className="mt-1 text-xs text-[var(--text-muted)]">{sub}</div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function SalesPage() {
  const [data, setData] = useState<SalesStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/sales/overview', { credentials: 'include' })
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) {
          const o = res.overview || {};
          setData({
            totalLeads: o.totalLeads ?? 0,
            activeDeals: o.activeDeals ?? 0,
            pipelineValue: o.pipelineValue ?? 0,
            closedWonThisMonth: o.closedWonThisMonth ?? 0,
            conversionRate: o.conversionRate ?? 0,
          });
        } else {
          setError(res.error || 'Failed to load sales data');
        }
      })
      .catch(() => setError('Failed to load sales data'))
      .finally(() => setLoading(false));
  }, []);

  const v = (val: any) => (loading ? '...' : val);

  // S28: a brand-new tenant has no leads or deals yet. Show a first-run pointer while every
  // headline number is still zero; it vanishes the moment real sales data exists.
  const isFirstRun =
    !loading &&
    !error &&
    (data?.totalLeads ?? 0) === 0 &&
    (data?.activeDeals ?? 0) === 0 &&
    (data?.pipelineValue ?? 0) === 0 &&
    (data?.closedWonThisMonth ?? 0) === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Overview</h1>
        <p className="page-subtitle mt-2">Leads, deals, and pipeline health at a glance.</p>
      </div>

      <div className="mb-6">
        <SalesAgentWidget />
      </div>

      <FirstRunHint
        show={isFirstRun}
        title="Your pipeline is ready — add your first lead"
        description="These cards fill in as leads and deals move through your pipeline. Start by adding a lead, and your totals, pipeline value and conversion rate will update automatically."
        action={{ label: 'Add a lead', href: '/sales/leads' }}
      />

      <div className="kpis">
        <StatCard
          label="Total Leads"
          value={v(data?.totalLeads ?? 0)}
          sub="All time"
          href="/sales/leads"
        />
        <StatCard
          label="Active Deals"
          value={v(data?.activeDeals ?? 0)}
          sub="In pipeline"
          href="/sales/deals"
          color="var(--color-info)"
        />
        <StatCard
          label="Pipeline Value"
          value={v(fmt(data?.pipelineValue ?? 0))}
          sub="Open deals total"
          color="var(--success)"
        />
        <StatCard
          label="Closed Won (Month)"
          value={v(data?.closedWonThisMonth ?? 0)}
          sub="This month"
          color="var(--success)"
        />
        <StatCard
          label="Conversion Rate"
          value={v(`${(data?.conversionRate ?? 0).toFixed(1)}%`)}
          sub="Leads to closed"
        />
      </div>

      {error && <div className="card p-4 text-red-400 text-sm">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { title: 'Leads', href: '/sales/leads', desc: 'All leads and prospecting.' },
          { title: 'Deals', href: '/sales/deals', desc: 'Active and closed deals.' },
          { title: 'Pipeline', href: '/sales/pipeline', desc: 'Visual pipeline board.' },
          { title: 'Follow-ups', href: '/sales/follow-ups', desc: 'Scheduled follow-ups.' },
          { title: 'Targets', href: '/sales/targets', desc: 'Monthly revenue targets.' },
          { title: 'Campaigns', href: '/sales/campaigns', desc: 'Marketing campaigns.' },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-xl border border-[var(--border-subtle)]
              bg-[var(--surface-card)] p-5
              hover:border-[var(--erp-blue)] transition-all group"
          >
            <p
              className="font-semibold text-[var(--text-primary)]
              group-hover:text-[var(--erp-blue)]"
            >
              {item.title}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{item.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
