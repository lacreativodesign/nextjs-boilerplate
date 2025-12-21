"use client";

import { useState } from "react";

type SalesStage =
  | "New Lead"
  | "Contacted"
  | "Qualified"
  | "Proposal Sent"
  | "Negotiation"
  | "Closed Won"
  | "Closed Lost";

type PaymentStatus = "Unpaid" | "Partially Paid" | "Paid" | "Refunded";

export default function AddClientPage() {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [form, setForm] = useState({
    companyName: "",
    website: "",
    industry: "",
    country: "",
    timezone: "",

    primaryContactName: "",
    primaryContactEmail: "",
    primaryContactPhone: "",

    stage: "New Lead" as SalesStage,
    paymentStatus: "Unpaid" as PaymentStatus,
  });

  const set = (k: keyof typeof form, v: any) => setForm((p) => ({ ...p, [k]: v }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!form.companyName.trim()) {
      setMsg("Company name is required.");
      return;
    }
    if (!form.primaryContactName.trim()) {
      setMsg("Contact name is required.");
      return;
    }
    if (!form.primaryContactEmail.trim()) {
      setMsg("Contact email is required.");
      return;
    }

    try {
      setSaving(true);

      const res = await fetch("/api/admin/clients/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to add client");
      }

      setMsg("Client created successfully.");
      setForm({
        companyName: "",
        website: "",
        industry: "",
        country: "",
        timezone: "",

        primaryContactName: "",
        primaryContactEmail: "",
        primaryContactPhone: "",

        stage: "New Lead",
        paymentStatus: "Unpaid",
      });
    } catch (err: any) {
      setMsg(err?.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  // Master UI typography sizing (same “feel” as Key Accounts)
  const titleStyle: React.CSSProperties = {
    fontSize: 34,
    fontWeight: 900,
    marginBottom: 8,
  };

  const subStyle: React.CSSProperties = {
    marginBottom: 18,
    opacity: 0.75,
    fontSize: 14,
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    opacity: 0.75,
    marginBottom: 10,
  };

  const grid4: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
  };

  const grid3: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12,
  };

  const grid2: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  };

  const grid1: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 12,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    opacity: 0.75,
    marginBottom: 6,
    display: "block",
  };

  const fieldWrap: React.CSSProperties = { display: "flex", flexDirection: "column" };

  return (
    <div style={{ width: "100%" }}>
      <h1 style={titleStyle}>Add Client</h1>
      <div style={subStyle}>
        Create a new client record and start tracking pipeline, payments and ownership.
      </div>

      <form onSubmit={onSubmit} className="card" style={{ padding: 18, borderRadius: 20 }}>
        {/* COMPANY INFORMATION */}
        <div style={sectionTitle}>Company Information</div>

        <div style={grid4}>
          <div style={fieldWrap}>
            <label style={labelStyle}>
              Company Name <span style={{ color: "var(--danger, #EF4444)" }}>*</span>
            </label>
            <input
              className="input"
              value={form.companyName}
              onChange={(e) => set("companyName", e.target.value)}
              placeholder="Acme Trading LLC"
            />
          </div>

          <div style={fieldWrap}>
            <label style={labelStyle}>Website</label>
            <input
              className="input"
              value={form.website}
              onChange={(e) => set("website", e.target.value)}
              placeholder="https://example.com"
            />
          </div>

          <div style={fieldWrap}>
            <label style={labelStyle}>Industry</label>
            <input
              className="input"
              value={form.industry}
              onChange={(e) => set("industry", e.target.value)}
              placeholder="Construction"
            />
          </div>

          <div style={fieldWrap}>
            <label style={labelStyle}>Country</label>
            <input
              className="input"
              value={form.country}
              onChange={(e) => set("country", e.target.value)}
              placeholder="United States"
            />
          </div>
        </div>

        <div style={{ height: 12 }} />

        <div style={grid2}>
          <div style={fieldWrap}>
            <label style={labelStyle}>Timezone</label>
            <input
              className="input"
              value={form.timezone}
              onChange={(e) => set("timezone", e.target.value)}
              placeholder="America/New_York"
            />
          </div>
          <div />
        </div>

        <div style={{ height: 18 }} />

        {/* PRIMARY CONTACT */}
        <div style={sectionTitle}>Primary Contact</div>

        <div style={grid3}>
          <div style={fieldWrap}>
            <label style={labelStyle}>
              Contact Name <span style={{ color: "var(--danger, #EF4444)" }}>*</span>
            </label>
            <input
              className="input"
              value={form.primaryContactName}
              onChange={(e) => set("primaryContactName", e.target.value)}
              placeholder="Ali Khan"
            />
          </div>

          <div style={fieldWrap}>
            <label style={labelStyle}>
              Contact Email <span style={{ color: "var(--danger, #EF4444)" }}>*</span>
            </label>
            <input
              className="input"
              value={form.primaryContactEmail}
              onChange={(e) => set("primaryContactEmail", e.target.value)}
              placeholder="ali@acmetrading.com"
            />
          </div>

          <div style={fieldWrap}>
            <label style={labelStyle}>Contact Phone</label>
            <input
              className="input"
              value={form.primaryContactPhone}
              onChange={(e) => set("primaryContactPhone", e.target.value)}
              placeholder="+1 312 555 0199"
            />
          </div>
        </div>

        <div style={{ height: 18 }} />

        {/* PIPELINE */}
        <div style={sectionTitle}>Pipeline</div>

        <div style={grid2}>
          <div style={fieldWrap}>
            <label style={labelStyle}>Sales Stage</label>
            <select
              className="input"
              value={form.stage}
              onChange={(e) => set("stage", e.target.value as SalesStage)}
            >
              <option>New Lead</option>
              <option>Contacted</option>
              <option>Qualified</option>
              <option>Proposal Sent</option>
              <option>Negotiation</option>
              <option>Closed Won</option>
              <option>Closed Lost</option>
            </select>
          </div>

          <div style={fieldWrap}>
            <label style={labelStyle}>Payment Status</label>
            <select
              className="input"
              value={form.paymentStatus}
              onChange={(e) => set("paymentStatus", e.target.value as PaymentStatus)}
            >
              <option>Unpaid</option>
              <option>Partially Paid</option>
              <option>Paid</option>
              <option>Refunded</option>
            </select>
          </div>
        </div>

        <div style={{ height: 16 }} />

        {/* Footer actions */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            {msg ? msg : " "}
          </div>

          <button className="btn" type="submit" disabled={saving} style={{ borderRadius: 12, fontWeight: 800 }}>
            {saving ? "Saving..." : "Add Client"}
          </button>
        </div>
      </form>

      {/* Responsive tweaks */}
      <style jsx>{`
        @media (max-width: 1024px) {
          form :global(.grid4) {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
    </div>
  );
}
