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
          <tbody>{leads.map((lead) => { const l = lead as Record<string, unknown>; return <tr key={String(l.id || "")} className="border-t"><td>{String(l.name || "")}</td><td>{String(l.company || "")}</td><td>{String(l.email || "")}</td><td>{String(l.status || "")}</td></tr>; })}</tbody>
        </table>
      </div>

      <div className="card p-4">
        <h2 className="mb-2 font-semibold">Deals</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left"><th>Title</th><th>Stage</th><th>Value</th><th>Sales Rep</th></tr></thead>
          <tbody>{deals.map((deal) => { const d = deal as Record<string, unknown>; return <tr key={String(d.id || "")} className="border-t"><td>{String(d.title || "")}</td><td>{String(d.stage || "")}</td><td>${Number(d.valueUSD || 0).toLocaleString()}</td><td>{String(d.assignedSalesId || "")}</td></tr>; })}</tbody>
        </table>
      </div>
    </div>
  );
}
