'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

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

export default function SalesManagerPipelinePage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [stage, setStage] = useState('all');
  const [salesRep, setSalesRep] = useState('all');

  async function loadDeals() {
    const params = new URLSearchParams();
    if (stage !== 'all') params.set('stage', stage);
    if (salesRep !== 'all') params.set('assignedSalesId', salesRep);
    const res = await fetch(`/api/crm/deals?${params.toString()}`, { cache: 'no-store' });
    const data = await res.json();
    if (data.ok) setDeals(data.deals || []);
  }

  useEffect(() => {
    loadDeals();
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
                  <td>${deal.valueUSD.toLocaleString()}</td>
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
      </div>
    </div>
  );
}
