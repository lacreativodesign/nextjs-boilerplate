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

const formatUSD = (v: any) => {
  const num = Number(v);
  return isNaN(num) ? "$ 0" : `$ ${num.toLocaleString("en-US")}`;
};

const parseNumber = (v: string) => {
  const cleaned = v.replace(/[^\d.]/g, "");
  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
};

export default function AddClientPage() {
  // Basic info
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [timezone, setTimezone] = useState("");

  // Primary contact
  const [contactName, setContactName] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Status
  const [stage, setStage] = useState<SalesStage>("New Lead");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("Unpaid");
  const [retainerStatus, setRetainerStatus] = useState<RetainerStatus>("None");

  // Ownership
  const [salesOwner, setSalesOwner] = useState("");
  const [accountManager, setAccountManager] = useState("");
  const [productionOwner, setProductionOwner] = useState("");

  // Money (USD only)
  const [contractValueUsd, setContractValueUsd] = useState<string>("0");
  const [upfrontPaidUsd, setUpfrontPaidUsd] = useState<string>("0");
  const [monthlyRetainerUsd, setMonthlyRetainerUsd] = useState<string>("0");
  const [billingDay, setBillingDay] = useState<string>("1");

  // Services tags
  const [serviceInput, setServiceInput] = useState("");
  const [services, setServices] = useState<string[]>(["Website Design", "SEO Retainer"]);

  const contractValue = useMemo(() => parseNumber(contractValueUsd), [contractValueUsd]);
  const upfrontPaid = useMemo(() => parseNumber(upfrontPaidUsd), [upfrontPaidUsd]);
  const openBalance = useMemo(() => Math.max(contractValue - upfrontPaid, 0), [contractValue, upfrontPaid]);

  const monthlyRetainer = useMemo(() => parseNumber(monthlyRetainerUsd), [monthlyRetainerUsd]);

  const addService = () => {
    const tag = serviceInput.trim();
    if (!tag) return;
    if (services.some((s) => s.toLowerCase() === tag.toLowerCase())) {
      setServiceInput("");
      return;
    }
    setServices((prev) => [...prev, tag]);
    setServiceInput("");
  };

  const removeService = (tag: string) => setServices((prev) => prev.filter((s) => s !== tag));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // UI-only for now: simulate submit
    // Later: save to Firestore
    const payload = {
      companyName,
      website,
      industry,
      country,
      timezone,
      primaryContact: { contactName, contactTitle, email, phone },
      stage,
      paymentStatus,
      retainerStatus,
      ownership: { salesOwner, accountManager, productionOwner },
      money: {
        contractValueUsd: contractValue,
        upfrontPaidUsd: upfrontPaid,
        openBalanceUsd: openBalance,
        monthlyRetainerUsd: monthlyRetainer,
        billingDay: Number(billingDay) || 1,
      },
      services,
    };

    console.log("Create Client payload:", payload);
    alert("Client saved (UI simulation). Next step: connect Firestore.");
  };

  return (
    <div>
      <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 10 }}>Add Client</h2>
      <p style={{ fontSize: 14, color: "var(--mut, #94A3B8)", marginBottom: 16 }}>
        Create a new client record (company + owner contact). All amounts are tracked in USD.
      </p>

      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Company Information */}
        <Section title="Company Information">
          <Grid>
            <Field label="Company Name *">
              <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. ACME Trading LLC" required />
            </Field>

            <Field label="Website">
              <input className="input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="e.g. https://acme.com" />
            </Field>

            <Field label="Industry">
              <input className="input" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Retail, SaaS, Healthcare" />
            </Field>

            <Field label="Country">
              <input className="input" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. United States" />
            </Field>

            <Field label="Timezone">
              <input className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="e.g. America/New_York" />
            </Field>
          </Grid>
        </Section>

        {/* Primary Contact */}
        <Section title="Primary Contact (Business Owner)">
          <Grid>
            <Field label="Full Name *">
              <input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="e.g. John Doe" required />
            </Field>

            <Field label="Title / Designation">
              <input className="input" value={contactTitle} onChange={(e) => setContactTitle(e.target.value)} placeholder="e.g. Founder / CEO" />
            </Field>

            <Field label="Email Address *">
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. owner@company.com" required />
            </Field>

            <Field label="Phone Number">
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. +1 312 555 0199" />
            </Field>
          </Grid>
        </Section>

        {/* Status */}
        <Section title="Status & Lifecycle">
          <Grid>
            <Field label="Sales Stage">
              <select className="input" value={stage} onChange={(e) => setStage(e.target.value as SalesStage)}>
                {stageOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Payment Status">
              <select className="input" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}>
                {paymentOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Retainer Status">
              <select className="input" value={retainerStatus} onChange={(e) => setRetainerStatus(e.target.value as RetainerStatus)}>
                {retainerOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
          </Grid>
        </Section>

        {/* Ownership */}
        <Section title="Ownership & Assignment">
          <Grid>
            <Field label="Sales Owner *">
              <input className="input" value={salesOwner} onChange={(e) => setSalesOwner(e.target.value)} placeholder="e.g. Mansoor (Sales)" required />
            </Field>

            <Field label="Account Manager (AM)">
              <input className="input" value={accountManager} onChange={(e) => setAccountManager(e.target.value)} placeholder="(Assign after payment)" />
            </Field>

            <Field label="Production Owner">
              <input className="input" value={productionOwner} onChange={(e) => setProductionOwner(e.target.value)} placeholder="e.g. Ayesha (Prod)" />
            </Field>
          </Grid>

          <div style={{ marginTop: 10, fontSize: 13, color: "var(--mut, #94A3B8)" }}>
            Note: AM assignment is typically used when Payment Status is Paid / Partially Paid.
          </div>
        </Section>

        {/* Money */}
        <Section title="Money (USD)">
          <Grid>
            <Field label="Total Contract Value (USD $) *">
              <input className="input" value={contractValueUsd} onChange={(e) => setContractValueUsd(e.target.value)} placeholder="e.g. 12500" required />
            </Field>

            <Field label="Upfront Paid (USD $)">
              <input className="input" value={upfrontPaidUsd} onChange={(e) => setUpfrontPaidUsd(e.target.value)} placeholder="e.g. 2500" />
            </Field>

            <Field label="Open Balance (Auto)">
              <input className="input" value={formatUSD(openBalance)} readOnly />
            </Field>

            <Field label="Monthly Retainer (USD $)">
              <input className="input" value={monthlyRetainerUsd} onChange={(e) => setMonthlyRetainerUsd(e.target.value)} placeholder="e.g. 800" />
            </Field>

            <Field label="Billing Day (1-28)">
              <input
                className="input"
                value={billingDay}
                onChange={(e) => setBillingDay(e.target.value)}
                placeholder="e.g. 1"
                inputMode="numeric"
              />
            </Field>
          </Grid>
        </Section>

        {/* Services */}
        <Section title="Services (Tags)">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              className="input"
              value={serviceInput}
              onChange={(e) => setServiceInput(e.target.value)}
              placeholder="Type a service and press Add (e.g. Website Design)"
              style={{ flex: 1, minWidth: 240 }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addService();
                }
              }}
            />
            <button type="button" className="btn" onClick={addService} style={{ borderRadius: 12, fontWeight: 800 }}>
              Add
            </button>
          </div>

          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {services.length === 0 ? (
              <span style={{ fontSize: 14, color: "var(--mut, #94A3B8)" }}>No services added.</span>
            ) : (
              services.map((tag) => (
                <span
                  key={tag}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 10px",
                    borderRadius: 999,
                    fontWeight: 800,
                    fontSize: 12,
                    border: "1px solid rgba(148,163,184,0.28)",
                    background: "rgba(255,255,255,0.04)",
                  }}
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeService(tag)}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      fontWeight: 900,
                      fontSize: 14,
                      lineHeight: 1,
                      opacity: 0.85,
                    }}
                    aria-label={`Remove ${tag}`}
                    title="Remove"
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>
        </Section>

        {/* Submit */}
        <div style={{ marginTop: 6 }}>
          <button type="submit" className="btn" style={{ width: "100%", borderRadius: 14, fontWeight: 900, padding: "12px 14px" }}>
            Create Client
          </button>
        </div>
      </form>
    </div>
  );
}

/** ===== UI helpers (keeps form consistent with Create User) ===== */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 16, borderRadius: 18 }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 900,
          marginBottom: 12,
          letterSpacing: 0.2,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(12, 1fr)",
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: "span 12" }}>
      <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.75, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
        {label}
      </div>
      {children}
      <style jsx>{`
        @media (min-width: 900px) {
          div[style*="grid-column: span 12"] {
            grid-column: span 4;
          }
        }
        @media (min-width: 1200px) {
          div[style*="grid-column: span 12"] {
            grid-column: span 3;
          }
        }
      `}</style>
    </div>
  );
}
