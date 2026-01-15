"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDate } from "@/components/finance/financeUtils";
import { useIsDarkMode } from "@/lib/useIsDarkMode";

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

type LeadListResponse = { ok: boolean; leads: LeadRecord[] };

type OwnerListResponse = { ok: boolean; users: OwnerOption[] };

export default function AdminLeadsPage() {
  const isDark = useIsDarkMode();
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
        fetch("/api/admin/leads/list", { cache: "no-store" }),
        fetch("/api/admin/users/by-role?role=sales", { cache: "no-store" }),
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
    const q = query.trim().toLowerCase();
    return leads.filter((lead) => {
      if (statusFilter && lead.status !== statusFilter) return false;
      if (ownerFilter && lead.ownerUid !== ownerFilter) return false;
      if (q) {
        const hay = [lead.name, lead.company, lead.source, lead.ownerName].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, ownerFilter, query, statusFilter]);

  const handleAssign = async (lead: LeadRecord, ownerUid: string) => {
    setUpdatingId(lead.id);
    try {
      const res = await fetch("/api/sales/leads/update", {
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

  const tableShellStyle: React.CSSProperties = {
    borderRadius: 20,
    padding: 14,
    border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.10)",
    background: isDark ? "rgba(20,20,20,0.92)" : "rgba(255,255,255,0.85)",
    boxShadow: isDark ? "0 18px 40px rgba(0,0,0,0.45)" : "0 18px 55px rgba(15,23,42,0.10)",
  };

  const headerCellStyle: React.CSSProperties = {
    padding: "12px 14px",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: isDark ? "rgba(226,232,240,0.66)" : "rgba(15,23,42,0.55)",
    borderBottom: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.10)",
    userSelect: "none",
    whiteSpace: "nowrap",
    textAlign: "left",
  };

  const cellStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderBottom: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px dashed rgba(15,23,42,0.10)",
    color: isDark ? "rgba(226,232,240,0.86)" : "rgba(15,23,42,0.85)",
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
          background: isDark ? "rgba(24,24,24,0.9)" : "rgba(255,255,255,0.85)",
          border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
          boxShadow: isDark ? "0 14px 28px rgba(0,0,0,0.32)" : "0 12px 24px rgba(15,23,42,0.06)",
          display: "grid",
          gridTemplateColumns: "minmax(220px, 1.2fr) repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          alignItems: "center",
        }}
      >
        <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search leads" />
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
        <div style={{ fontSize: 12, color: isDark ? "rgba(226,232,240,0.75)" : "rgba(15,23,42,0.65)" }}>
          {loading ? "Loading..." : `${filtered.length} lead(s)`}
        </div>
      </div>

      <div style={tableShellStyle}>
        {loading ? (
          <p style={{ fontSize: 14, color: isDark ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.70)" }}>
            Loading leads...
          </p>
        ) : error ? (
          <p style={{ fontSize: 14, color: "#FCA5A5" }}>{error}</p>
        ) : filtered.length === 0 ? (
          <p style={{ fontSize: 14, color: isDark ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.70)" }}>
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
                {filtered.map((lead, idx) => {
                  const rowBg = isDark
                    ? idx % 2 === 0
                      ? "rgba(255,255,255,0.015)"
                      : "rgba(255,255,255,0.00)"
                    : idx % 2 === 0
                    ? "rgba(15,23,42,0.015)"
                    : "rgba(15,23,42,0.00)";

                  const hoverBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.03)";

                  return (
                    <tr
                      key={lead.id}
                      style={{ background: rowBg, transition: "background 120ms ease" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = hoverBg)}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = rowBg)}
                    >
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
  );
}
