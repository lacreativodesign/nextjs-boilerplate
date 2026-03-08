"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import MasterSelect from "@/components/ui/MasterSelect";
import SalesDrawer from "@/components/sales/SalesDrawer";
import { formatDate, formatDateTime } from "@/components/finance/financeUtils";
import { LEAD_STAGES } from "@/lib/sales/utils";
import { useIsDarkMode } from "@/lib/useIsDarkMode";

const STAGE_OPTIONS = [{ label: "All Stages", value: "" }, ...LEAD_STAGES.map((stage) => ({ label: stage, value: stage }))];

type LeadRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  stage: string;
  ownerId?: string | null;
  ownerName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type UserOption = { uid: string; name?: string; fullName?: string; role?: string };

type ErrorState = { title: string; message: string };

type LeadFormState = {
  id?: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  stage: string;
  ownerId: string;
  ownerName: string;
};

const defaultForm: LeadFormState = {
  name: "",
  email: "",
  phone: "",
  source: "",
  stage: LEAD_STAGES[0],
  ownerId: "",
  ownerName: "",
};

export default function SalesLeadsPage() {
  const isDark = useIsDarkMode();
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [owners, setOwners] = useState<UserOption[]>([]);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<LeadFormState>(defaultForm);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadLeads = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch("/api/admin/sales/leads/list", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to load leads.");
      }
      setLeads(data.leads || []);
    } catch (err) {
      console.error("Leads load error", err);
      setError({ title: "Unable to load leads", message: "Please try again in a moment." });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOwners = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users/list", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setOwners(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Owners load error", err);
    }
  }, []);

  useEffect(() => {
    loadLeads();
    loadOwners();
  }, [loadLeads, loadOwners]);

  const ownerOptions = useMemo(
    () => [
      { label: "All Owners", value: "" },
      ...owners.map((owner) => ({ label: owner.name || owner.fullName || owner.uid, value: owner.uid })),
    ],
    [owners]
  );

  const filteredLeads = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((lead) => {
      if (stageFilter && lead.stage !== stageFilter) return false;
      if (ownerFilter && lead.ownerId !== ownerFilter) return false;
      if (q) {
        const hay = [lead.name, lead.email, lead.phone, lead.source, lead.ownerName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, query, stageFilter, ownerFilter]);

  const openCreate = () => {
    setDrawerMode("create");
    setForm(defaultForm);
    setDrawerOpen(true);
  };

  const openEdit = (lead: LeadRecord) => {
    setDrawerMode("edit");
    setForm({
      id: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      source: lead.source,
      stage: lead.stage,
      ownerId: lead.ownerId || "",
      ownerName: lead.ownerName || "",
    });
    setDrawerOpen(true);
  };

  const handleOwnerChange = (ownerId: string) => {
    const owner = owners.find((item) => item.uid === ownerId);
    setForm((prev) => ({
      ...prev,
      ownerId,
      ownerName: owner?.name || owner?.fullName || "",
    }));
  };

  const handleSave = async () => {
    try {
      setActionLoading("save");
      const payload = {
        ...form,
      };
      const endpoint = drawerMode === "create" ? "/api/admin/sales/leads/create" : "/api/admin/sales/leads/update";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      setActionLoading(null);
    }
  };

  const handleDelete = async (lead: LeadRecord) => {
    try {
      setActionLoading(lead.id);
      const res = await fetch("/api/admin/sales/leads/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lead.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to delete lead.");
      }
      await loadLeads();
    } catch (err) {
      console.error("Lead delete error", err);
      setError({ title: "Unable to delete lead", message: "Please try again." });
    } finally {
      setActionLoading(null);
    }
  };

  const handleConvert = async (lead: LeadRecord) => {
    try {
      setActionLoading(`${lead.id}-convert`);
      const res = await fetch("/api/admin/sales/deals/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          leadName: lead.name,
          leadEmail: lead.email,
          leadPhone: lead.phone,
          clientName: lead.name,
          source: lead.source,
          ownerId: lead.ownerId || "",
          ownerName: lead.ownerName || "",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to convert lead.");
      }
      await fetch("/api/admin/sales/leads/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lead.id, stage: "Converted" }),
      });
      await loadLeads();
    } catch (err) {
      console.error("Lead convert error", err);
      setError({ title: "Unable to convert lead", message: "Please try again." });
    } finally {
      setActionLoading(null);
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
            Live lead capture with owner assignment and conversion tools.
          </p>
        </div>
        <button className="btn" onClick={openCreate} style={{ borderRadius: 999 }}>
          Create Lead
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <input
          className="input"
          placeholder="Search keyword"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ minWidth: 220 }}
        />
        <MasterSelect value={stageFilter} onChange={(value) => setStageFilter(value)} options={STAGE_OPTIONS} />
        <MasterSelect value={ownerFilter} onChange={(value) => setOwnerFilter(value)} options={ownerOptions} />
        <button
          type="button"
          className="btn"
          onClick={() => {
            setQuery("");
            setStageFilter("");
            setOwnerFilter("");
          }}
          style={{ borderRadius: 999, padding: "10px 16px", fontWeight: 500 }}
        >
          Reset Filters
        </button>
      </div>

      <div
        className="card"
        style={{
          marginTop: 20,
          padding: 0,
          borderRadius: 18,
          background: isDark ? "rgba(20,20,20,0.92)" : "rgba(255,255,255,0.95)",
          border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
          boxShadow: isDark ? "0 18px 40px rgba(0,0,0,0.35)" : "0 18px 40px rgba(15,23,42,0.08)",
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
            <thead>
              <tr style={{ background: isDark ? "rgba(30,30,30,0.9)" : "rgba(248,250,252,0.9)" }}>
                <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>Name</th>
                <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>Email</th>
                <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>Phone</th>
                <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>Source</th>
                <th style={{ textAlign: "right", padding: "14px 16px", fontWeight: 700 }}>Stage</th>
                <th style={{ textAlign: "right", padding: "14px 16px", fontWeight: 700 }}>Owner</th>
                <th style={{ textAlign: "right", padding: "14px 16px", fontWeight: 700 }}>Created At</th>
                <th style={{ textAlign: "center", padding: "14px 16px", fontWeight: 700 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: 24, textAlign: "center" }}>
                    Loading leads...
                  </td>
                </tr>
              ) : filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 24, textAlign: "center" }}>
                    No leads found.
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => (
                  <tr key={lead.id} style={{ borderTop: isDark ? "1px solid rgba(148,163,184,0.15)" : "1px solid #e2e8f0" }}>
                    <td style={{ padding: "14px 16px", fontWeight: 600 }}>{lead.name}</td>
                    <td style={{ padding: "14px 16px" }}>{lead.email || "-"}</td>
                    <td style={{ padding: "14px 16px" }}>{lead.phone || "-"}</td>
                    <td style={{ padding: "14px 16px" }}>{lead.source || "-"}</td>
                    <td style={{ padding: "14px 16px", textAlign: "right" }}>{lead.stage}</td>
                    <td style={{ padding: "14px 16px", textAlign: "right" }}>{lead.ownerName || "Unassigned"}</td>
                    <td style={{ padding: "14px 16px", textAlign: "right" }}>{formatDate(lead.createdAt)}</td>
                    <td style={{ padding: "14px 16px", textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => openEdit(lead)}
                          style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12 }}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => handleConvert(lead)}
                          disabled={actionLoading === `${lead.id}-convert`}
                          style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12 }}
                        >
                          {actionLoading === `${lead.id}-convert` ? "Converting" : "Convert"}
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => handleDelete(lead)}
                          disabled={actionLoading === lead.id}
                          style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12 }}
                        >
                          {actionLoading === lead.id ? "Deleting" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {drawerOpen && (
        <SalesDrawer
          title={drawerMode === "create" ? "Create Lead" : "Lead Details"}
          subtitle={drawerMode === "create" ? "Capture a new lead" : formatDateTime(form.id ? leads.find((l) => l.id === form.id)?.updatedAt : null)}
          onClose={() => setDrawerOpen(false)}
          isDark={isDark}
          actions={
            <>
              <button className="btn" onClick={handleSave} disabled={actionLoading === "save"} style={{ borderRadius: 999 }}>
                {actionLoading === "save" ? "Saving" : "Save Lead"}
              </button>
              {drawerMode === "edit" && (
                <button
                  className="btn ghost"
                  onClick={() => {
                    if (form.id) {
                      const lead = leads.find((item) => item.id === form.id);
                      if (lead) handleConvert(lead);
                    }
                  }}
                  style={{ borderRadius: 999 }}
                >
                  Convert to Deal
                </button>
              )}
            </>
          }
        >
          <div className="card" style={{ padding: 16, borderRadius: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Lead Profile</div>
            <div style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Name</span>
                <input
                  className="input"
                  placeholder="Lead name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Email</span>
                <input
                  className="input"
                  placeholder="Lead email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Phone</span>
                <input
                  className="input"
                  placeholder="Lead phone"
                  value={form.phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Source</span>
                <input
                  className="input"
                  placeholder="Source"
                  value={form.source}
                  onChange={(e) => setForm((prev) => ({ ...prev, source: e.target.value }))}
                />
              </label>
              <div style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Stage</span>
                <MasterSelect
                  value={form.stage}
                  onChange={(value) => setForm((prev) => ({ ...prev, stage: value }))}
                  options={LEAD_STAGES.map((stage) => ({ label: stage, value: stage }))}
                />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Owner</span>
                <MasterSelect value={form.ownerId} onChange={handleOwnerChange} options={ownerOptions} />
              </div>
            </div>
          </div>
        </SalesDrawer>
      )}
    </div>
  );
}
