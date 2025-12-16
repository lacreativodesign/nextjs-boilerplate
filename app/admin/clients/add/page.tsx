"use client";

import React, { useEffect, useMemo, useState } from "react";
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

function parseMoneyToNumber(input: string) {
  const cleaned = (input || "").replaceAll("$", "").replaceAll(",", "").trim();
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
    return `$ ${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  }
}

function useIsMobile(breakpoint = 720) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isMobile;
}

export default function AddClientPage() {
  const router = useRouter();
  const isMobile = useIsMobile(720);

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
  const [accountManager, setAccountManager] = useState("");
  const [productionOwner, setProductionOwner] = useState("");

  // Money (ALL USD)
  const [totalPaidInput, setTotalPaidInput] = useState("");
  const [openBalanceInput, setOpenBalanceInput] = useState("");

  // Services
  const [servicesInput, setServicesInput] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalPaid = useMemo(() => parseMoneyToNumber(totalPaidInput), [totalPaidInput]);
  const openBalance = useMemo(() => parseMoneyToNumber(openBalanceInput), [openBalanceInput]);

  // Keep layout clean (prevents weird horizontal scroll issues)
  useEffect(() => {
    const prev = document.body.style.overflowX;
    document.body.style.overflowX = "hidden";
    return () => {
      document.body.style.overflowX = prev;
    };
  }, []);

  // ====== STYLES (aligned to your ERP tokens) ======
  const pageWrap: React.CSSProperties = {
    width: "100%",
    maxWidth: "100%",
    paddingBottom: 92, // space for sticky action bar
  };

  const titleStyle: React.CSSProperties = {
    margin: "0 0 6px 0",
    fontSize: 30,
    fontWeight: 900,
    letterSpacing: -0.2,
  };

  const subtitleStyle: React.CSSProperties = {
    margin: "0 0 18px 0",
    opacity: 0.78,
    fontSize: 14,
  };

  const sectionCardStyle: React.CSSProperties = {
    borderRadius: 18,
    border: "1px solid rgba(148,163,184,0.22)",
    padding: 16,
    background: "var(--table-bg)", // ✅ uses your global grey token
    boxShadow: "var(--table-shadow)",
    width: "100%",
  };

  const sectionTitle: React.CSSProperties = {
    fontWeight: 900,
    marginBottom: 12,
    fontSize: 14,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    fontWeight: 800,
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
    color: "var(--table-text)", // ✅ selected text visible
  };

  const grid2: React.CSSProperties = isMobile
    ? { display: "grid", gridTemplateColumns: "1fr", gap: 14 }
    : { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 };

  const grid3: React.CSSProperties = isMobile
    ? { display: "grid", gridTemplateColumns: "1fr", gap: 14 }
    : { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 };

  const fieldWrap: React.CSSProperties = { display: "flex", flexDirection: "column" };

  const errorBox: React.CSSProperties = {
    background: "rgba(239,68,68,0.10)",
    border: "1px solid rgba(239,68,68,0.35)",
    color: "var(--table-text)",
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
    fontWeight: 650,
  };

  const stickyBar: React.CSSProperties = {
    position: "sticky",
    bottom: 0,
    marginTop: 18,
    borderRadius: 16,
    border: "1px solid rgba(148,163,184,0.18)",
    background: "var(--table-bg)",
    boxShadow: "0 -10px 30px rgba(0,0,0,0.18)",
    padding: 12,
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
    alignItems: "center",
    zIndex: 5,
  };

  const btnBase: React.CSSProperties = {
    height: 38,
    padding: "0 14px",
    borderRadius: 10,
    fontWeight: 800,
    fontSize: 13,
    cursor: saving ? "not-allowed" : "pointer",
    whiteSpace: "nowrap",
  };

  const btnGhost: React.CSSProperties = {
    ...btnBase,
    background: "transparent",
    border: "1px solid rgba(148,163,184,0.28)",
    color: "var(--table-text)",
  };

  const btnPrimary: React.CSSProperties = {
    ...btnBase,
    background: "var(--accent, #2563eb)",
    border: "1px solid rgba(37,99,235,0.35)",
    color: "#fff",
  };

  // ====== ACTIONS ======
  async function handleSubmit(next: "list" | "stay") {
    setError(null);

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

      if (next === "list") {
        router.push("/admin/clients");
        return;
      }

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
    } catch (e: any) {
      setError(e?.message || "Failed to create client.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={pageWrap}>
      {/* Fix dropdown option visibility in dark mode */}
      <style jsx global>{`
        select option {
          background: #0b1220;
          color: #ffffff;
        }
      `}</style>

      <h1 style={titleStyle}>Add Client</h1>
      <p style={subtitleStyle}>
        Create a new client record (company + owner contact). All amounts are tracked in USD.
      </p>

      {error ? <div style={errorBox}>{error}</div> : null}

      {/* Company Info */}
      <div style={sectionCardStyle}>
        <div style={sectionTitle}>Company Information</div>

        <div style={grid2}>
          <div style={fieldWrap}>
            <div style={labelStyle}>Company Name *</div>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. ACME Trading LLC"
              style={inputStyle}
            />
          </div>

          <div style={fieldWrap}>
            <div style={labelStyle}>Website</div>
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="e.g. https://acme.com"
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ height: 14 }} />

        <div style={grid3}>
          <div style={fieldWrap}>
            <div style={labelStyle}>Industry</div>
            <input
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. Retail, SaaS, Healthcare"
              style={inputStyle}
            />
          </div>

          <div style={fieldWrap}>
            <div style={labelStyle}>Country</div>
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="e.g. United States"
              style={inputStyle}
            />
          </div>

          <div style={fieldWrap}>
            <div style={labelStyle}>Timezone</div>
            <input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="e.g. America/New_York"
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      <div style={{ height: 14 }} />

      {/* Primary Contact */}
      <div style={sectionCardStyle}>
        <div style={sectionTitle}>Primary Contact (Business Owner)</div>

        <div style={grid2}>
          <div style={fieldWrap}>
            <div style={labelStyle}>Full Name *</div>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="e.g. John Doe"
              style={inputStyle}
            />
          </div>

          <div style={fieldWrap}>
            <div style={labelStyle}>Title / Designation</div>
            <input
              value={contactTitle}
              onChange={(e) => setContactTitle(e.target.value)}
              placeholder="e.g. Founder / CEO"
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ height: 14 }} />

        <div style={grid2}>
          <div style={fieldWrap}>
            <div style={labelStyle}>Email Address *</div>
            <input
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="e.g. owner@company.com"
              style={inputStyle}
            />
          </div>

          <div style={fieldWrap}>
            <div style={labelStyle}>Phone Number</div>
            <input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="e.g. +1 312 555 0199"
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      <div style={{ height: 14 }} />

      {/* Status & Lifecycle */}
      <div style={sectionCardStyle}>
        <div style={sectionTitle}>Status & Lifecycle</div>

        <div style={grid3}>
          <div style={fieldWrap}>
            <div style={labelStyle}>Sales Stage</div>
            <select value={salesStage} onChange={(e) => setSalesStage(e.target.value as SalesStage)} style={selectStyle}>
              {stageOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div style={fieldWrap}>
            <div style={labelStyle}>Payment Status</div>
            <select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
              style={selectStyle}
            >
              {paymentOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div style={fieldWrap}>
            <div style={labelStyle}>Retainer Status</div>
            <select
              value={retainerStatus}
              onChange={(e) => setRetainerStatus(e.target.value as RetainerStatus)}
              style={selectStyle}
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
        <div style={sectionTitle}>Ownership</div>

        <div style={grid3}>
          <div style={fieldWrap}>
            <div style={labelStyle}>Sales Owner *</div>
            <input
              value={salesOwner}
              onChange={(e) => setSalesOwner(e.target.value)}
              placeholder="e.g. Mansoor (Sales)"
              style={inputStyle}
            />
          </div>

          <div style={fieldWrap}>
            <div style={labelStyle}>Account Manager (AM)</div>
            <input
              value={accountManager}
              onChange={(e) => setAccountManager(e.target.value)}
              placeholder="(Assign after payment)"
              style={inputStyle}
            />
          </div>

          <div style={fieldWrap}>
            <div style={labelStyle}>Production Owner</div>
            <input
              value={productionOwner}
              onChange={(e) => setProductionOwner(e.target.value)}
              placeholder="e.g. Ayesha (Prod)"
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      <div style={{ height: 14 }} />

      {/* Money & Services */}
      <div style={sectionCardStyle}>
        <div style={sectionTitle}>Money & Services (USD)</div>

        <div style={grid2}>
          <div style={fieldWrap}>
            <div style={labelStyle}>Total Paid (lifetime)</div>
            <input
              value={totalPaidInput}
              onChange={(e) => setTotalPaidInput(e.target.value)}
              placeholder='$ 12,500'
              style={inputStyle}
            />
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
              Preview: <strong>{formatUSD(totalPaid)}</strong>
            </div>
          </div>

          <div style={fieldWrap}>
            <div style={labelStyle}>Open Balance</div>
            <input
              value={openBalanceInput}
              onChange={(e) => setOpenBalanceInput(e.target.value)}
              placeholder='$ 1,500'
              style={inputStyle}
            />
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
              Preview: <strong>{formatUSD(openBalance)}</strong>
            </div>
          </div>
        </div>

        <div style={{ height: 14 }} />

        <div style={fieldWrap}>
          <div style={labelStyle}>Services (comma-separated)</div>
          <input
            value={servicesInput}
            onChange={(e) => setServicesInput(e.target.value)}
            placeholder="Website Design, SEO Retainer, Social Media Marketing"
            style={inputStyle}
          />
        </div>
      </div>

      {/* Sticky action bar (aligned, consistent, usable) */}
      <div style={stickyBar}>
        <button
          type="button"
          style={btnGhost}
          disabled={saving}
          onClick={() => router.push("/admin/clients")}
        >
          Cancel
        </button>

        <button
          type="button"
          style={btnGhost}
          disabled={saving}
          onClick={() => handleSubmit("stay")}
          title="Save this client and reset the form for quick entry"
        >
          {saving ? "Saving..." : "Save & Add Another"}
        </button>

        <button
          type="button"
          style={btnPrimary}
          disabled={saving}
          onClick={() => handleSubmit("list")}
        >
          {saving ? "Saving..." : "Save Client"}
        </button>
      </div>
    </div>
  );
}
