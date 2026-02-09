"use client";

import { useEffect, useState } from "react";
import EmptyState from "@/components/ui/EmptyState";
import LoadingButton from "@/components/ui/LoadingButton";
import { SkeletonTable } from "@/components/ui/skeleton";
import { toastError, toastPromise } from "@/lib/toast";

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
  const [creating, setCreating] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "", source: "" });

  async function loadLeads() {
    setLoading(true);
    try {
      const res = await fetch("/api/crm/leads", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Failed to load leads.");
      }
      setLeads(data.leads || []);
    } catch (err: any) {
      toastError(err?.message || "Failed to load leads.");
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLeads();
  }, []);

  async function addLead() {
    setCreating(true);
    try {
      await toastPromise(
        fetch("/api/crm/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }).then(async (res) => {
          const data = await res.json();
          if (!res.ok || !data.ok) {
            throw new Error(data?.error || "Failed to create lead");
          }
          return data;
        }),
        {
          loading: "Creating lead...",
          success: "Lead created successfully.",
          error: (err) => err?.message || "Failed to create lead.",
        }
      );
      setForm({ name: "", company: "", email: "", phone: "", source: "" });
      await loadLeads();
    } finally {
      setCreating(false);
    }
  }

  async function convertToDeal(leadId: string) {
    const valueUSD = Number(prompt("Deal value (USD)", "0") || "0");
    const title = prompt("Deal title", "New deal") || "New deal";
    setConvertingId(leadId);
    try {
      await toastPromise(
        fetch("/api/crm/leads/convert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId, title, valueUSD }),
        }).then(async (res) => {
          const data = await res.json();
          if (!res.ok || !data.ok) {
            throw new Error(data?.error || "Failed to convert");
          }
          return data;
        }),
        {
          loading: "Converting lead...",
          success: "Lead converted to deal.",
          error: (err) => err?.message || "Failed to convert lead.",
        }
      );
      await loadLeads();
    } finally {
      setConvertingId(null);
    }
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
        <LoadingButton className="btn" onClick={addLead} loading={creating} loadingText="Saving...">
          Add Lead
        </LoadingButton>
      </div>

      {/* Loading state: use skeleton table for consistent layout. */}
      {loading ? (
        <SkeletonTable rows={5} columns={6} />
      ) : leads.length === 0 ? (
        <EmptyState title="No leads yet" description="Create your first lead to get started." />
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
                      <LoadingButton
                        className="btn"
                        onClick={() => convertToDeal(lead.id)}
                        loading={convertingId === lead.id}
                        loadingText="Converting..."
                      >
                        Convert to Deal
                      </LoadingButton>
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
