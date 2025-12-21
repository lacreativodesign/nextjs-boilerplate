"use client";

import { useMemo, useState } from "react";

type PaymentStatus = "Unpaid" | "Partially Paid" | "Paid" | "Refunded";
type SalesStage =
  | "New Lead"
  | "Contacted"
  | "Qualified"
  | "Proposal Sent"
  | "Negotiation"
  | "Closed Won"
  | "Closed Lost";

type RetainerStatus = "None" | "Active" | "Paused" | "Cancelled";

export default function AddClientPage() {
  const [loading, setLoading] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // --- Form state (keep it simple + scalable) ---
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [timezone, setTimezone] = useState("");

  const [primaryContactName, setPrimaryContactName] = useState("");
  const [primaryContactTitle, setPrimaryContactTitle] = useState("");
  const [primaryContactEmail, setPrimaryContactEmail] = useState("");
  const [primaryContactPhone, setPrimaryContactPhone] = useState("");

  const [salesStage, setSalesStage] = useState<SalesStage>("New Lead");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("Unpaid");
  const [retainerStatus, setRetainerStatus] = useState<RetainerStatus>("None");

  const [salesOwner, setSalesOwner] = useState("");
  const [accountManager, setAccountManager] = useState("");
  const [productionOwner, setProductionOwner] = useState("");

  const [totalPaidUsd, setTotalPaidUsd] = useState<number>(0);

  const canAssignAM = useMemo(
    () => paymentStatus === "Paid" || paymentStatus === "Partially Paid",
    [paymentStatus]
  );

  function normalizeMoneyInput(v: string) {
    const n = Number(String(v || "").replace(/[^\d.]/g, ""));
    if (Number.isNaN(n)) return 0;
    return Math.max(0, n);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOkMsg(null);
    setErrMsg(null);

    // Basic validation (tight + practical)
    if (!companyName.trim()) return setErrMsg("Company name is required.");
    if (!primaryContactName.trim()) return setErrMsg("Primary contact name is required.");
    if (!primaryContactEmail.trim()) return setErrMsg("Primary contact email is required.");

    setLoading(true);

    try {
      const payload = {
        // Identity
        companyName: companyName.trim(),
        website: website.trim() || "",
        industry: industry.trim() || "",
        country: country.trim() || "",
        timezone: timezone.trim() || "",

        // Contact
        primaryContactName: primaryContactName.trim(),
        primaryContactTitle: primaryContactTitle.trim() || "",
        primaryContactEmail: primaryContactEmail.trim(),
        primaryContactPhone: primaryContactPhone.trim() || "",

        // Pipeline + status
        salesStage,
        paymentStatus,
        retainerStatus,

        // Ownership
        salesOwner: salesOwner.trim() || "",
        accountManager: canAssignAM ? accountManager.trim() || "" : "", // enforce rule
        productionOwner: productionOwner.trim() || "",

        // Money (USD only — per your business rule)
        totalPaidUsd: Number(totalPaidUsd || 0),
      };

      const res = await fetch("/api/admin/clients/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to create client.");
      }

      setOkMsg("Client created successfully.");
      // Send you straight to the list so you can confirm visually
      window.location.href = "/admin/clients";
    } catch (err: any) {
      setErrMsg(err?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ width: "100%" }}>
      {/* Master header hierarchy (Key-Accounts vibe) */}
      <h1
        style={{
          fontSize: 34,
          fontWeight: 900,
          marginBottom: 8,
          color: "var(--text, rgba(15,23,42,0.95))",
        }}
      >
        Add Client
      </h1>

      <div
        style={{
          marginBottom: 18,
          color: "var(--mut, rgba(15,23,42,0.65))",
          fontSize: 14,
        }}
      >
        Add a new client and capture the essentials: pipeline, payment status, ownership, and USD revenue.
      </div>

      {/* Status messages */}
      {errMsg ? (
        <div
          className="card"
          style={{
            borderRadius: 14,
            padding: 14,
            marginBottom: 14,
            border: "1px solid rgba(239,68,68,0.25)",
            background: "rgba(239,68,68,0.08)",
            color: "rgba(239,68,68,0.95)",
            fontWeight: 700,
          }}
        >
          {errMsg}
        </div>
      ) : null}

      {okMsg ? (
        <div
          className="card"
          style={{
            borderRadius: 14,
            padding: 14,
            marginBottom: 14,
            border: "1px solid rgba(34,197,94,0.22)",
            background: "rgba(34,197,94,0.08)",
            color: "rgba(34,197,94,0.95)",
            fontWeight: 700,
          }}
        >
          {okMsg}
        </div>
      ) : null}

      <form onSubmit={handleSubmit}>
        {/* Card shell matches Key-Accounts surface */}
        <div
          className="card"
          style={{
            borderRadius: 20,
            padding: 16,
            border: "1px solid rgba(15,23,42,0.10)",
            background: "rgba(255,255,255,0.85)",
            boxShadow: "0 18px 55px rgba(15,23,42,0.10)",
          }}
        >
          {/* SECTION: Company */}
          <SectionTitle title="Company" />

          <div style={grid2}>
            <Field label="Company Name *">
              <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Trading LLC" />
            </Field>

            <Field label="Website">
              <input className="input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" />
            </Field>

            <Field label="Industry">
              <input className="input" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Construction" />
            </Field>

            <Field label="Country">
              <input className="input" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="United States" />
            </Field>

            <Field label="Timezone">
              <input className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="America/New_York" />
            </Field>
          </div>

          <Divider />

          {/* SECTION: Primary Contact */}
          <SectionTitle title="Primary Contact" />

          <div style={grid2}>
            <Field label="Full Name *">
              <input className="input" value={primaryContactName} onChange={(e) => setPrimaryContactName(e.target.value)} placeholder="Ali Khan" />
            </Field>

            <Field label="Title">
              <input className="input" value={primaryContactTitle} onChange={(e) => setPrimaryContactTitle(e.target.value)} placeholder="Owner / Director" />
            </Field>

            <Field label="Email *">
              <input className="input" value={primaryContactEmail} onChange={(e) => setPrimaryContactEmail(e.target.value)} placeholder="ali@company.com" />
            </Field>

            <Field label="Phone">
              <input className="input" value={primaryContactPhone} onChange={(e) => setPrimaryContactPhone(e.target.value)} placeholder="+1 646 555 0101" />
            </Field>
          </div>

          <Divider />

          {/* SECTION: Pipeline & Payment */}
          <SectionTitle title="Pipeline & Payment" />

          <div style={grid2}>
            <Field label="Sales Stage">
              <select className="select" value={salesStage} onChange={(e) => setSalesStage(e.target.value as SalesStage)}>
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
              <select className="select" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}>
                <option>Unpaid</option>
                <option>Partially Paid</option>
                <option>Paid</option>
                <option>Refunded</option>
              </select>
            </Field>

            <Field label="Retainer Status">
              <select className="select" value={retainerStatus} onChange={(e) => setRetainerStatus(e.target.value as RetainerStatus)}>
                <option>None</option>
                <option>Active</option>
                <option>Paused</option>
                <option>Cancelled</option>
              </select>
            </Field>

            <Field label="Total Paid (USD)">
              <input
                className="input"
                value={String(totalPaidUsd ?? 0)}
                onChange={(e) => setTotalPaidUsd(normalizeMoneyInput(e.target.value))}
                placeholder="0"
                inputMode="numeric"
              />
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--mut, rgba(15,23,42,0.65))" }}>
                USD only (client revenue). Karachi back-office expenses stay PKR.
              </div>
            </Field>
          </div>

          <Divider />

          {/* SECTION: Ownership */}
          <SectionTitle title="Ownership" />

          <div style={grid2}>
            <Field label="Sales Owner">
              <input className="input" value={salesOwner} onChange={(e) => setSalesOwner(e.target.value)} placeholder="Mansoor (Sales)" />
            </Field>

            <Field label="Account Manager">
              <input
                className="input"
                value={accountManager}
                onChange={(e) => setAccountManager(e.target.value)}
                placeholder={canAssignAM ? "Sarah (AM)" : "Assign after payment"}
                disabled={!canAssignAM}
              />
            </Field>

            <Field label="Production Owner">
              <input className="input" value={productionOwner} onChange={(e) => setProductionOwner(e.target.value)} placeholder="Ayesha (Prod)" />
            </Field>
          </div>

          <div style={{ height: 14 }} />

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="submit" className="btn" disabled={loading} style={{ borderRadius: 12, fontWeight: 900, padding: "10px 14px" }}>
              {loading ? "Saving..." : "Save Client"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 900,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        opacity: 0.75,
        marginBottom: 10,
      }}
    >
      {title}
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{
        height: 1,
        background: "rgba(15,23,42,0.08)",
        margin: "16px 0",
        borderRadius: 999,
      }}
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.7, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>
      {children}
    </div>
  );
}

const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 14,
};
