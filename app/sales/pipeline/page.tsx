'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { showToast } from '@/lib/utils/toast';
import { apiFetch } from '@/lib/api/client';

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

  async function loadDeals() {
    const res = await apiFetch('/api/crm/deals', { cache: 'no-store' });
    const data = await res.json();
    if (data.ok) setDeals(data.deals || []);
  }

  useEffect(() => {
    loadDeals();
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
    const data = await res.json();
    if (!data.ok) {
      showToast.error(data.error || 'Failed to update stage');
      return;
    }
    await loadDeals();
  }

  return (
    <div className="page-frame space-y-4">
      <h1 className="text-xl font-bold">My Pipeline</h1>
      <div className="grid gap-4 lg:grid-cols-3">
        {grouped.map((column) => (
          <div key={column.stage} className="card p-4">
            <h2 className="mb-3 font-semibold uppercase">{column.stage.replace(/_/g, ' ')}</h2>
            <div className="space-y-2">
              {column.deals.map((deal) => (
                <div key={deal.id} className="rounded border p-2">
                  <div className="font-medium">{deal.title}</div>
                  <div className="text-sm">${deal.valueUSD.toLocaleString()}</div>
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
    </div>
  );
}
