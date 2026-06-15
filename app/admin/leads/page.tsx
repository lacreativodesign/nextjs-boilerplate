"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDate } from "@/components/finance/financeUtils";
import { SmartSearchBar } from "@/components/search/SmartSearchBar";
import { smartMatch } from "@/lib/search/smartMatch";
import { apiFetch } from "@/lib/api/client";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "proposal_sent", label: "Proposal Sent" },
  { value: "negotiation", label: "Negotiation" },
  { value: "closed_won", label: "Closed Won" },
  { value: "closed_lost", label: "Closed Lost" },
];

type LeadRecord = {
  id: string;
  name: string;
  company: string;
  status: string;
  ownerUid: string | null;
  ownerName: string | null;
  source: string;
  createdAt: string | null;
};

type OwnerOption = { uid: string; name: string };

type LeadListResponse = { ok: boolean; leads: LeadRecord[]; error?: string };

type OwnerListResponse = { ok: boolean; users: OwnerOption[]; error?: string };

export default function AdminLeadsPage() {
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [owners, setOwners] = useState<OwnerOption[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [leadRes, ownerRes] = await Promise.all([
        apiFetch("/api/admin/leads/list", { cache: "no-store" }),
        apiFetch("/api/admin/users/by-role?role=sales", { cache: "no-store" }),
      ]);

      const leadJson = (await leadRes.json()) as LeadListResponse;
      const ownerJson = (await ownerRes.json()) as OwnerListResponse;

      if (!leadRes.ok || !leadJson.ok) {
        throw new Error(leadJson?.error || "Unable to load leads");
      }
      if (!ownerRes.ok || !ownerJson.ok) {
        throw new Error(ownerJson?.error || "Unable to load owners");
      }

      setLeads(leadJson.leads || []);
      setOwners(ownerJson.users || []);
    } catch (err: any) {
      console.error("Admin leads load error", err);
      setError(err?.message || "Unable to load leads");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    const list = leads.filter((lead) => {
      if (statusFilter && lead.status !== statusFilter) return false;
      if (ownerFilter && lead.ownerUid !== ownerFilter) return false;
      return true;
    });
    return smartMatch(list, query, (lead) => [lead.name, lead.company, lead.source, lead.ownerName]);
  }, [leads, ownerFilter, query, statusFilter]);

  const handleAssign = async (lead: LeadRecord, ownerUid: string) => {
    setUpdatingId(lead.id);
    try {
      const res = await apiFetch("/api/sales/leads/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lead.id, ownerUid }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.error || "Unable to update lead");
      }
      await loadData();
    } catch (err) {
      console.error("Admin lead update error", err);
    } finally {
      setUpdatingId(null);
    }
  };

  const headerCellStyle: React.CSSProperties = {
    padding: "12px 14px",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border-subtle)",
    userSelect: "none",
    whiteSpace: "nowrap",
    textAlign: "left",
  };

  const cellStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderBottom: "1px dashed var(--border-subtle)",
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    fontWeight: 400,
  };

  return (
    <div style={{ width: "100%" }}>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Leads</h1>
          <p className="page-subtitle" style={{ marginTop: 6 }}>
            Review all tenant leads with assignment controls. Lead creation is limited to sales roles.
          </p>
        </div>
      </div>

      <div
        className="card"
        style={{
          marginBottom: 16,
          padding: 14,
          borderRadius: 16,
          background: "var(--surface-card)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-md)",
          display: "grid",
          gridTemplateColumns: "minmax(220px, 1.2fr) repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          alignItems: "center",
        }}
      >
        <SmartSearchBar value={query} onChange={setQuery} />
        <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          {STATUS_OPTIONS.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
        <select className="input" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
          <option value="">All owners</option>
          {owners.map((owner) => (
            <option key={owner.uid} value={owner.uid}>
              {owner.name}
            </option>
          ))}
        </select>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {loading ? "Loading..." : `${filtered.length} lead(s)`}
        </div>
      </div>

      <div className="table-shell">
        <div>
        {loading ? (
          <p style={{ fontSize: 14, color: "var(--text-muted)" }}>
            Loading leads...
          </p>
        ) : error ? (
          <p style={{ fontSize: 14, color: "#FCA5A5" }}>{error}</p>
        ) : filtered.length === 0 ? (
          <p style={{ fontSize: 14, color: "var(--text-muted)" }}>
            No leads found.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={headerCellStyle}>Name</th>
                  <th style={headerCellStyle}>Company</th>
                  <th style={headerCellStyle}>Status</th>
                  <th style={headerCellStyle}>Source</th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Owner</th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead) => {
                  return (
                    <tr key={lead.id}>
                      <td style={{ ...cellStyle, whiteSpace: "normal" }}>{lead.name || "-"}</td>
                      <td style={cellStyle}>{lead.company || "-"}</td>
                      <td style={cellStyle}>{lead.status || "-"}</td>
                      <td style={cellStyle}>{lead.source || "-"}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        <select
                          className="input"
                          value={lead.ownerUid || ""}
                          onChange={(e) => handleAssign(lead, e.target.value)}
                          disabled={updatingId === lead.id}
                          style={{ minWidth: 140 }}
                        >
                          <option value="">Unassigned</option>
                          {owners.map((owner) => (
                            <option key={owner.uid} value={owner.uid}>
                              {owner.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>{formatDate(lead.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
