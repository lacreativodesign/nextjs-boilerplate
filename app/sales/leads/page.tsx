"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SalesDrawer from "@/components/sales/SalesDrawer";
import { formatDateTime } from "@/components/finance/financeUtils";
import { LEAD_STAGES } from "@/lib/sales/utils";
import { useIsDarkMode } from "@/lib/useIsDarkMode";

const STAGE_OPTIONS = ["All", ...LEAD_STAGES];

type LeadRecord = {
  id: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  source: string;
  notes: string;
  stage: string;
  ownerId?: string | null;
  ownerName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type LeadResponse = { ok: boolean; leads: LeadRecord[]; canCreate?: boolean };

type ErrorState = { title: string; message: string };

type SortKey = "companyName" | "contactName" | "stage" | "source" | "createdAt";

type SortDir = "asc" | "desc";

type LeadForm = {
  id?: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  source: string;
  notes: string;
  stage: string;
};

const defaultForm: LeadForm = {
  companyName: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  source: "",
  notes: "",
  stage: LEAD_STAGES[0],
};

export default function SalesLeadsPage() {
  const isDark = useIsDarkMode();
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("All");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<LeadForm>(defaultForm);
  const [actionLoading, setActionLoading] = useState(false);
  const [canCreate, setCanCreate] = useState(false);

  const loadLeads = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch("/api/sales/leads/list", { cache: "no-store", credentials: "include" });
      const data = (await res.json()) as LeadResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to load leads.");
      }
      setLeads(data.leads || []);
      setCanCreate(Boolean(data.canCreate));
    } catch (err) {
      console.error("Leads load error", err);
      setError({ title: "Unable to load leads", message: "Please try again in a moment." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const filteredLeads = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = [...leads];
    if (stageFilter !== "All") {
      list = list.filter((lead) => lead.stage === stageFilter);
    }
    if (q) {
      list = list.filter((lead) => {
        const hay = [lead.companyName, lead.contactName, lead.contactEmail, lead.contactPhone, lead.source]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }, [leads, query, stageFilter]);

  const sortedLeads = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const list = [...filteredLeads];
    list.sort((a, b) => {
      const valA = String(a[sortKey] ?? "");
      const valB = String(b[sortKey] ?? "");
      return valA.localeCompare(valB) * dir;
    });
    return list;
  }, [filteredLeads, sortDir, sortKey]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortBadge = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? "▲" : "▼";
  };

  const headerLabel = (label: string, badge?: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span>{label}</span>
      <span style={{ width: 14, display: "inline-block", textAlign: "center", opacity: badge ? 1 : 0.35 }}>
        {badge || "•"}
      </span>
    </span>
  );

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
    cursor: "pointer",
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

  const openCreate = () => {
    setDrawerMode("create");
    setForm(defaultForm);
    setDrawerOpen(true);
  };

  const openEdit = (lead: LeadRecord) => {
    setDrawerMode("edit");
    setForm({
      id: lead.id,
      companyName: lead.companyName,
      contactName: lead.contactName,
      contactEmail: lead.contactEmail,
      contactPhone: lead.contactPhone,
      source: lead.source,
      notes: lead.notes || "",
      stage: lead.stage,
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    try {
      setActionLoading(true);
      const endpoint = drawerMode === "create" ? "/api/sales/leads/create" : "/api/sales/leads/update";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to save lead.");
      }
      setDrawerOpen(false);
      await loadLeads();
    } catch (err) {
      console.error("Lead save error", err);
      setError({ title: "Unable to save lead", message: "Please try again." });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="w-full">
      {error && (
        <div
          className="card"
          style={{
            borderRadius: 14,
            padding: 16,
            border: "1px solid rgba(239,68,68,0.35)",
            background: isDark ? "rgba(127,29,29,0.2)" : "rgba(254,226,226,0.6)",
            color: isDark ? "#fecaca" : "#991b1b",
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          <div style={{ fontWeight: 700 }}>{error.title}</div>
          <div style={{ fontSize: 13, opacity: 0.9 }}>{error.message}</div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 style={{ fontSize: 20, fontWeight: 700 }}>Leads</h3>
          <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>
            Monitor every lead assigned to you with quick updates and status tracking.
          </p>
        </div>
        {canCreate && (
          <button className="btn" onClick={openCreate} style={{ borderRadius: 999 }}>
            + Create Lead
          </button>
        )}
      </div>

      <div className="card" style={{ marginTop: 18, padding: 18, borderRadius: 18 }}>
        <div className="grid gap-4 md:grid-cols-[1.4fr_0.6fr_0.5fr]">
          <div>
            <label className="text-xs font-semibold text-slate-500">Search</label>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search keyword"
              className="input mt-2"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Stage</label>
            <select
              value={stageFilter}
              onChange={(event) => setStageFilter(event.target.value)}
              className="input mt-2"
            >
              {STAGE_OPTIONS.map((stage) => (
                <option key={stage} value={stage}>
                  {stage === "All" ? "All stages" : stage}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Sort</label>
            <div className="mt-2 flex gap-2 flex-wrap">
              <button className="btn ghost" onClick={() => toggleSort("createdAt")}>
                Newest {sortBadge("createdAt")}
              </button>
              <button className="btn ghost" onClick={() => toggleSort("companyName")}>
                Company {sortBadge("companyName")}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={tableShellStyle}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
              <thead>
                <tr style={{ background: isDark ? "rgba(30,30,30,0.9)" : "rgba(248,250,252,0.9)" }}>
                  <th style={headerCellStyle} onClick={() => toggleSort("companyName")}>
                    {headerLabel("Company", sortBadge("companyName"))}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("contactName")}>
                    {headerLabel("Contact", sortBadge("contactName"))}
                  </th>
                  <th style={headerCellStyle}>Email</th>
                  <th style={headerCellStyle}>Phone</th>
                  <th style={headerCellStyle} onClick={() => toggleSort("source")}>
                    {headerLabel("Source", sortBadge("source"))}
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }} onClick={() => toggleSort("stage")}>
                    {headerLabel("Stage", sortBadge("stage"))}
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "left" }} onClick={() => toggleSort("createdAt")}>
                    {headerLabel("Created", sortBadge("createdAt"))}
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ padding: 24, textAlign: "center" }}>
                      Loading leads...
                    </td>
                  </tr>
                ) : sortedLeads.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: 24, textAlign: "center" }}>
                      No leads found.
                    </td>
                  </tr>
                ) : (
                  sortedLeads.map((lead) => (
                    <tr key={lead.id}>
                      <td style={cellStyle}>{lead.companyName || "-"}</td>
                      <td style={cellStyle}>{lead.contactName || "-"}</td>
                      <td style={cellStyle}>{lead.contactEmail || "-"}</td>
                      <td style={cellStyle}>{lead.contactPhone || "-"}</td>
                      <td style={cellStyle}>{lead.source || "-"}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>{lead.stage}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>{formatDateTime(lead.createdAt)}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        <button className="btn ghost" onClick={() => openEdit(lead)} style={{ borderRadius: 999 }}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {drawerOpen && (
        <SalesDrawer
          title={drawerMode === "create" ? "Create Lead" : "Lead Details"}
          subtitle={drawerMode === "create" ? "Capture a new lead" : "Update lead status"}
          onClose={() => setDrawerOpen(false)}
          actions={
            <button className="btn" onClick={handleSave} disabled={actionLoading}>
              {actionLoading ? "Saving..." : "Save Lead"}
            </button>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-500">Company</label>
              <input
                className="input mt-2"
                value={form.companyName}
                onChange={(event) => setForm((prev) => ({ ...prev, companyName: event.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Contact Name</label>
              <input
                className="input mt-2"
                value={form.contactName}
                onChange={(event) => setForm((prev) => ({ ...prev, contactName: event.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Contact Email</label>
              <input
                className="input mt-2"
                value={form.contactEmail}
                onChange={(event) => setForm((prev) => ({ ...prev, contactEmail: event.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Contact Phone</label>
              <input
                className="input mt-2"
                value={form.contactPhone}
                onChange={(event) => setForm((prev) => ({ ...prev, contactPhone: event.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Source</label>
              <input
                className="input mt-2"
                value={form.source}
                onChange={(event) => setForm((prev) => ({ ...prev, source: event.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Stage</label>
              <select
                className="input mt-2"
                value={form.stage}
                onChange={(event) => setForm((prev) => ({ ...prev, stage: event.target.value }))}
              >
                {LEAD_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {stage}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-500">Notes</label>
              <textarea
                className="input mt-2"
                rows={4}
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>
          </div>
        </SalesDrawer>
      )}
    </div>
  );
}
