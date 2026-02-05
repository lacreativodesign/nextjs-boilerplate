"use client";

import { useEffect, useState } from "react";

type Lead = {
  id: string;
  name: string;
  company: string;
  email: string;
  status: string;
  createdAt: string | null;
};

export default function SalesLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "", source: "" });

  async function loadLeads() {
    setLoading(true);
    const res = await fetch("/api/crm/leads", { cache: "no-store" });
    const data = await res.json();
    if (data.ok) setLeads(data.leads || []);
    setLoading(false);
  }

  useEffect(() => {
    loadLeads();
  }, []);

  async function addLead() {
    const res = await fetch("/api/crm/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (data.ok) {
      setForm({ name: "", company: "", email: "", phone: "", source: "" });
      await loadLeads();
    } else {
      alert(data.error || "Failed to create lead");
    }
  }

  async function convertToDeal(leadId: string) {
    const valueUSD = Number(prompt("Deal value (USD)", "0") || "0");
    const title = prompt("Deal title", "New deal") || "New deal";
    const res = await fetch("/api/crm/leads/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, title, valueUSD }),
    });
    const data = await res.json();
    if (!data.ok) {
      alert(data.error || "Failed to convert");
      return;
    }
    await loadLeads();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Sales Leads</h1>

      <div className="card grid gap-2 p-4 md:grid-cols-6">
        <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="input" placeholder="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        <input className="input" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="input" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input className="input" placeholder="Source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
        <button className="btn" onClick={addLead}>Add Lead</button>
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <div className="card overflow-x-auto p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th>Name</th>
                <th>Company</th>
                <th>Email</th>
                <th>Status</th>
                <th>Created At</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-t">
                  <td>{lead.name}</td>
                  <td>{lead.company}</td>
                  <td>{lead.email}</td>
                  <td>{lead.status}</td>
                  <td>{lead.createdAt ? new Date(lead.createdAt).toLocaleString() : "-"}</td>
                  <td>
                    {lead.status !== "converted" && (
                      <button className="btn" onClick={() => convertToDeal(lead.id)}>
                        Convert to Deal
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
