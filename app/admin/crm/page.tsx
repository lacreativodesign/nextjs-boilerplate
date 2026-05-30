"use client";

import { useEffect, useState } from "react";

export default function AdminCrmPage() {
  const [leads, setLeads] = useState<unknown[]>([]);
  const [deals, setDeals] = useState<unknown[]>([]);

  useEffect(() => {
    async function load() {
      const [leadsRes, dealsRes] = await Promise.all([
        fetch("/api/crm/leads", { cache: "no-store" }),
        fetch("/api/crm/deals", { cache: "no-store" }),
      ]);
      const leadsData = await leadsRes.json();
      const dealsData = await dealsRes.json();
      if (leadsData.ok) setLeads(leadsData.leads || []);
      if (dealsData.ok) setDeals(dealsData.deals || []);
    }
    load();
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">CRM (Read-only)</h1>

      <div className="card p-4">
        <h2 className="mb-2 font-semibold">Leads</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left"><th>Name</th><th>Company</th><th>Email</th><th>Status</th></tr></thead>
          <tbody>{leads.map((lead) => <tr key={(lead as Record<string, unknown>).id} className="border-t"><td>{(lead as Record<string, unknown>).name}</td><td>{(lead as Record<string, unknown>).company}</td><td>{(lead as Record<string, unknown>).email}</td><td>{(lead as Record<string, unknown>).status}</td></tr>)}</tbody>
        </table>
      </div>

      <div className="card p-4">
        <h2 className="mb-2 font-semibold">Deals</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left"><th>Title</th><th>Stage</th><th>Value</th><th>Sales Rep</th></tr></thead>
          <tbody>{deals.map((deal) => <tr key={(deal as Record<string, unknown>).id} className="border-t"><td>{(deal as Record<string, unknown>).title}</td><td>{(deal as Record<string, unknown>).stage}</td><td>${(deal as Record<string, unknown>).valueUSD.toLocaleString()}</td><td>{(deal as Record<string, unknown>).assignedSalesId}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
