"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import EmptyState from "@/components/ui/EmptyState";
import LoadingButton from "@/components/ui/LoadingButton";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { SmartSearchBar } from "@/components/search/SmartSearchBar";
import { smartMatch } from "@/lib/search/smartMatch";
import { toastError, toastPromise } from "@/lib/toast";
import { apiFetch } from "@/lib/api/client";

type Lead = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  source?: string;
  stage: string;
  ownerName?: string | null;
  createdAt?: string | null;
};

const STAGE_OPTIONS = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];

export default function SalesLeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/sales/leads/list", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to load leads.");
      }
      setLeads(Array.isArray(data.leads) ? data.leads : []);
    } catch (err: any) {
      toastError(err?.message || "Failed to load leads.");
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const filteredLeads = useMemo(
    () =>
      smartMatch(leads, query, (lead) => [
        lead.name,
        lead.email,
        lead.phone,
        lead.source,
        lead.stage,
        lead.ownerName,
      ]),
    [leads, query]
  );

  const updateStage = async (id: string, stage: string) => {
    try {
      setActionLoading(`stage:${id}`);
      await toastPromise(
        apiFetch("/api/sales/leads/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, stage }),
        }).then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to update lead stage.");
          return data;
        }),
        {
          loading: "Updating lead...",
          success: "Lead updated.",
          error: (err) => err?.message || "Failed to update lead.",
        }
      );
      setLeads((prev) => prev.map((lead) => (lead.id === id ? { ...lead, stage } : lead)));
    } finally {
      setActionLoading(null);
    }
  };

  const deleteLead = async (id: string) => {
    if (!window.confirm("Delete this lead?")) return;
    try {
      setActionLoading(`delete:${id}`);
      await toastPromise(
        apiFetch("/api/sales/leads/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, isDeleted: true }),
        }).then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to delete lead.");
          return data;
        }),
        {
          loading: "Deleting lead...",
          success: "Lead deleted.",
          error: (err) => err?.message || "Failed to delete lead.",
        }
      );
      setLeads((prev) => prev.filter((lead) => lead.id !== id));
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="page-frame space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Sales Leads</h1>
        <button className="btn" onClick={() => router.push("/sales/leads/add")}>+ Add Lead</button>
      </div>

      <div className="card p-4">
        <SmartSearchBar value={query} onChange={setQuery} />
      </div>

      {loading ? (
        <SkeletonTable rows={5} columns={7} />
      ) : filteredLeads.length === 0 ? (
        <EmptyState title="No leads found" description="Create your first lead to get started." />
      ) : (
        <div className="card overflow-x-auto p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Owner</th>
                <th>Stage</th>
                <th>Created</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr key={lead.id} className="border-t">
                  <td>{lead.name || "-"}</td>
                  <td>{lead.email || "-"}</td>
                  <td>{lead.phone || "-"}</td>
                  <td>{lead.ownerName || "-"}</td>
                  <td>
                    <select
                      className="input"
                      value={lead.stage || "New"}
                      onChange={(e) => updateStage(lead.id, e.target.value)}
                      disabled={actionLoading === `stage:${lead.id}`}
                    >
                      {STAGE_OPTIONS.map((stage) => (
                        <option key={stage} value={stage}>
                          {stage}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{lead.createdAt ? new Date(lead.createdAt).toLocaleString() : "-"}</td>
                  <td>
                    <div className="flex justify-end gap-2">
                      <button className="btn ghost" onClick={() => router.push(`/sales/leads/${lead.id}/edit`)}>
                        Edit
                      </button>
                      <LoadingButton
                        className="btn ghost"
                        onClick={() => deleteLead(lead.id)}
                        loading={actionLoading === `delete:${lead.id}`}
                        loadingText="Deleting"
                      >
                        Delete
                      </LoadingButton>
                    </div>
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
