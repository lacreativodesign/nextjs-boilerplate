'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { apiFetch } from '@/lib/api/client';

/**
 * S17: real sales analytics.
 *
 * This page previously rendered invented business metrics as though they were the tenant's
 * own: a monthly revenue line climbing from 12,000 to 25,000, and a lead-conversion funnel
 * (45 New -> 6 Closed Won). Both were literal arrays, identical for every tenant. A sales
 * manager could read a trend off this chart and act on numbers that were never real.
 *
 * Everything below is now derived from the tenant's actual deals, scoped by the pipeline API
 * (which already restricts a sales rep to their own deals).
 */
type Deal = {
  id: string;
  stage: string;
  valueUsd: number;
  createdAt: string | null;
  expectedCloseDate: string | null;
};

const FUNNEL_STAGES = ['New Lead', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won'];

function monthKey(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
}

export default function SalesAnalyticsPage() {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch('/api/sales/pipeline', { cache: 'no-store' });
      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean;
        deals?: Deal[];
        error?: string;
      } | null;

      if (!res.ok || !payload?.ok) {
        setError(payload?.error || `Could not load analytics (${res.status})`);
        setDeals([]);
        return;
      }
      setDeals(payload.deals ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load analytics');
      setDeals([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Pipeline value grouped by the month each deal is expected to close. */
  const monthlyValue = useMemo(() => {
    if (!deals) return [];
    const buckets = new Map<string, number>();

    deals.forEach((deal) => {
      const key = monthKey(deal.expectedCloseDate ?? deal.createdAt);
      if (!key) return;
      buckets.set(key, (buckets.get(key) ?? 0) + (Number(deal.valueUsd) || 0));
    });

    return Array.from(buckets.entries())
      .map(([month, value]) => ({ month, value }))
      .sort((a, b) => new Date(`1 ${a.month}`).getTime() - new Date(`1 ${b.month}`).getTime());
  }, [deals]);

  /** How many deals sit in each pipeline stage right now. */
  const stageCounts = useMemo(() => {
    if (!deals) return [];
    return FUNNEL_STAGES.map((stage) => ({
      stage,
      count: deals.filter((deal) => deal.stage === stage).length,
    })).filter((entry) => entry.count > 0);
  }, [deals]);

  const hasData = deals !== null && deals.length > 0;

  return (
    <div className="space-y-6">
      <h1 className="page-title">Sales Analytics</h1>

      {error && (
        <p className="rounded-xl border border-[var(--danger,#dc2626)] p-4 text-sm font-semibold text-[var(--danger,#dc2626)]">
          {error}
        </p>
      )}

      {deals === null && !error && <p className="helper-text">Loading analytics…</p>}

      {deals !== null && deals.length === 0 && !error && (
        <div className="table-shell">
          <p className="helper-text px-4 py-6">
            No deals yet. Charts appear here once deals exist in your pipeline.
          </p>
        </div>
      )}

      {hasData && (
        <>
          <section className="table-shell p-4">
            <h2 className="mb-4 text-sm font-bold text-[var(--text-primary)]">
              Pipeline value by expected close month (USD)
            </h2>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monthlyValue}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </section>

          <section className="table-shell p-4">
            <h2 className="mb-4 text-sm font-bold text-[var(--text-primary)]">
              Deals by pipeline stage
            </h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stageCounts}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="stage" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </section>
        </>
      )}
    </div>
  );
}
