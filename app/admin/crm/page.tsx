'use client';

import { useEffect, useState } from 'react';
import EmptyState from '@/components/ui/EmptyState';

type Lead = { id: string; name?: string; company?: string; email?: string; status?: string };
type Deal = {
  id: string;
  title?: string;
  stage?: string;
  valueUSD?: number;
  assignedSalesId?: string;
};

export default function AdminCrmPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [leadsRes, dealsRes] = await Promise.all([
          fetch('/api/crm/leads', { cache: 'no-store' }),
          fetch('/api/crm/deals', { cache: 'no-store' }),
        ]);
        const leadsData = await leadsRes.json().catch(() => ({}));
        const dealsData = await dealsRes.json().catch(() => ({}));
        if (leadsData.ok) setLeads(leadsData.leads || []);
        if (dealsData.ok) setDeals(dealsData.deals || []);
      } catch {
        setError('Unable to load CRM data. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">CRM (Read-only)</h1>
        <p className="text-sm text-[var(--text-muted)]">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">CRM (Read-only)</h1>
        <EmptyState title="Something went wrong" description={error} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">CRM (Read-only)</h1>

      <div className="card p-4">
        <h2 className="mb-2 font-semibold">Leads</h2>
        {leads.length === 0 ? (
          <EmptyState
            compact
            title="No leads yet"
            description="Leads created in Sales will appear here."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th>Name</th>
                <th>Company</th>
                <th>Email</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-t">
                  <td>{lead.name}</td>
                  <td>{lead.company}</td>
                  <td>{lead.email}</td>
                  <td>{lead.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card p-4">
        <h2 className="mb-2 font-semibold">Deals</h2>
        {deals.length === 0 ? (
          <EmptyState
            compact
            title="No deals yet"
            description="Deals created in Sales will appear here."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th>Title</th>
                <th>Stage</th>
                <th>Value</th>
                <th>Sales Rep</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((deal) => (
                <tr key={deal.id} className="border-t">
                  <td>{deal.title}</td>
                  <td>{deal.stage}</td>
                  <td>${(deal.valueUSD ?? 0).toLocaleString()}</td>
                  <td>{deal.assignedSalesId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
