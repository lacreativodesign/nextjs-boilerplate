"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import SalesDrawer from "@/components/sales/SalesDrawer";
import { formatDateTime, formatUsd } from "@/components/finance/financeUtils";
import { LEAD_DISPOSITIONS, LEAD_SOURCES, LEAD_STAGES, toInputDateTime } from "@/lib/sales/utils";
import { useIsDarkMode } from "@/lib/useIsDarkMode";

const STAGE_OPTIONS = ["All", ...LEAD_STAGES];
const DISPOSITION_OPTIONS = ["All", ...LEAD_DISPOSITIONS];

type LeadRecord = {
  id: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  source: string;
  notes: string;
  stage: string;
  disposition: string;
  expectedValueUsd: number;
  packageName: string;
  interestedServices: string[];
  probability: number;
  lastContactedAt?: string | null;
  nextFollowUpAt?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type LeadResponse = { ok: boolean; leads: LeadRecord[]; canCreate?: boolean };

type ErrorState = { title: string; message: string };

type SortKey =
  | "companyName"
  | "contactName"
  | "contactEmail"
  | "contactPhone"
  | "source"
  | "stage"
  | "disposition"
  | "expectedValueUsd"
  | "nextFollowUpAt"
  | "createdAt";

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
  disposition: string;
  expectedValueUsd: number;
  packageName: string;
  interestedServices: string;
  probability: number;
  lastContactedAt: string;
  nextFollowUpAt: string;
};

const defaultForm: LeadForm = {
  companyName: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  source: LEAD_SOURCES[0],
  notes: "",
  stage: LEAD_STAGES[0],
  disposition: "",
  expectedValueUsd: 0,
  packageName: "",
  interestedServices: "",
  probability: 0,
  lastContactedAt: "",
  nextFollowUpAt: "",
};

type NoteRecord = {
  id: string;
  body: string;
  authorName: string;
  authorRole: string;
  createdAt: string | null;
};

type EmailRecord = {
  id: string;
  subject: string;
  from: string[];
  to: string[];
  bodyText: string;
  bodyHtml?: string | null;
  direction: string;
  createdAt: string | null;
  status: string;
};

type PaymentRequest = {
  id: string;
  amountUsd: number;
  currency: string;
  status: string;
  checkoutUrl?: string | null;
  createdAt: string | null;
};

