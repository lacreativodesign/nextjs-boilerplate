"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";

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

function parseMoneyToNumber(input: string) {
  // accepts: "$ 12,500" "12500" "12,500" "$12,500"
  const cleaned = (input || "")
    .replaceAll("$", "")
    .replaceAll(",", "")
    .trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function formatUSD(n: number) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    // fallback
    return `$ ${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  }
}

export default function AddClientPage() {
  const router = useRouter();

  // Company
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [timezone, setTimezone] = useState("");

  // Primary Contact
  const [contactName, setContactName] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  // Status & Lifecycle
  const [salesStage, setSalesStage] = useState<SalesStage>("New Lead");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("Unpaid");
  const [retainerStatus, setRetainerStatus] = useState<RetainerStatus>("None");

  // Ownership
  const [salesOwner, setSalesOwner] = useState("");
  const [accountManager, setAccountManager] = useState(""); // optional (usually after payment)
  const [productionOwner, setProductionOwner] = useState("");

  // Money (ALL USD)
  const [totalPaidInput, setTotalPaidInput] = useState("");
  const [openBalanceInput, setOpenBalanceInput] = useState("");

  // Services (simple for now)
  const [servicesInput, setServicesInput] = useState(""); // comma-separated

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalPaid = useMemo(() => parseMoneyToNumber(totalPaidInput), [totalPaidInput]);
  const openBalance = useMemo(() => parseMoneyToNumber(openBalanceInput), [openBalanceInput]);

  const sectionCardStyle: React.CSSProperties = {
    borderRadius: 18,
    border: "1px solid rgba(148,163,184,0.22)",
    padding: 16,
    background: "var(--table-bg)", // ✅ pulls the GREY token from your global table system
    boxShadow: "var(--table-shadow)",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    fontWeight: 700,
    opacity: 0.9,
    marginBottom: 6,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(148,163,184,0.22)",
    background: "rgba(255,255,255,0.04)",
    color: "var(--table-text)",
    outline: "none",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: "none",
  };

  const grid2: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 14,
  };

  const grid3: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 14,
  };

  const isMobileGrid2: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 14,
  };

  const isMobileGrid3: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 14,
  };

  async function handleSubmit(next: "list" | "stay") {
    setError(null);

    // Minimal required fields (keep it practical)
    if (!companyName.trim()) return setError("Company Name is required.");
    if (!contactName.trim()) return setError("Primary Contact Full Name is required.");
    if (!contactEmail.trim()) return setError("Primary Contact Email is required.");
    if (!salesOwner.trim()) return setError("Sales Owner is required.");

    setSaving(true);
    try {
      const services = servicesInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        // Company
        companyName: companyName.trim(),
        website: website.trim(),
        industry: industry.trim(),
        country: country.trim(),
        timezone: timezone.trim(),

        // Primary Contact
        primaryContact: {
          fullName: contactName.trim(),
          title: contactTitle.trim(),
          email: contactEmail.trim().toLowerCase(),
          phone: contactPhone.trim(),
        },

        // Lifecycle
        salesStage,
        paymentStatus,
        retainerStatus,

        // Ownership
        salesOwner: salesOwner.trim(),
        accountManager: accountManager.trim(),
        productionOwner: productionOwner.trim(),

        // Money (USD)
        currency: "USD",
        totalPaid,
        openBalance,

        // Services
        services,

        // System
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "clients"), payload);

      if (next === "list") router.push("/admin/clients");
      else {
        // reset for quick entry
        setCompanyName("");
        setWebsite("");
        setIndustry("");
        setCountry("");
        setTimezone("");

        setContactName("");
        setContactTitle("");
        setContactEmail("");
        setContactPhone("");

        setSalesStage("New Lead");
        setPaymentStatus("Unpaid");
        setRetainerStatus("None");

        setSalesOwner("");
        setAccountManager("");
        setProductionOwner("");

        setTotalPaidInput("");
        setOpenBalanceInput("");
        setServicesInput("");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to create client.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      <h1 style={{ margin: "0 0 6px 0", fontSize: 30, fontWeight: 900 }}>Add Client</h1>
      <p style={{ margin: "0 0 18px 0", opacity: 0.75 }}>
        Create a new client record (company + owner contact). All amounts are tracked in USD.
      </p>

      {error ? (
        <div
          style={{
            background: "rgba(239,68,68,0.10)",
            border: "1px solid rgba(239,68,68,0.35)",
            color: "var(--table-text)",
            padding: 12,
            borderRadius: 12,
            marginBottom: 14,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      ) : null}

      {/* Company Info */}
      <div style={sectionCardStyle}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>Company Information</div>

        <div style={typeof window !== "undefined" && window.innerWidth < 720 ? isMobileGrid2 : grid2}>
          <div>
            <div style={labelStyle}>Company Name *</div>
            <input
              style={inputStyle}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. ACME Trading LLC"
            />
          </div>

          <div>
            <div style={labelStyle}>Website</div>
            <input
              style={inputStyle}
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="e.g. https://acme.com"
            />
          </div>
        </div>

        <div style={{ height: 12 }} />

        <div style={typeof window !== "undefined" && window.innerWidth < 720 ? isMobileGrid3 : grid3}>
          <div>
            <div style={labelStyle}>Industry</div>
            <input
              style={inputStyle}
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. Retail, SaaS, Healthcare"
            />
          </div>

          <div>
            <div style={labelStyle}>Country</div>
            <input
              style={inputStyle}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="e.g. United States"
            />
          </div>

          <div>
            <div style={labelStyle}>Timezone</div>
            <input
              style={inputStyle}
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="e.g. America/New_York"
            />
          </div>
        </div>
      </div>

      <div style={{ height: 14 }} />

      {/* Primary Contact */}
      <div style={sectionCardStyle}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>Primary Contact (Business Owner)</div>

        <div style={typeof window !== "undefined" && window.innerWidth < 720 ? isMobileGrid2 : grid2}>
          <div>
            <div style={labelStyle}>Full Name *</div>
            <input
              style={inputStyle}
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="e.g. John Doe"
            />
          </div>

          <div>
            <div style={labelStyle}>Title / Designation</div>
            <input
              style={inputStyle}
              value={contactTitle}
              onChange={(e) => setContactTitle(e.target.value)}
              placeholder="e.g. Founder / CEO"
            />
          </div>
        </div>

        <div style={{ height: 12 }} />

        <div style={typeof window !== "undefined" && window.innerWidth < 720 ? isMobileGrid2 : grid2}>
          <div>
            <div style={labelStyle}>Email Address *</div>
            <input
              style={inputStyle}
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="e.g. owner@company.com"
            />
          </div>

          <div>
            <div style={labelStyle}>Phone Number</div>
            <input
              style={inputStyle}
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="e.g. +1 312 555 0199"
            />
          </div>
        </div>
      </div>

      <div style={{ height: 14 }} />

      {/* Status & Lifecycle */}
      <div style={sectionCardStyle}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>Status & Lifecycle</div>

        <div style={typeof window !== "undefined" && window.innerWidth < 720 ? isMobileGrid3 : grid3}>
          <div>
            <div style={labelStyle}>Sales Stage</div>
            <select
              style={selectStyle}
              value={salesStage}
              onChange={(e) => setSalesStage(e.target.value as SalesStage)}
            >
              {[
                "New Lead",
                "Contacted",
                "Qualified",
                "Proposal Sent",
                "Negotiation",
                "Closed Won",
                "Closed Lost",
              ].map((s) => (
                <option key={s} value={s} style={{ color: "#0B1220" }}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={labelStyle}>Payment Status</div>
            <select
              style={selectStyle}
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
            >
              {["Unpaid", "Partially Paid", "Paid"].map((s) => (
                <option key={s} value={s} style={{ color: "#0B1220" }}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={labelStyle}>Retainer Status</div>
            <select
              style={selectStyle}
              value={retainerStatus}
              onChange={(e) => setRetainerStatus(e.target.value as RetainerStatus)}
            >
              {["None", "Active", "Paused", "Cancelled"].map((s) => (
                <option key={s} value={s} style={{ color: "#0B1220" }}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div style={{ height: 14 }} />

      {/* Ownership */}
      <div style={sectionCardStyle}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>Ownership & Assignment</div>

        <div style={typeof window !== "undefined" && window.innerWidth < 720 ? isMobileGrid3 : grid3}>
          <div>
            <div style={labelStyle}>Sales Owner *</div>
            <input
              style={inputStyle}
              value={salesOwner}
              onChange={(e) => setSalesOwner(e.target.value)}
              placeholder="e.g. Mansoor (Sales)"
            />
          </div>

          <div>
            <div style={labelStyle}>Account Manager (AM)</div>
            <input
              style={inputStyle}
              value={accountManager}
              onChange={(e) => setAccountManager(e.target.value)}
              placeholder="(Assign after payment)"
            />
          </div>

          <div>
            <div style={labelStyle}>Production Owner</div>
            <input
              style={inputStyle}
              value={productionOwner}
              onChange={(e) => setProductionOwner(e.target.value)}
              placeholder="e.g. Ayesha (Prod)"
            />
          </div>
        </div>
      </div>

      <div style={{ height: 14 }} />

      {/* Money */}
      <div style={sectionCardStyle}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>Money (USD)</div>

        <div style={typeof window !== "undefined" && window.innerWidth < 720 ? isMobileGrid2 : grid2}>
          <div>
            <div style={labelStyle}>Total Paid (Lifetime)</div>
            <input
              style={inputStyle}
              value={totalPaidInput}
              onChange={(e) => setTotalPaidInput(e.target.value)}
              placeholder="e.g. $ 12,500"
            />
            <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>
              Preview: <b>{formatUSD(totalPaid)}</b>
            </div>
          </div>

          <div>
            <div style={labelStyle}>Open Balance</div>
            <input
              style={inputStyle}
              value={openBalanceInput}
              onChange={(e) => setOpenBalanceInput(e.target.value)}
              placeholder="e.g. $ 1,500"
            />
            <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>
              Preview: <b>{formatUSD(openBalance)}</b>
            </div>
          </div>
        </div>
      </div>

      <div style={{ height: 14 }} />

      {/* Services */}
      <div style={sectionCardStyle}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>Services (comma-separated)</div>
        <div>
          <div style={labelStyle}>Services</div>
          <input
            style={inputStyle}
            value={servicesInput}
            onChange={(e) => setServicesInput(e.target.value)}
            placeholder="e.g. Website Design, SEO Retainer, Social Media Marketing"
          />
        </div>
      </div>

      {/* ✅ ACTION BUTTONS (this was missing) */}
      <div
        style={{
          position: "sticky",
          bottom: 14,
          marginTop: 16,
          display: "flex",
          gap: 10,
          justifyContent: "flex-end",
        }}
      >
        <button
          className="btn ghost"
          type="button"
          onClick={() => router.push("/admin/clients")}
          disabled={saving}
        >
          Cancel
        </button>

        <button
          className="btn ghost"
          type="button"
          onClick={() => handleSubmit("stay")}
          disabled={saving}
        >
          Save & Add Another
        </button>

        <button className="btn" type="button" onClick={() => handleSubmit("list")} disabled={saving}>
          {saving ? "Saving..." : "Save Client"}
        </button>
      </div>
    </div>
  );
}
