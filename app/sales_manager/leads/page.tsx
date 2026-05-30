"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDate } from "@/components/finance/financeUtils";

const STATUS_OPTIONS = [
  { value: "All", label: "All statuses" },
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
  email: string;
  phone: string;
  source: string;
  company: string;
  status: string;
  ownerUid: string | null;
  ownerName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type OwnerOption = { uid: string; name: string };

type LeadListResponse = { ok: boolean; leads: LeadRecord[] };

type OwnerListResponse = { ok: boolean; owners: OwnerOption[] };

export default function SalesManagerLeadsPage() {
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    source: "website",
    status: "new",
    ownerUid: "",
  });

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [leadsRes, ownersRes] = await Promise.all([
          fetch("/api/sales_manager/leads/list", { cache: "no-store" }),
          fetch("/api/sales_manager/leads/owners", { cache: "no-store" }),
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
      } catch (e) {
        if (!alive) return;
        setError((e instanceof Error ? e.message : undefined) || "Forbidden");
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
      list = list.filter((row) => row.status === statusFilter);
    }

    if (sourceFilter !== "All") {
      list = list.filter((row) => row.source === sourceFilter);
    }

    if (ownerFilter !== "All") {
      list = list.filter((row) => (ownerFilter === "unassigned" ? !row.ownerUid : row.ownerUid === ownerFilter));
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
        const hay = [row.name, row.company, row.email, row.phone, row.source, row.status, row.ownerName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    return list;
  }, [rows, statusFilter, sourceFilter, ownerFilter, dateFrom, dateTo, query]);

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
    color: "var(--text-primary)",
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
              ownerUid: ownerId === "unassigned" ? null : ownerId,
              ownerName: ownerId === "unassigned" ? null : owner?.name || "",
            }
          : row
      )
    );

    try {
      const res = await fetch("/api/sales/leads/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: lead.id,
          ownerUid: ownerId === "unassigned" ? "" : ownerId,
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
      const res = await fetch("/api/leads/convert-to-deal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
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

  const handleCreate = async () => {
    setUpdatingId("create");
    try {
      const res = await fetch("/api/sales/leads/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          company: form.company,
          email: form.email,
          phone: form.phone,
          source: form.source,
          status: form.status,
          ownerUid: form.ownerUid,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.error || "Unable to create lead.");
      }
      setDrawerOpen(false);
      setForm({ name: "", company: "", email: "", phone: "", source: "website", status: "new", ownerUid: "" });
      const refresh = await fetch("/api/sales_manager/leads/list", { cache: "no-store" });
      const data = (await refresh.json()) as LeadListResponse;
      if (refresh.ok && data.ok) {
        setRows(Array.isArray(data.leads) ? data.leads : []);
      }
    } catch (err) {
      console.error("Lead create failed", err);
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
        <button className="btn" style={{ borderRadius: 999 }} onClick={() => setDrawerOpen(true)}>
          New Lead
        </button>
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
          gridTemplateColumns: "minmax(200px, 1.2fr) repeat(auto-fit, minmax(160px, 1fr))",
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
        <div style={{ fontSize: 12, color: "rgba(15,23,42,0.65)" }}>
          {loading ? "Loading..." : `${filtered.length} lead(s)`}
        </div>
      </div>

      <div className="table-shell">
        {loading ? (
          <p style={{ fontSize: 14, color: "rgba(15,23,42,0.70)" }}>
            Loading leads...
          </p>
        ) : error ? (
          <p style={{ fontSize: 14, color: "#FCA5A5" }}>{error}</p>
        ) : filtered.length === 0 ? (
          <p style={{ fontSize: 14, color: "rgba(15,23,42,0.70)" }}>
            No leads found.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 1100 }}>
              <thead>
                <tr>
                  <th style={headerCellStyle}>Name</th>
                  <th style={headerCellStyle}>Company</th>
                  <th style={headerCellStyle}>Status</th>
                  <th style={headerCellStyle}>Source</th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Owner</th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Created</th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead) => (
                  <tr key={lead.id}>
                      <td style={{ ...cellStyle, whiteSpace: "normal" }}>{lead.name || "-"}</td>
                      <td style={cellStyle}>{lead.company || "-"}</td>
                      <td style={cellStyle}>{lead.status || "-"}</td>
                      <td style={cellStyle}>{lead.source || "-"}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        <select
                          className="input"
                          value={lead.ownerUid || "unassigned"}
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {drawerOpen && (
        <div className="drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="drawer-panel drawer-panel--md" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-title">New Lead</div>
            <div className="drawer-subtitle">Capture a new lead for the pipeline.</div>
            <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
              <input
                className="input"
                placeholder="Lead name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Company"
                value={form.company}
                onChange={(e) => setForm((prev) => ({ ...prev, company: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Phone"
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              />
              <select
                className="input"
                value={form.source}
                onChange={(e) => setForm((prev) => ({ ...prev, source: e.target.value }))}
              >
                {sources.map((source) => (
                  <option key={source} value={source === "All" ? "website" : source}>
                    {source === "All" ? "Website" : source}
                  </option>
                ))}
              </select>
              <select
                className="input"
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
              >
                {STATUS_OPTIONS.filter((status) => status.value !== "All").map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
              <select
                className="input"
                value={form.ownerUid}
                onChange={(e) => setForm((prev) => ({ ...prev, ownerUid: e.target.value }))}
              >
                <option value="">Assign owner</option>
                {owners.map((owner) => (
                  <option key={owner.uid} value={owner.uid}>
                    {owner.name}
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-2">
                <button className="btn ghost" onClick={() => setDrawerOpen(false)} style={{ borderRadius: 999 }}>
                  Cancel
                </button>
                <button className="btn" onClick={handleCreate} disabled={updatingId === "create"}>
                  {updatingId === "create" ? "Saving..." : "Create lead"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
