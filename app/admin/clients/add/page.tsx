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

type PaymentStatus = "Unpaid" | "Partially Paid" | "Paid";

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

const paymentOptions: PaymentStatus[] = ["Unpaid", "Partially Paid", "Paid"];

const retainerOptions: RetainerStatus[] = ["None", "Active", "Paused", "Cancelled"];

const formatUSD = (v: any) => {
  const num = Number(v);
  return isNaN(num) ? "-" : `$ ${num.toLocaleString("en-US")}`;
};

function toNumber(v: any) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

export default function AddClientPage() {
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [form, setForm] = useState({
    companyName: "",
    website: "",
    industry: "",
    country: "",
    timezone: "",

    ownerName: "",
    ownerTitle: "",
    ownerEmail: "",
    ownerPhone: "",

    salesStage: "New Lead" as SalesStage,
    paymentStatus: "Unpaid" as PaymentStatus,
    retainerStatus: "None" as RetainerStatus,

    salesOwner: "",
    accountManager: "",
    productionOwner: "",

    totalContractValue: "",
    totalPaid: "",
    openBalance: "",
    services: "", // tags/notes for now
  });

  const sectionCardStyle: React.CSSProperties = useMemo(
    () => ({
      background: "var(--card-bg)",
      border: "1px solid var(--card-border)",
      borderRadius: 16,
      padding: 18,
      boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
      width: "100%",
    }),
    []
  );

  const labelStyle: React.CSSProperties = useMemo(
    () => ({
      fontSize: 11,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      color: "var(--muted)",
      fontWeight: 700,
      marginBottom: 6,
      display: "block",
    }),
    []
  );

  const inputBaseStyle: React.CSSProperties = useMemo(
    () => ({
      width: "100%",
      padding: "12px 12px",
      borderRadius: 10,
      border: "1px solid var(--table-border)",
      background: "var(--input-bg)",
      color: "var(--text)",
      outline: "none",
      fontSize: 14,
    }),
    []
  );

  const selectStyle: React.CSSProperties = useMemo(
    () => ({
      ...inputBaseStyle,
      appearance: "none",
      WebkitAppearance: "none",
      MozAppearance: "none",
      paddingRight: 34,
    }),
    [inputBaseStyle]
  );

  const grid2: React.CSSProperties = useMemo(
    () => ({
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: 14,
    }),
    []
  );

  const grid3: React.CSSProperties = useMemo(
    () => ({
      display: "grid",
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gap: 14,
    }),
    []
  );

  const fullWidthWrap: React.CSSProperties = useMemo(
    () => ({
      maxWidth: 1120,
      width: "100%",
    }),
    []
  );

  const setField = (k: keyof typeof form, v: any) => {
    setForm((prev) => ({ ...prev, [k]: v }));
    setSavedMsg(null);
  };

  const resetForm = () => {
    setForm({
      companyName: "",
      website: "",
      industry: "",
      country: "",
      timezone: "",

      ownerName: "",
      ownerTitle: "",
      ownerEmail: "",
      ownerPhone: "",

      salesStage: "New Lead",
      paymentStatus: "Unpaid",
      retainerStatus: "None",

      salesOwner: "",
      accountManager: "",
      productionOwner: "",

      totalContractValue: "",
      totalPaid: "",
      openBalance: "",
      services: "",
    });
  };

  const validate = () => {
    const companyName = form.companyName.trim();
    const ownerName = form.ownerName.trim();
    const ownerEmail = form.ownerEmail.trim();
    const salesOwner = form.salesOwner.trim();

    if (!companyName) return "Company Name is required.";
    if (!ownerName) return "Primary Contact Name is required.";
    if (!ownerEmail) return "Primary Contact Email is required.";
    if (!salesOwner) return "Sales Owner is required.";
    return null;
  };

  const handleSubmit = async (mode: "single" | "another") => {
    const err = validate();
    if (err) {
      setSavedMsg(err);
      return;
    }

    setSaving(true);
    setSavedMsg(null);

    try {
      const payload = {
        companyName: form.companyName.trim(),
        website: form.website.trim(),
        industry: form.industry.trim(),
        country: form.country.trim(),
        timezone: form.timezone.trim(),

        primaryContactName: form.ownerName.trim(),
        primaryContactTitle: form.ownerTitle.trim(),
        primaryContactEmail: form.ownerEmail.trim(),
        primaryContactPhone: form.ownerPhone.trim(),

        salesStage: form.salesStage,
        paymentStatus: form.paymentStatus,
        retainerStatus: form.retainerStatus,

        salesOwner: form.salesOwner.trim(),
        accountManager: form.accountManager.trim(),
        productionOwner: form.productionOwner.trim(),

        totalContractValueUsd: toNumber(form.totalContractValue),
        totalPaidUsd: toNumber(form.totalPaid),
        openBalanceUsd: toNumber(form.openBalance),

        services: form.services.trim(),
      };

      const res = await fetch("/api/admin/clients/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to save client");
      }

      const orderId = String(json?.orderId || "").trim(); // expected: LC-0001
      setSavedMsg(
        mode === "another"
          ? `Saved ✅ (${orderId || "LC-0000"}) — ready for another`
          : `Saved ✅ (${orderId || "LC-0000"})`
      );

      if (mode === "another") {
        resetForm();
      } else {
        // go back to clients list so you can see it immediately
        window.location.href = "/admin/clients";
      }
    } catch (e: any) {
      setSavedMsg(e?.message || "Failed to save client");
    } finally {
      setSaving(false);
    }
  };

  const onCancel = () => {
    window.location.href = "/admin/clients";
  };

  return (
    <div className="client-add-form" style={{ width: "100%" }}>
      <style jsx global>{`
        .client-add-form select option {
          color: #111 !important;
          background: #fff !important;
        }
        html.dark .client-add-form select option,
        [data-theme="dark"] .client-add-form select option {
          color: #f5f5f5 !important;
          background: #111827 !important;
        }
      `}</style>

      <div style={fullWidthWrap}>
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ margin: 0, fontSize: 32, color: "var(--text)" }}>Add Client</h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13 }}>
            Create a new client record (company + owner contact). All amounts are tracked in USD.
          </p>
        </div>

        {/* Company Information */}
        <div style={sectionCardStyle}>
          <div style={{ fontWeight: 800, color: "var(--text)", marginBottom: 12, fontSize: 14 }}>
            Company Information
          </div>

          <div style={grid2}>
            <div>
              <label style={labelStyle}>
                Company Name <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                style={inputBaseStyle}
                value={form.companyName}
                onChange={(e) => setField("companyName", e.target.value)}
                placeholder="e.g. ACME Trading LLC"
              />
            </div>

            <div>
              <label style={labelStyle}>Website</label>
              <input
                style={inputBaseStyle}
                value={form.website}
                onChange={(e) => setField("website", e.target.value)}
                placeholder="e.g. https://acme.com"
              />
            </div>
          </div>

          <div style={{ height: 12 }} />

          <div style={grid3}>
            <div>
              <label style={labelStyle}>Industry</label>
              <input
                style={inputBaseStyle}
                value={form.industry}
                onChange={(e) => setField("industry", e.target.value)}
                placeholder="e.g. Retail, SaaS, Healthcare"
              />
            </div>

            <div>
              <label style={labelStyle}>Country</label>
              <input
                style={inputBaseStyle}
                value={form.country}
                onChange={(e) => setField("country", e.target.value)}
                placeholder="e.g. United States"
              />
            </div>

            <div>
              <label style={labelStyle}>Timezone</label>
              <input
                style={inputBaseStyle}
                value={form.timezone}
                onChange={(e) => setField("timezone", e.target.value)}
                placeholder="e.g. America/New_York"
              />
            </div>
          </div>
        </div>

        <div style={{ height: 14 }} />

        {/* Primary Contact */}
        <div style={sectionCardStyle}>
          <div style={{ fontWeight: 800, color: "var(--text)", marginBottom: 12, fontSize: 14 }}>
            Primary Contact (Business Owner)
          </div>

          <div style={grid2}>
            <div>
              <label style={labelStyle}>
                Full Name <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                style={inputBaseStyle}
                value={form.ownerName}
                onChange={(e) => setField("ownerName", e.target.value)}
                placeholder="e.g. John Doe"
              />
            </div>

            <div>
              <label style={labelStyle}>Title / Designation</label>
              <input
                style={inputBaseStyle}
                value={form.ownerTitle}
                onChange={(e) => setField("ownerTitle", e.target.value)}
                placeholder="e.g. Founder / CEO"
              />
            </div>
          </div>

          <div style={{ height: 12 }} />

          <div style={grid2}>
            <div>
              <label style={labelStyle}>
                Email Address <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                style={inputBaseStyle}
                value={form.ownerEmail}
                onChange={(e) => setField("ownerEmail", e.target.value)}
                placeholder="e.g. owner@company.com"
              />
            </div>

            <div>
              <label style={labelStyle}>Phone Number</label>
              <input
                style={inputBaseStyle}
                value={form.ownerPhone}
                onChange={(e) => setField("ownerPhone", e.target.value)}
                placeholder="e.g. +1 312 555 0199"
              />
            </div>
          </div>
        </div>

        <div style={{ height: 14 }} />

        {/* Status & Lifecycle */}
        <div style={sectionCardStyle}>
          <div style={{ fontWeight: 800, color: "var(--text)", marginBottom: 12, fontSize: 14 }}>
            Status & Lifecycle
          </div>

          <div style={grid3}>
            <div>
              <label style={labelStyle}>Sales Stage</label>
              <select
                style={selectStyle}
                value={form.salesStage}
                onChange={(e) => setField("salesStage", e.target.value as SalesStage)}
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
                style={selectStyle}
                value={form.paymentStatus}
                onChange={(e) => setField("paymentStatus", e.target.value as PaymentStatus)}
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
                style={selectStyle}
                value={form.retainerStatus}
                onChange={(e) => setField("retainerStatus", e.target.value as RetainerStatus)}
              >
                {retainerOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div style={{ height: 14 }} />

        {/* Ownership */}
        <div style={sectionCardStyle}>
          <div style={{ fontWeight: 800, color: "var(--text)", marginBottom: 12, fontSize: 14 }}>
            Ownership
          </div>

          <div style={grid3}>
            <div>
              <label style={labelStyle}>
                Sales Owner <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                style={inputBaseStyle}
                value={form.salesOwner}
                onChange={(e) => setField("salesOwner", e.target.value)}
                placeholder="e.g. Mansoor (Sales)"
              />
            </div>

            <div>
              <label style={labelStyle}>Account Manager (AM)</label>
              <input
                style={inputBaseStyle}
                value={form.accountManager}
                onChange={(e) => setField("accountManager", e.target.value)}
                placeholder="(Assign after payment)"
              />
            </div>

            <div>
              <label style={labelStyle}>Production Owner</label>
              <input
                style={inputBaseStyle}
                value={form.productionOwner}
                onChange={(e) => setField("productionOwner", e.target.value)}
                placeholder="e.g. Ayesha (Prod)"
              />
            </div>
          </div>
        </div>

        <div style={{ height: 14 }} />

        {/* Money & Services */}
        <div style={sectionCardStyle}>
          <div style={{ fontWeight: 800, color: "var(--text)", marginBottom: 12, fontSize: 14 }}>
            Money & Services (USD)
          </div>

          <div style={grid3}>
            <div>
              <label style={labelStyle}>Total Contract Value</label>
              <input
                style={inputBaseStyle}
                value={form.totalContractValue}
                onChange={(e) => setField("totalContractValue", e.target.value)}
                placeholder={formatUSD(12500)}
              />
            </div>

            <div>
              <label style={labelStyle}>Total Paid</label>
              <input
                style={inputBaseStyle}
                value={form.totalPaid}
                onChange={(e) => setField("totalPaid", e.target.value)}
                placeholder={formatUSD(0)}
              />
            </div>

            <div>
              <label style={labelStyle}>Open Balance</label>
              <input
                style={inputBaseStyle}
                value={form.openBalance}
                onChange={(e) => setField("openBalance", e.target.value)}
                placeholder={formatUSD(0)}
              />
            </div>
          </div>

          <div style={{ height: 12 }} />

          <div>
            <label style={labelStyle}>Services (tags / notes for now)</label>
            <input
              style={inputBaseStyle}
              value={form.services}
              onChange={(e) => setField("services", e.target.value)}
              placeholder="e.g. Website Design · SEO Retainer · Social Media Marketing"
            />
          </div>
        </div>

        <div style={{ height: 18 }} />

        {/* Buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 10,
            paddingTop: 10,
            paddingBottom: 10,
            background: "transparent",
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            style={{
              border: "1px solid var(--table-border)",
              background: "transparent",
              color: "var(--text)",
              padding: "10px 14px",
              borderRadius: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => handleSubmit("another")}
            disabled={saving}
            style={{
              border: "1px solid var(--table-border)",
              background: "transparent",
              color: "var(--text)",
              padding: "10px 14px",
              borderRadius: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {saving ? "Saving..." : "Save & Add Another"}
          </button>

          <button
            type="button"
            onClick={() => handleSubmit("single")}
            disabled={saving}
            style={{
              border: "1px solid transparent",
              background: "var(--accent)",
              color: "#fff",
              padding: "10px 16px",
              borderRadius: 12,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {saving ? "Saving..." : "Save Client"}
          </button>
        </div>

        {savedMsg ? (
          <div style={{ marginTop: 10, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
            {savedMsg}
          </div>
        ) : null}

        <div style={{ height: 28 }} />
      </div>
    </div>
  );
}
