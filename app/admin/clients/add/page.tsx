"use client";

import { useEffect, useMemo, useState } from "react";
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

function detectDarkMode() {
  if (typeof document === "undefined") return false;

  const el = document.documentElement;
  const body = document.body;

  // Common patterns:
  // 1) class "dark" on html/body
  // 2) data-theme="dark"
  // 3) color-scheme: dark
  const htmlHasDark = el.classList.contains("dark");
  const bodyHasDark = body?.classList?.contains("dark");
  const dataThemeDark = el.getAttribute("data-theme") === "dark" || body?.getAttribute?.("data-theme") === "dark";

  // Fallback: computed background can help, but keep it simple:
  return Boolean(htmlHasDark || bodyHasDark || dataThemeDark);
}

export default function AddClientPage() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Initial detect
    setIsDark(detectDarkMode());

    // Watch for theme changes (class / attribute changes)
    const obs = new MutationObserver(() => setIsDark(detectDarkMode()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    if (document.body) obs.observe(document.body, { attributes: true, attributeFilter: ["class", "data-theme"] });

    return () => obs.disconnect();
  }, []);

  const cardStyle = useMemo(() => {
    if (!isDark) return undefined;

    // ✅ Neutral charcoal grey (matches your table vibe) — no blue tint.
    return {
      background: "rgba(31, 41, 55, 0.72)", // neutral slate/charcoal
      border: "1px solid rgba(59, 130, 246, 0.22)", // subtle blue accent border
      boxShadow: "0 30px 80px rgba(2, 6, 23, 0.38)",
      backdropFilter: "blur(10px)",
    } as React.CSSProperties;
  }, [isDark]);

  // Company
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [timezone, setTimezone] = useState("");

  // Primary Contact
  const [contactName, setContactName] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Lifecycle
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
  const [services, setServices] = useState<string[]>([]);

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
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>Add Client</h2>
      <p style={{ fontSize: 14, color: "var(--mut, #94A3B8)", marginBottom: 16 }}>
        Create a new client record (company + owner contact). All amounts are tracked in USD.
      </p>

      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Company Information */}
        <div className="card" style={{ padding: 16, borderRadius: 18, ...cardStyle }}>
          <div className="sectionTitle">Company Information</div>

          <div className="formGrid">
            <div className="col12 col6">
              <div className="fieldLabel">Company Name *</div>
              <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. ACME Trading LLC" required />
            </div>

            <div className="col12 col6">
              <div className="fieldLabel">Website</div>
              <input className="input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="e.g. https://acme.com" />
            </div>

            <div className="col12 col6">
              <div className="fieldLabel">Industry</div>
              <input className="input" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Retail, SaaS, Healthcare" />
            </div>

            <div className="col12 col3">
              <div className="fieldLabel">Country</div>
              <input className="input" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. United States" />
            </div>

            <div className="col12 col3">
              <div className="fieldLabel">Timezone</div>
              <input className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="e.g. America/New_York" />
            </div>
          </div>
        </div>

        {/* Primary Contact */}
        <div className="card" style={{ padding: 16, borderRadius: 18, ...cardStyle }}>
          <div className="sectionTitle">Primary Contact (Business Owner)</div>

          <div className="formGrid">
            <div className="col12 col6">
              <div className="fieldLabel">Full Name *</div>
              <input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="e.g. John Doe" required />
            </div>

            <div className="col12 col6">
              <div className="fieldLabel">Title / Designation</div>
              <input className="input" value={contactTitle} onChange={(e) => setContactTitle(e.target.value)} placeholder="e.g. Founder / CEO" />
            </div>

            <div className="col12 col6">
              <div className="fieldLabel">Email Address *</div>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. owner@company.com" required />
            </div>

            <div className="col12 col6">
              <div className="fieldLabel">Phone Number</div>
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. +1 312 555 0199" />
            </div>
          </div>
        </div>

        {/* Status */}
        <div className="card" style={{ padding: 16, borderRadius: 18, ...cardStyle }}>
          <div className="sectionTitle">Status & Lifecycle</div>

          <div className="formGrid">
            <div className="col12 col4">
              <div className="fieldLabel">Sales Stage</div>
              <select className="input" value={stage} onChange={(e) => setStage(e.target.value as SalesStage)}>
                {stageOptions.map((s) => (
                  <option key={s} value={s} style={{ color: "#111827", background: "#ffffff" }}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="col12 col4">
              <div className="fieldLabel">Payment Status</div>
              <select className="input" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}>
                {paymentOptions.map((p) => (
                  <option key={p} value={p} style={{ color: "#111827", background: "#ffffff" }}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div className="col12 col4">
              <div className="fieldLabel">Retainer Status</div>
              <select className="input" value={retainerStatus} onChange={(e) => setRetainerStatus(e.target.value as RetainerStatus)}>
                {retainerOptions.map((r) => (
                  <option key={r} value={r} style={{ color: "#111827", background: "#ffffff" }}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Ownership */}
        <div className="card" style={{ padding: 16, borderRadius: 18, ...cardStyle }}>
          <div className="sectionTitle">Ownership & Assignment</div>

          <div className="formGrid">
            <div className="col12 col4">
              <div className="fieldLabel">Sales Owner *</div>
              <input className="input" value={salesOwner} onChange={(e) => setSalesOwner(e.target.value)} placeholder="e.g. Mansoor (Sales)" required />
            </div>

            <div className="col12 col4">
              <div className="fieldLabel">Account Manager (AM)</div>
              <input className="input" value={accountManager} onChange={(e) => setAccountManager(e.target.value)} placeholder="(Assign after payment)" />
            </div>

            <div className="col12 col4">
              <div className="fieldLabel">Production Owner</div>
              <input className="input" value={productionOwner} onChange={(e) => setProductionOwner(e.target.value)} placeholder="e.g. Ayesha (Prod)" />
            </div>
          </div>

          <div style={{ marginTop: 10, fontSize: 13, color: "var(--mut, #94A3B8)" }}>
            AM assignment is typically used when Payment Status is Paid / Partially Paid.
          </div>
        </div>

        {/* Money */}
        <div className="card" style={{ padding: 16, borderRadius: 18, ...cardStyle }}>
          <div className="sectionTitle">Money (USD)</div>

          <div className="formGrid">
            <div className="col12 col4">
              <div className="fieldLabel">Total Contract Value (USD $) *</div>
              <input className="input" value={contractValueUsd} onChange={(e) => setContractValueUsd(e.target.value)} placeholder="e.g. 12500" required />
            </div>

            <div className="col12 col4">
              <div className="fieldLabel">Upfront Paid (USD $)</div>
              <input className="input" value={upfrontPaidUsd} onChange={(e) => setUpfrontPaidUsd(e.target.value)} placeholder="e.g. 2500" />
            </div>

            <div className="col12 col4">
              <div className="fieldLabel">Open Balance (Auto)</div>
              <input className="input" value={formatUSD(openBalance)} readOnly />
            </div>

            <div className="col12 col4">
              <div className="fieldLabel">Monthly Retainer (USD $)</div>
              <input className="input" value={monthlyRetainerUsd} onChange={(e) => setMonthlyRetainerUsd(e.target.value)} placeholder="e.g. 800" />
            </div>

            <div className="col12 col4">
              <div className="fieldLabel">Billing Day (1–28)</div>
              <input className="input" value={billingDay} onChange={(e) => setBillingDay(e.target.value)} placeholder="e.g. 1" inputMode="numeric" />
            </div>
          </div>
        </div>

        {/* Services */}
        <div className="card" style={{ padding: 16, borderRadius: 18, ...cardStyle }}>
          <div className="sectionTitle">Services (Tags)</div>

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
            <button type="button" className="btn" onClick={addService} style={{ borderRadius: 12, fontWeight: 700 }}>
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
                    fontWeight: 700,
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
                      fontWeight: 800,
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
        </div>

        {/* Submit */}
        <div style={{ marginTop: 6 }}>
          <button type="submit" className="btn" style={{ width: "100%", borderRadius: 14, fontWeight: 700, padding: "12px 14px" }}>
            Create Client
          </button>
        </div>
      </form>

      <style jsx>{`
        .sectionTitle {
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 12px;
          letter-spacing: 0.2px;
        }

        .fieldLabel {
          font-size: 11px;
          font-weight: 700;
          opacity: 0.75;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 6px;
        }

        .formGrid {
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          gap: 12px;
        }

        .col12 {
          grid-column: span 12;
        }

        @media (min-width: 900px) {
          .col6 {
            grid-column: span 6;
          }
          .col4 {
            grid-column: span 4;
          }
          .col3 {
            grid-column: span 3;
          }
        }
      `}</style>
    </div>
  );
}
