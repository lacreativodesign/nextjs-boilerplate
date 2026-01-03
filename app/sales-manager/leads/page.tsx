"use client";

import { useEffect, useMemo, useState } from "react";
import { useIsDarkMode } from "@/lib/useIsDarkMode";
import { formatDate } from "@/components/finance/financeUtils";

const STAGE_OPTIONS = [
  "All",
  "New Lead",
  "Contacted",
  "Qualified",
  "Proposal Sent",
  "Negotiation",
  "Closed Won",
  "Closed Lost",
];

type LeadRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  stage: string;
  ownerId: string | null;
  ownerName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type OwnerOption = { uid: string; name: string };

type LeadListResponse = { ok: boolean; leads: LeadRecord[] };

type OwnerListResponse = { ok: boolean; owners: OwnerOption[] };

export default function SalesManagerLeadsPage() {
  const isDark = useIsDarkMode();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<LeadRecord[]>([]);
  const [owners, setOwners] = useState<OwnerOption[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [leadsRes, ownersRes] = await Promise.all([
          fetch("/api/sales-manager/leads/list", { cache: "no-store" }),
          fetch("/api/sales-manager/leads/owners", { cache: "no-store" }),
        ]);

        const leadsJson = (await leadsRes.json()) as LeadListResponse;
        const ownersJson = (await ownersRes.json()) as OwnerListResponse;

        if (!leadsRes.ok || !leadsJson.ok) {
          throw new Error(leadsJson ? "" : "Failed to load leads");
        }

        if (!ownersRes.ok || !ownersJson.ok) {
          throw new Error(ownersJson ? "" : "Failed to load sales reps");
        }

        if (!alive) return;
        setRows(Array.isArray(leadsJson.leads) ? leadsJson.leads : []);
        setOwners(Array.isArray(ownersJson.owners) ? ownersJson.owners : []);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Forbidden");
        setRows([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  const sources = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((row) => {
      if (row.source) set.add(row.source);
    });
    return ["All", ...Array.from(set.values())];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = [...rows];

    if (statusFilter !== "All") {
      const desired = statusFilter.toLowerCase();
      list = list.filter((row) => {
        const stage = String(row.stage || "").toLowerCase();
        if (desired === "new lead") {
          return stage === "new" || stage === "new lead";
        }
        return stage === desired;
      });
    }

    if (sourceFilter !== "All") {
      list = list.filter((row) => row.source === sourceFilter);
    }

    if (ownerFilter !== "All") {
      list = list.filter((row) => (ownerFilter === "unassigned" ? !row.ownerId : row.ownerId === ownerFilter));
    }

    if (dateFrom) {
      const from = new Date(dateFrom);
      if (!Number.isNaN(from.getTime())) {
        list = list.filter((row) => {
          if (!row.createdAt) return false;
          const created = new Date(row.createdAt);
          return created >= from;
        });
      }
    }

    if (dateTo) {
      const to = new Date(dateTo);
      if (!Number.isNaN(to.getTime())) {
        to.setHours(23, 59, 59, 999);
        list = list.filter((row) => {
          if (!row.createdAt) return false;
          const created = new Date(row.createdAt);
          return created <= to;
        });
      }
    }

    if (q) {
      list = list.filter((row) => {
        const hay = [row.name, row.email, row.phone, row.source, row.stage, row.ownerName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    return list;
  }, [rows, statusFilter, sourceFilter, ownerFilter, dateFrom, dateTo, query]);

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

  const handleAssign = async (lead: LeadRecord, ownerId: string) => {
    const owner = owners.find((item) => item.uid === ownerId) || null;
    setUpdatingId(lead.id);

    setRows((prev) =>
      prev.map((row) =>
        row.id === lead.id
          ? {
              ...row,
              ownerId: ownerId === "unassigned" ? null : ownerId,
              ownerName: ownerId === "unassigned" ? null : owner?.name || "",
            }
          : row
      )
    );

    try {
      const res = await fetch("/api/sales-manager/leads/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: lead.id,
          ownerId: ownerId === "unassigned" ? "" : ownerId,
          ownerName: ownerId === "unassigned" ? "" : owner?.name || "",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.error || "Unable to update lead.");
      }
    } catch (err) {
      console.error("Lead assignment failed", err);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleConvert = async (lead: LeadRecord) => {
    const confirmed = window.confirm(`Convert ${lead.name || "this lead"} into a deal?`);
    if (!confirmed) return;
    setUpdatingId(lead.id);
    try {
      const res = await fetch("/api/sales-manager/leads/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lead.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.error || "Unable to convert lead.");
      }
      setRows((prev) => prev.filter((row) => row.id !== lead.id));
    } catch (err) {
      console.error("Lead conversion failed", err);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div style={{ width: "100%" }}>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Leads</h1>
          <p className="page-subtitle" style={{ marginTop: 6 }}>
            Full visibility into pipeline leads with assignment and conversion controls.
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
          gridTemplateColumns: "minmax(200px, 1.2fr) repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          alignItems: "center",
        }}
      >
        <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search leads" />
        <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          {STAGE_OPTIONS.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </select>
        <select className="input" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
          {sources.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>
        <select className="input" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
          <option value="All">All owners</option>
          <option value="unassigned">Unassigned</option>
          {owners.map((owner) => (
            <option key={owner.uid} value={owner.uid}>
              {owner.name}
            </option>
          ))}
        </select>
        <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
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
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 1100 }}>
              <thead>
                <tr>
                  <th style={headerCellStyle}>Lead</th>
                  <th style={headerCellStyle}>Contact</th>
                  <th style={headerCellStyle}>Source</th>
                  <th style={headerCellStyle}>Stage</th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Owner</th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Created</th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Actions</th>
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
                      <td style={cellStyle}>
                        <div>{lead.email || "-"}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>{lead.phone || ""}</div>
                      </td>
                      <td style={cellStyle}>{lead.source || "-"}</td>
                      <td style={cellStyle}>{lead.stage || "-"}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        <select
                          className="input"
                          value={lead.ownerId || "unassigned"}
                          onChange={(e) => handleAssign(lead, e.target.value)}
                          disabled={updatingId === lead.id}
                          style={{ minWidth: 140 }}
                        >
                          <option value="unassigned">Unassigned</option>
                          {owners.map((owner) => (
                            <option key={owner.uid} value={owner.uid}>
                              {owner.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>{formatDate(lead.createdAt)}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        <button
                          className="btn ghost"
                          style={{ padding: "8px 14px", borderRadius: 999 }}
                          onClick={() => handleConvert(lead)}
                          disabled={updatingId === lead.id}
                        >
                          Convert
                        </button>
                      </td>
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
