'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';

/**
 * S17: real deal reporting.
 *
 * This page previously rendered a literal array of invented deals — the same fabricated
 * people used elsewhere in the app — behind a filter UI that made them look like live
 * records. It now reports on the tenant's actual pipeline. The pipeline API already scopes a
 * sales rep to their own deals, so no additional filtering is needed here.
 */
type Deal = {
  id: string;
  dealName: string;
  clientName: string;
  stage: string;
  valueUsd: number;
  expectedCloseDate: string | null;
  createdAt: string | null;
};

const WON = 'Won';
const LOST = 'Lost';

function fmtUsd(value: number) {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

export default function SalesReportsPage() {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [outcome, setOutcome] = useState<'all' | 'open' | 'won' | 'lost'>('all');

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
        setError(payload?.error || `Could not load deals (${res.status})`);
        setDeals([]);
        return;
      }
      setDeals(payload.deals ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load deals');
      setDeals([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!deals) return [];

    const startMs = startDate ? new Date(startDate).getTime() : null;
    const endMs = endDate ? new Date(endDate).getTime() : null;

    return deals.filter((deal) => {
      if (outcome === 'won' && deal.stage !== WON) return false;
      if (outcome === 'lost' && deal.stage !== LOST) return false;
      if (outcome === 'open' && (deal.stage === WON || deal.stage === LOST)) return false;

      const anchor = deal.expectedCloseDate ?? deal.createdAt;
      if (!anchor) return !startMs && !endMs;

      const ms = new Date(anchor).getTime();
      if (Number.isNaN(ms)) return true;
      if (startMs && ms < startMs) return false;
      if (endMs && ms > endMs) return false;
      return true;
    });
  }, [deals, startDate, endDate, outcome]);

  const totalValue = useMemo(
    () => filtered.reduce((sum, deal) => sum + (Number(deal.valueUsd) || 0), 0),
    [filtered],
  );

  return (
    <div className="space-y-6">
      <h1 className="page-title">Sales Reports</h1>

      <section className="table-shell flex flex-wrap gap-3 p-4">
        <label className="text-sm">
          <span className="helper-text block">From</span>
          <input
            type="date"
            className="input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="helper-text block">To</span>
          <input
            type="date"
            className="input"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="helper-text block">Outcome</span>
          <select
            className="input"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as typeof outcome)}
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </select>
        </label>
      </section>

      {error && (
        <p className="rounded-xl border border-[var(--danger)] p-4 text-sm font-semibold text-[var(--danger)]">
          {error}
        </p>
      )}

      {deals === null && !error && <p className="helper-text">Loading deals…</p>}

      {deals !== null && filtered.length === 0 && !error && (
        <div className="table-shell">
          <p className="helper-text px-4 py-6">
            {deals.length === 0
              ? 'No deals yet. Deals appear here once they exist in your pipeline.'
              : 'No deals match these filters.'}
          </p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="table-shell">
          <div className="flex items-baseline justify-between px-4 py-3">
            <span className="text-sm font-bold text-[var(--text-primary)]">
              {filtered.length} deal{filtered.length === 1 ? '' : 's'}
            </span>
            <span className="text-sm font-bold text-[var(--text-primary)]">
              {fmtUsd(totalValue)}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--table-header-bg)] text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="px-4 py-3">Deal</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">Expected close</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((deal) => (
                  <tr
                    key={deal.id}
                    className="border-b border-[var(--border-subtle)] transition hover:bg-[var(--table-row-hover)]"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                      {deal.dealName || '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-primary)]">
                      {deal.clientName || '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-primary)]">{deal.stage || '—'}</td>
                    <td className="px-4 py-3 text-[var(--text-primary)]">
                      {fmtUsd(Number(deal.valueUsd) || 0)}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">
                      {fmtDate(deal.expectedCloseDate)}
                    </td>
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
