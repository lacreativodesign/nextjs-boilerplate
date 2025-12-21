"use client";

import { useState } from "react";
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

export default function AddClientPage() {
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [timezone, setTimezone] = useState("");

  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const [stage, setStage] = useState<SalesStage>("New Lead");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("Unpaid");

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSuccess("");
    setError("");

    if (!companyName || !contactName || !contactEmail) {
      setError("Company name, contact name and email are required.");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch("/api/admin/clients/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          companyName,
          website,
          industry,
          country,
          timezone,
          primaryContactName: contactName,
          primaryContactEmail: contactEmail,
          primaryContactPhone: contactPhone,
          stage,
          paymentStatus,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Failed to create client");

      setSuccess("Client added successfully.");

      // Reset form
      setCompanyName("");
      setWebsite("");
      setIndustry("");
      setCountry("");
      setTimezone("");
      setContactName("");
      setContactEmail("");
      setContactPhone("");
      setStage("New Lead");
      setPaymentStatus("Unpaid");
    } catch (err: any) {
      setError(err?.message || "Failed to create client");
    } finally {
      setLoading(false);
    }
  }

  /* ===== MASTER UI STYLES ===== */
  const shell: React.CSSProperties = {
    borderRadius: 20,
    padding: 16,
    border: "1px solid var(--table-border)",
    background: "var(--table-bg)",
    boxShadow: "var(--table-shadow)",
  };

  const section: React.CSSProperties = {
    borderRadius: 14,
    padding: 14,
    background: "rgba(15,23,42,0.02)",
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    opacity: 0.75,
    marginBottom: 10,
    color: "var(--table-muted)",
  };

  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: 14,
  };

  return (
    <div style={{ width: "100%" }}>
      <h1
        style={{
          fontSize: 34,
          fontWeight: 900,
          marginBottom: 8,
          color: "var(--table-text)",
        }}
      >
        Add Client
      </h1>

      <div style={{ marginBottom: 18, color: "var(--table-muted)" }}>
        Create a new client record and start tracking pipeline, payments and ownership.
      </div>

      {success && <div style={{ color: "#22C55E", fontWeight: 700, marginBottom: 12 }}>{success}</div>}
      {error && <div style={{ color: "#EF4444", fontWeight: 700, marginBottom: 12 }}>{error}</div>}

      <div style={shell}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* COMPANY */}
          <div style={section}>
            <div style={sectionTitle}>Company Information</div>
            <div style={grid}>
              <Field label="Company Name" required>
                <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </Field>

              <Field label="Website">
                <input className="input" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </Field>

              <Field label="Industry">
                <input className="input" value={industry} onChange={(e) => setIndustry(e.target.value)} />
              </Field>

              <Field label="Country">
                <input className="input" value={country} onChange={(e) => setCountry(e.target.value)} />
              </Field>

              <Field label="Timezone">
                <input className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
              </Field>
            </div>
          </div>

          {/* CONTACT */}
          <div style={section}>
            <div style={sectionTitle}>Primary Contact</div>
            <div style={grid}>
              <Field label="Contact Name" required>
                <input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </Field>

              <Field label="Contact Email" required>
                <input className="input" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
              </Field>

              <Field label="Contact Phone">
                <input className="input" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
              </Field>
            </div>
          </div>

          {/* PIPELINE */}
          <div style={section}>
            <div style={sectionTitle}>Pipeline</div>
            <div style={grid}>
              <Field label="Sales Stage">
                <select className="input" value={stage} onChange={(e) => setStage(e.target.value as SalesStage)}>
                  <option>New Lead</option>
                  <option>Contacted</option>
                  <option>Qualified</option>
                  <option>Proposal Sent</option>
                  <option>Negotiation</option>
                  <option>Closed Won</option>
                  <option>Closed Lost</option>
                </select>
              </Field>

              <Field label="Payment Status">
                <select className="input" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}>
                  <option>Unpaid</option>
                  <option>Partially Paid</option>
                  <option>Paid</option>
                </select>
              </Field>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 6 }}>
            <button type="submit" disabled={loading} className="btn" style={{ borderRadius: 12, fontWeight: 900 }}>
              {loading ? "Creating..." : "Add Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label
        style={{
          fontSize: 11,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          opacity: 0.7,
          color: "var(--table-muted)",
        }}
      >
        {label}
        {required && <span style={{ color: "#EF4444", marginLeft: 6 }}>*</span>}
      </label>
      {children}
    </div>
  );
}
