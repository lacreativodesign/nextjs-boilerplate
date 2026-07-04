'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import EmptyState from '@/components/ui/EmptyState';

const STAGES = [
  'all',
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
  title?: string;
  stage?: string;
  valueUSD?: number;
  assignedSalesId?: string;
};

export default function SalesManagerPipelinePage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stage, setStage] = useState('all');
  const [salesRep, setSalesRep] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadDeals() {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (stage !== 'all') params.set('stage', stage);
      if (salesRep !== 'all') params.set('assignedSalesId', salesRep);
      const res = await fetch(`/api/crm/deals?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (data.ok) setDeals(data.deals || []);
      else setError(data.error || 'Unable to load deals.');
    } catch {
      setError('Unable to load deals. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDeals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, salesRep]);

  const reps = useMemo(
    () => ['all', ...Array.from(new Set(deals.map((d) => d.assignedSalesId).filter(Boolean)))],
    [deals],
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Sales Manager Pipeline</h1>
      <div className="card grid gap-2 p-4 md:grid-cols-2">
        <select className="input" value={stage} onChange={(e) => setStage(e.target.value)}>
          {STAGES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select className="input" value={salesRep} onChange={(e) => setSalesRep(e.target.value)}>
          {reps.map((rep) => (
            <option key={rep} value={rep}>
              {rep}
            </option>
          ))}
        </select>
      </div>
      <div className="card p-4">
        {loading ? (
          <p className="text-sm text-[var(--text-muted)]">Loading…</p>
        ) : error ? (
          <EmptyState title="Something went wrong" description={error} />
        ) : deals.length === 0 ? (
          <EmptyState
            compact
            title="No deals match these filters"
            description="Try a different stage or sales rep, or add deals in Sales."
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th>Title</th>
                  <th>Stage</th>
                  <th>Value</th>
                  <th>Sales Rep</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {deals.map((deal) => (
                  <tr key={deal.id} className="border-t">
                    <td>{deal.title}</td>
                    <td>{deal.stage}</td>
                    <td>${(deal.valueUSD ?? 0).toLocaleString()}</td>
                    <td>{deal.assignedSalesId}</td>
                    <td>
                      <Link className="btn" href={`/sales_manager/deals/${deal.id}`}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
