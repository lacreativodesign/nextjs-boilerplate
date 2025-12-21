"use client";

import { useMemo, useState } from "react";
import type React from "react";

type SalesStage =
  | "New Lead"
  | "Contacted"
  | "Qualified"
  | "Proposal Sent"
  | "Negotiation"
  | "Closed Won"
  | "Closed Lost";

type PaymentStatus = "Unpaid" | "Partially Paid" | "Paid" | "Refunded";
type RetainerStatus = "None" | "Active" | "Paused" | "Cancelled";

const stageOptions: SalesStage[] = [
  "New Lead",
  "Contacted",
  "Qualified",
  "Proposal Sent",
  "Negotiation",
  "Closed Won",
  "Closed Lost",
];

const paymentOptions: PaymentStatus[] = ["Unpaid", "Partially Paid", "Paid", "Refunded"];
const retainerOptions: RetainerStatus[] = ["None", "Active", "Paused", "Cancelled"];

export default function AddClientPage() {
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [form, setForm] = useState({
    // Company
    companyName: "",
    website: "",
    industry: "",
    country: "",
    timezone: "",

    // Contact
    contactName: "",
    contactTitle: "",
    contactEmail: "",
    contactPhone: "",

    // Pipeline
    salesStage: "New Lead" as SalesStage,
    paymentStatus: "Unpaid" as PaymentStatus,
    retainerStatus: "None" as RetainerStatus,

    // Ownership
    salesOwner: "",
    accountManager: "",
    productionOwner: "",

    // Money (USD)
    totalContractValueUsd: "",
    totalPaidUsd: "",
    openBalanceUsd: "",

    // Notes
    servicesNotes: "",
  });

  const pageWrap: React.CSSProperties = useMemo(
    () => ({
      width: "100%",
      maxWidth: 1100,
    }),
    []
  );

  const titleStyle: React.CSSProperties = useMemo(
    () => ({
      fontSize: 34,
      fontWeight: 900,
      marginBottom: 8,
    }),
    []
  );

  const subStyle: React.CSSProperties = useMemo(
    () => ({
      marginBottom: 18,
      color: "rgba(15,23,42,0.65)",
    }),
    []
  );

  const cardStyle: React.CSSProperties = useMemo(
    () => ({
      borderRadius: 20,
      padding: 18,
    }),
    []
  );

  const sectionTitle: React.CSSProperties = useMemo(
    () => ({
      fontSize: 12,
      fontWeight: 900,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      opacity: 0.75,
      marginBottom: 12,
    }),
    []
  );

  const grid: React.CSSProperties = useMemo(
    () => ({
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      gap: 14,
    }),
    []
  );

  const gridTight: React.CSSProperties = useMemo(
    () => ({
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
      gap: 14,
    }),
    []
  );

  const labelStyle: React.CSSProperties = useMemo(
    () => ({
      fontSize: 11,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      fontWeight: 800,
      opacity: 0.7,
      marginBottom: 6,
      display: "block",
    }),
    []
  );

  const helpStyle: React.CSSProperties = useMemo(
    () => ({
      fontSize: 12,
      opacity: 0.7,
      marginTop: 8,
    }),
    []
  );

  const row: React.CSSProperties = useMemo(
    () => ({
      display: "flex",
      justifyContent: "flex-end",
      gap: 10,
      marginTop: 16,
    }),
    []
  );

  function onChange<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((p) => ({ ...p, [key]: value }));
    setSavedMsg(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(null);

    try {
      // Keep your existing API wiring (if already implemented)
      // If you haven't wired API yet, this stays as a UI-stub and won't break builds.
      const res = await fetch("/api/admin/clients/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          companyName: form.companyName.trim(),
          website: form.website.trim(),
          industry: form.industry.trim(),
          country: form.country.trim(),
          timezone: form.timezone.trim(),

          primaryContactName: form.contactName.trim(),
          primaryContactTitle: form.contactTitle.trim(),
          primaryContactEmail: form.contactEmail.trim(),
          primaryContactPhone: form.contactPhone.trim(),

          salesStage: form.salesStage,
          paymentStatus: form.paymentStatus,
          retainerStatus: form.retainerStatus,

          salesOwner: form.salesOwner.trim(),
          accountManager: form.accountManager.trim(),
          productionOwner: form.productionOwner.trim(),

          totalContractValueUsd: Number(form.totalContractValueUsd || 0),
          totalPaidUsd: Number(form.totalPaidUsd || 0),
          openBalanceUsd: Number(form.openBalanceUsd || 0),

          servicesNotes: form.servicesNotes.trim(),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to add client");
      }

      setSavedMsg("Client created successfully.");
      setForm((p) => ({
        ...p,
        companyName: "",
        website: "",
        industry: "",
        country: "",
        timezone: "",
        contactName: "",
        contactTitle: "",
        contactEmail: "",
        contactPhone: "",
        salesStage: "New Lead",
        paymentStatus: "Unpaid",
        retainerStatus: "None",
        salesOwner: "",
        accountManager: "",
        productionOwner: "",
        totalContractValueUsd: "",
        totalPaidUsd: "",
        openBalanceUsd: "",
        servicesNotes: "",
      }));
    } catch (err: any) {
      setSavedMsg(err?.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={pageWrap}>
      <h1 style={titleStyle}>Add Client</h1>
      <div style={subStyle}>
        Create a new client record and start tracking pipeline, payments and ownership.
      </div>

      <form onSubmit={onSubmit} className="card" style={cardStyle}>
        {/* COMPANY */}
        <div style={sectionTitle}>Company Information</div>
        <div style={grid}>
          <div>
            <label style={labelStyle}>Company Name *</label>
            <input
              className="input"
              value={form.companyName}
              onChange={(e) => onChange("companyName", e.target.value)}
              placeholder="Acme Trading LLC"
              required
            />
          </div>

          <div>
            <label style={labelStyle}>Website</label>
            <input
              className="input"
              value={form.website}
              onChange={(e) => onChange("website", e.target.value)}
              placeholder="https://example.com"
            />
          </div>

          <div>
            <label style={labelStyle}>Industry</label>
            <input
              className="input"
              value={form.industry}
              onChange={(e) => onChange("industry", e.target.value)}
              placeholder="Construction"
            />
          </div>

          <div>
            <label style={labelStyle}>Country</label>
            <input
              className="input"
              value={form.country}
              onChange={(e) => onChange("country", e.target.value)}
              placeholder="United States"
            />
          </div>

          <div>
            <label style={labelStyle}>Timezone</label>
            <input
              className="input"
              value={form.timezone}
              onChange={(e) => onChange("timezone", e.target.value)}
              placeholder="America/New_York"
            />
          </div>
        </div>

        <div style={{ height: 18 }} />

        {/* CONTACT */}
        <div style={sectionTitle}>Primary Contact</div>
        <div style={grid}>
          <div>
            <label style={labelStyle}>Contact Name *</label>
            <input
              className="input"
              value={form.contactName}
              onChange={(e) => onChange("contactName", e.target.value)}
              placeholder="Ali Khan"
              required
            />
          </div>

          <div>
            <label style={labelStyle}>Contact Title</label>
            <input
              className="input"
              value={form.contactTitle}
              onChange={(e) => onChange("contactTitle", e.target.value)}
              placeholder="Owner"
            />
          </div>

          <div>
            <label style={labelStyle}>Contact Email *</label>
            <input
              className="input"
              value={form.contactEmail}
              onChange={(e) => onChange("contactEmail", e.target.value)}
              placeholder="ali@acmetrading.com"
              required
            />
          </div>

          <div>
            <label style={labelStyle}>Contact Phone</label>
            <input
              className="input"
              value={form.contactPhone}
              onChange={(e) => onChange("contactPhone", e.target.value)}
              placeholder="+1 312 555 0199"
            />
          </div>
        </div>

        <div style={{ height: 18 }} />

        {/* PIPELINE */}
        <div style={sectionTitle}>Pipeline</div>
        <div style={gridTight}>
          <div>
            <label style={labelStyle}>Sales Stage</label>
            <select
              className="input"
              value={form.salesStage}
              onChange={(e) => onChange("salesStage", e.target.value as SalesStage)}
            >
              {stageOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Payment Status</label>
            <select
              className="input"
              value={form.paymentStatus}
              onChange={(e) => onChange("paymentStatus", e.target.value as PaymentStatus)}
            >
              {paymentOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Retainer Status</label>
            <select
              className="input"
              value={form.retainerStatus}
              onChange={(e) => onChange("retainerStatus", e.target.value as RetainerStatus)}
            >
              {retainerOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ height: 18 }} />

        {/* OWNERSHIP */}
        <div style={sectionTitle}>Ownership</div>
        <div style={grid}>
          <div>
            <label style={labelStyle}>Sales Owner</label>
            <input
              className="input"
              value={form.salesOwner}
              onChange={(e) => onChange("salesOwner", e.target.value)}
              placeholder="Mansoor (Sales)"
            />
          </div>

          <div>
            <label style={labelStyle}>Account Manager</label>
            <input
              className="input"
              value={form.accountManager}
              onChange={(e) => onChange("accountManager", e.target.value)}
              placeholder="Sarah (AM)"
            />
          </div>

          <div>
            <label style={labelStyle}>Production Owner</label>
            <input
              className="input"
              value={form.productionOwner}
              onChange={(e) => onChange("productionOwner", e.target.value)}
              placeholder="Ayesha (Prod)"
            />
          </div>
        </div>

        <div style={{ height: 18 }} />

        {/* MONEY */}
        <div style={sectionTitle}>Money (USD)</div>
        <div style={grid}>
          <div>
            <label style={labelStyle}>Total Contract Value</label>
            <input
              className="input"
              inputMode="numeric"
              value={form.totalContractValueUsd}
              onChange={(e) => onChange("totalContractValueUsd", e.target.value)}
              placeholder="5500"
            />
          </div>

          <div>
            <label style={labelStyle}>Total Paid (Lifetime)</label>
            <input
              className="input"
              inputMode="numeric"
              value={form.totalPaidUsd}
              onChange={(e) => onChange("totalPaidUsd", e.target.value)}
              placeholder="1200"
            />
          </div>

          <div>
            <label style={labelStyle}>Open Balance</label>
            <input
              className="input"
              inputMode="numeric"
              value={form.openBalanceUsd}
              onChange={(e) => onChange("openBalanceUsd", e.target.value)}
              placeholder="1500"
            />
          </div>
        </div>

        <div style={{ height: 18 }} />

        {/* NOTES */}
        <div style={sectionTitle}>Notes & Services</div>
        <div>
          <label style={labelStyle}>Services / Notes</label>
          <textarea
            className="input"
            value={form.servicesNotes}
            onChange={(e) => onChange("servicesNotes", e.target.value)}
            placeholder="e.g. Website Design + SEO Retainer. Notes about scope, expectations, assigned production, etc."
            style={{ minHeight: 110, resize: "vertical" }}
          />
          <div style={helpStyle}>Tip: Keep this short. Detailed services will be managed in Projects & Delivery later.</div>
        </div>

        {savedMsg ? (
          <div style={{ marginTop: 14, fontSize: 13, fontWeight: 700, opacity: 0.85 }}>{savedMsg}</div>
        ) : null}

        <div style={row}>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? "Saving..." : "Add Client"}
          </button>
        </div>
      </form>
    </div>
  );
}