export default function SalesLeadsPage() {
  const isDark = useIsDarkMode();
  const searchParams = useSearchParams();
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("All");
  const [dispositionFilter, setDispositionFilter] = useState("All");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [activeTab, setActiveTab] = useState<"details" | "notes" | "emails" | "payments">("details");
  const [form, setForm] = useState<LeadForm>(defaultForm);
  const [actionLoading, setActionLoading] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [noteBody, setNoteBody] = useState("");
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [emailForm, setEmailForm] = useState({ to: "", subject: "", bodyText: "" });
  const [payments, setPayments] = useState<PaymentRequest[]>([]);
  const [paymentForm, setPaymentForm] = useState({ amountUsd: "", description: "" });

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
    } catch (err: any) {
      console.error("Leads load error", err);
      setError({ title: "Unable to load leads", message: err?.message || "Please try again in a moment." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId || leads.length === 0) return;
    const lead = leads.find((item) => item.id === openId);
    if (lead) {
      openEdit(lead);
    }
  }, [searchParams, leads]);

  const filteredLeads = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = [...leads];
    if (stageFilter !== "All") {
      list = list.filter((lead) => lead.stage === stageFilter);
    }
    if (dispositionFilter !== "All") {
      list = list.filter((lead) => lead.disposition === dispositionFilter);
    }
    if (q) {
      list = list.filter((lead) => {
        const hay = [
          lead.companyName,
          lead.contactName,
          lead.contactEmail,
          lead.contactPhone,
          lead.source,
          lead.stage,
          lead.disposition,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }, [leads, query, stageFilter, dispositionFilter]);

  const sortedLeads = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const list = [...filteredLeads];
    list.sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      if (typeof valA === "number" && typeof valB === "number") {
        return (valA - valB) * dir;
      }
      return String(valA ?? "").localeCompare(String(valB ?? "")) * dir;
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
    setActiveTab("details");
    setForm(defaultForm);
    setEmailForm({ to: "", subject: "", bodyText: "" });
    setNotes([]);
    setNoteBody("");
    setEmails([]);
    setPayments([]);
    setPaymentForm({ amountUsd: "", description: "" });
    setDrawerOpen(true);
  };

  const openEdit = (lead: LeadRecord) => {
    setDrawerMode("edit");
    setActiveTab("details");
    setForm({
      id: lead.id,
      companyName: lead.companyName,
      contactName: lead.contactName,
      contactEmail: lead.contactEmail,
      contactPhone: lead.contactPhone,
      source: lead.source || LEAD_SOURCES[0],
      notes: lead.notes || "",
      stage: lead.stage,
      disposition: lead.disposition || "",
      expectedValueUsd: lead.expectedValueUsd || 0,
      packageName: lead.packageName || "",
      interestedServices: (lead.interestedServices || []).join(", "),
      probability: lead.probability || 0,
      lastContactedAt: lead.lastContactedAt ? lead.lastContactedAt.slice(0, 10) : "",
      nextFollowUpAt: toInputDateTime(lead.nextFollowUpAt),
    });
    setDrawerOpen(true);
    loadNotes(lead.id);
    loadEmails(lead.id);
    loadPayments(lead.id);
    setEmailForm((prev) => ({ ...prev, to: lead.contactEmail || "" }));
  };

  const handleSave = async () => {
    const needsFollowUp = form.disposition.trim().toLowerCase() === "follow-up needed";
    if (needsFollowUp && !form.nextFollowUpAt) {
      setError({ title: "Follow-up required", message: "Select a follow-up date and time before saving." });
      return;
    }
    try {
      setActionLoading(true);
      const endpoint = drawerMode === "create" ? "/api/sales/leads/create" : "/api/sales/leads/update";
      const payload = {
        ...form,
        expectedValueUsd: Number(form.expectedValueUsd || 0),
        probability: Number(form.probability || 0),
        interestedServices: form.interestedServices
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        lastContactedAt: form.lastContactedAt || null,
        nextFollowUpAt: form.nextFollowUpAt || null,
      };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to save lead.");
      }
      setDrawerOpen(false);
      setError(null);
      await loadLeads();
    } catch (err: any) {
      console.error("Lead save error", err);
      setError({ title: "Unable to save lead", message: err?.message || "Please try again." });
    } finally {
      setActionLoading(false);
    }
  };

  const loadNotes = useCallback(async (leadId: string) => {
    if (!leadId) return;
    try {
      const res = await fetch(`/api/sales/lead-notes/list?leadId=${encodeURIComponent(leadId)}`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setNotes(data.notes || []);
      }
    } catch (err) {
      console.error("Notes load error", err);
    }
  }, []);

  const handleAddNote = async () => {
    if (!form.id || !noteBody.trim()) return;
    try {
      const res = await fetch("/api/sales/lead-notes/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ leadId: form.id, body: noteBody }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to add note.");
      }
      setNoteBody("");
      await loadNotes(form.id);
    } catch (err) {
      console.error("Note save error", err);
    }
  };

  const loadEmails = useCallback(async (leadId: string) => {
    if (!leadId) return;
    try {
      const res = await fetch(`/api/sales/email/list?leadId=${encodeURIComponent(leadId)}`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setEmails(data.emails || []);
      }
    } catch (err) {
      console.error("Email load error", err);
    }
  }, []);

  const handleSendEmail = async () => {
    if (!form.id) return;
    try {
      const res = await fetch("/api/sales/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          leadId: form.id,
          to: emailForm.to,
          subject: emailForm.subject,
          bodyText: emailForm.bodyText,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to send email.");
      }
      setEmailForm({ to: "", subject: "", bodyText: "" });
      await loadEmails(form.id);
    } catch (err) {
      console.error("Email send error", err);
    }
  };

  const loadPayments = useCallback(async (leadId: string) => {
    if (!leadId) return;
    try {
      const res = await fetch(`/api/sales/payments/list?leadId=${encodeURIComponent(leadId)}`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setPayments(data.requests || []);
      }
    } catch (err) {
      console.error("Payments load error", err);
    }
  }, []);

  const handlePaymentLink = async () => {
    if (!form.id) return;
    try {
      const res = await fetch("/api/sales/payments/create-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          leadId: form.id,
          amountUsd: Number(paymentForm.amountUsd || 0),
          description: paymentForm.description,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to create payment link.");
      }
      setPaymentForm({ amountUsd: "", description: "" });
      await loadPayments(form.id);
    } catch (err) {
      console.error("Payment link error", err);
    }
  };

  const drawerTabs = [
    { id: "details", label: "Details" },
    { id: "notes", label: "Notes" },
    { id: "emails", label: "Emails" },
    { id: "payments", label: "Payments" },
  ] as const;

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
        <div className="grid gap-4 md:grid-cols-[1.2fr_0.5fr_0.5fr]">
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
            <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)} className="input mt-2">
              {STAGE_OPTIONS.map((stage) => (
                <option key={stage} value={stage}>
                  {stage === "All" ? "All stages" : stage}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Disposition</label>
            <select
              value={dispositionFilter}
              onChange={(event) => setDispositionFilter(event.target.value)}
              className="input mt-2"
            >
              {DISPOSITION_OPTIONS.map((disposition) => (
                <option key={disposition} value={disposition}>
                  {disposition === "All" ? "All dispositions" : disposition}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={tableShellStyle}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1200 }}>
              <thead>
                <tr style={{ background: isDark ? "rgba(30,30,30,0.9)" : "rgba(248,250,252,0.9)" }}>
                  <th style={headerCellStyle} onClick={() => toggleSort("companyName")}>
                    {headerLabel("Company", sortBadge("companyName"))}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("contactName")}>
                    {headerLabel("Contact", sortBadge("contactName"))}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("contactEmail")}>
                    {headerLabel("Email", sortBadge("contactEmail"))}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("contactPhone")}>
                    {headerLabel("Phone", sortBadge("contactPhone"))}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("source")}>
                    {headerLabel("Source", sortBadge("source"))}
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "left" }} onClick={() => toggleSort("stage")}>
                    {headerLabel("Stage", sortBadge("stage"))}
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "left" }} onClick={() => toggleSort("disposition")}>
                    {headerLabel("Disposition", sortBadge("disposition"))}
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "right" }} onClick={() => toggleSort("expectedValueUsd")}>
                    {headerLabel("Expected Value", sortBadge("expectedValueUsd"))}
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "left" }} onClick={() => toggleSort("nextFollowUpAt")}>
                    {headerLabel("Next Follow-Up", sortBadge("nextFollowUpAt"))}
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
                    <td colSpan={11} style={{ padding: 24, textAlign: "center" }}>
                      Loading leads...
                    </td>
                  </tr>
                ) : sortedLeads.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ padding: 24, textAlign: "center" }}>
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
                      <td style={{ ...cellStyle, textAlign: "left" }}>{lead.stage}</td>
                      <td style={{ ...cellStyle, textAlign: "left" }}>{lead.disposition || "-"}</td>
                      <td style={{ ...cellStyle, textAlign: "right" }}>{formatUsd(lead.expectedValueUsd || 0)}</td>
                      <td style={{ ...cellStyle, textAlign: "left" }}>{formatDateTime(lead.nextFollowUpAt)}</td>
                      <td style={{ ...cellStyle, textAlign: "left" }}>{formatDateTime(lead.createdAt)}</td>
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
          <div className="tabs-bar" style={{ marginBottom: 16 }}>
            {drawerTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`tab-pill ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "details" && (
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
                <select
                  className="input mt-2"
                  value={form.source}
                  onChange={(event) => setForm((prev) => ({ ...prev, source: event.target.value }))}
                >
                  {LEAD_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
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
              <div>
                <label className="text-xs font-semibold text-slate-500">Disposition</label>
                <select
                  className="input mt-2"
                  value={form.disposition}
                  onChange={(event) => setForm((prev) => ({ ...prev, disposition: event.target.value }))}
                >
                  <option value="">Select disposition</option>
                  {LEAD_DISPOSITIONS.map((disposition) => (
                    <option key={disposition} value={disposition}>
                      {disposition}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Expected Value (USD)</label>
                <input
                  className="input mt-2"
                  type="number"
                  min={0}
                  value={form.expectedValueUsd}
                  onChange={(event) => setForm((prev) => ({ ...prev, expectedValueUsd: Number(event.target.value) }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Package</label>
                <input
                  className="input mt-2"
                  value={form.packageName}
                  onChange={(event) => setForm((prev) => ({ ...prev, packageName: event.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Interested Services</label>
                <input
                  className="input mt-2"
                  value={form.interestedServices}
                  onChange={(event) => setForm((prev) => ({ ...prev, interestedServices: event.target.value }))}
                  placeholder="Design, Branding, SEO"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Probability (0-100)</label>
                <input
                  className="input mt-2"
                  type="number"
                  min={0}
                  max={100}
                  value={form.probability}
                  onChange={(event) => setForm((prev) => ({ ...prev, probability: Number(event.target.value) }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Last Contacted</label>
                <input
                  className="input mt-2"
                  type="date"
                  value={form.lastContactedAt}
                  onChange={(event) => setForm((prev) => ({ ...prev, lastContactedAt: event.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Next Follow-Up (Date & Time)</label>
                <input
                  className="input mt-2"
                  type="datetime-local"
                  value={form.nextFollowUpAt}
                  onChange={(event) => setForm((prev) => ({ ...prev, nextFollowUpAt: event.target.value }))}
                />
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
          )}

          {activeTab === "notes" && (
            <div className="grid gap-4">
              <div className="card" style={{ padding: 14, borderRadius: 14 }}>
                <label className="text-xs font-semibold text-slate-500">Add note</label>
                <textarea
                  className="input mt-2"
                  rows={3}
                  value={noteBody}
                  onChange={(event) => setNoteBody(event.target.value)}
                />
                <div className="mt-3">
                  <button className="btn" type="button" onClick={handleAddNote}>
                    Add note
                  </button>
                </div>
              </div>
              <div className="grid gap-3">
                {notes.length === 0 && <div className="text-sm text-slate-500">No notes yet.</div>}
                {notes.map((note) => (
                  <div key={note.id} className="card" style={{ padding: 14, borderRadius: 14 }}>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {note.authorName || "Sales"} · {note.authorRole || ""} · {formatDateTime(note.createdAt)}
                    </div>
                    <div style={{ marginTop: 6 }}>{note.body}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "emails" && (
            <div className="grid gap-4">
              <div className="card" style={{ padding: 14, borderRadius: 14 }}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-500">To</label>
                    <input
                      className="input mt-2"
                      value={emailForm.to}
                      onChange={(event) => setEmailForm((prev) => ({ ...prev, to: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500">Subject</label>
                    <input
                      className="input mt-2"
                      value={emailForm.subject}
                      onChange={(event) => setEmailForm((prev) => ({ ...prev, subject: event.target.value }))}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-500">Message</label>
                    <textarea
                      className="input mt-2"
                      rows={4}
                      value={emailForm.bodyText}
                      onChange={(event) => setEmailForm((prev) => ({ ...prev, bodyText: event.target.value }))}
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <button className="btn" type="button" onClick={handleSendEmail}>
                    Send email
                  </button>
                </div>
              </div>
              <div className="grid gap-3">
                {emails.length === 0 && <div className="text-sm text-slate-500">No emails logged yet.</div>}
                {emails.map((email) => (
                  <div key={email.id} className="card" style={{ padding: 14, borderRadius: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12 }}>
                      <div>
                        <strong>{email.subject || "(no subject)"}</strong>
                        <div style={{ color: "var(--text-muted)" }}>
                          {email.direction === "outbound" ? "Sent to" : "From"} {email.direction === "outbound" ? email.to?.[0] : email.from?.[0]}
                        </div>
                      </div>
                      <div style={{ color: "var(--text-muted)" }}>{formatDateTime(email.createdAt)}</div>
                    </div>
                    <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{email.bodyText}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "payments" && (
            <div className="grid gap-4">
              <div className="card" style={{ padding: 14, borderRadius: 14 }}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-500">Amount (USD)</label>
                    <input
                      className="input mt-2"
                      type="number"
                      min={0}
                      value={paymentForm.amountUsd}
                      onChange={(event) => setPaymentForm((prev) => ({ ...prev, amountUsd: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500">Description</label>
                    <input
                      className="input mt-2"
                      value={paymentForm.description}
                      onChange={(event) => setPaymentForm((prev) => ({ ...prev, description: event.target.value }))}
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <button className="btn" type="button" onClick={handlePaymentLink}>
                    Send payment link
                  </button>
                </div>
              </div>
              <div className="grid gap-3">
                {payments.length === 0 && <div className="text-sm text-slate-500">No payment requests yet.</div>}
                {payments.map((payment) => (
                  <div key={payment.id} className="card" style={{ padding: 14, borderRadius: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <div>
                        <strong>{formatUsd(payment.amountUsd)}</strong>
                        <div style={{ color: "var(--text-muted)" }}>Status: {payment.status}</div>
                      </div>
                      <div style={{ color: "var(--text-muted)" }}>{formatDateTime(payment.createdAt)}</div>
                    </div>
                    {payment.checkoutUrl && (
                      <div style={{ marginTop: 8 }}>
                        <a className="btn ghost" href={payment.checkoutUrl} target="_blank" rel="noreferrer">
                          Open checkout link
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </SalesDrawer>
      )}
    </div>
  );
}
