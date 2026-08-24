'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { showToast } from '@/lib/utils/toast';
import { apiFetch } from '@/lib/api/client';
import EmptyState from '@/components/ui/EmptyState';

const STAGES = [
  'new',
  'contacted',
  'qualified',
  'proposal_sent',
  'negotiation',
  'closed_won',
  'closed_lost',
];

type Deal = {
  id: string;
  title: string;
  stage: string;
  valueUSD: number;
  discountPercent: number;
  discountApproved: boolean;
};

export default function SalesPipelinePage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadDeals() {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch('/api/crm/deals', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (data.ok) setDeals(data.deals || []);
      else setError(data.error || 'Unable to load your pipeline.');
    } catch {
      setError('Unable to load your pipeline. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDeals();
  }, []);

  const grouped = useMemo(
    () => STAGES.map((stage) => ({ stage, deals: deals.filter((deal) => deal.stage === stage) })),
    [deals],
  );

  async function moveForward(deal: Deal) {
    const idx = STAGES.indexOf(deal.stage);
    const next = STAGES[idx + 1];
    if (!next) return;

    if (next === 'closed_won' && deal.discountPercent > 0 && !deal.discountApproved) {
      showToast.error('Discount approval is required before Closed Won.');
      return;
    }

    const res = await apiFetch(`/api/crm/deals/${deal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: next }),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) {
      showToast.error(data.error || 'Failed to update stage');
      return;
    }
    await loadDeals();
  }

  return (
    <div className="page-frame space-y-4">
      <h1 className="page-title">My Pipeline</h1>

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading…</p>
      ) : error ? (
        <EmptyState title="Something went wrong" description={error} />
      ) : deals.length === 0 ? (
        <EmptyState
          title="No deals yet"
          description="Deals you own will appear here as you add them in Sales."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {grouped.map((column) => (
            <div key={column.stage} className="card p-4">
              <h2 className="mb-3 font-semibold uppercase">{column.stage.replace(/_/g, ' ')}</h2>
              <div className="space-y-2">
                {column.deals.map((deal) => (
                  <div key={deal.id} className="rounded border p-2">
                    <div className="font-medium">{deal.title}</div>
                    <div className="text-sm">${(deal.valueUSD ?? 0).toLocaleString()}</div>
                    <div className="mt-2 flex gap-2">
                      <button className="btn" onClick={() => moveForward(deal)}>
                        Move Forward
                      </button>
                      <Link className="btn" href={`/sales/deals/${deal.id}`}>
                        Open
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
