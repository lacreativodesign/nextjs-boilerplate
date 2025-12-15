// app/admin/clients/add/page.tsx
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

const paymentOptions: PaymentStatus[] = [
  "Unpaid",
  "Partially Paid",
  "Paid",
  "Refunded",
];

const retainerOptions: RetainerStatus[] = [
  "None",
  "Active",
  "Paused",
  "Cancelled",
];

const formatUSD = (v: number) => `$ ${v.toLocaleString("en-US")}`;

export default function AddClientPage() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setIsDark(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  /** 🔒 LOCKED ERP GREY SYSTEM */
  const cardStyle: React.CSSProperties = {
    background: isDark ? "var(--card-bg)" : "#ffffff",
    border: "1px solid var(--card-border)",
    borderRadius: 18,
  };

  const inputStyle: React.CSSProperties = {
    background: isDark ? "rgba(255,255,255,0.06)" : "#ffffff",
    color: isDark ? "#E5E7EB" : "#0F172A",
  };

  /* State (unchanged logic) */
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [timezone, setTimezone] = useState("");

  const [contactName, setContactName] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [stage, setStage] = useState<SalesStage>("New Lead");
  const [paymentStatus, setPaymentStatus] =
    useState<PaymentStatus>("Unpaid");
  const [retainerStatus, setRetainerStatus] =
    useState<RetainerStatus>("None");

  return (
    <div>
      <h2 className="pageTitle">Add Client</h2>
      <p className="pageDesc">
        Create a new client record (company + owner contact). All amounts are
        tracked in USD.
      </p>

      {/* Company */}
      <div className="card" style={cardStyle}>
        <div className="sectionTitle">Company Information</div>

        <div className="grid">
          <input
            className="input"
            style={inputStyle}
            placeholder="Company Name *"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
          <input
            className="input"
            style={inputStyle}
            placeholder="Website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
          <input
            className="input"
            style={inputStyle}
            placeholder="Industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          />
          <input
            className="input"
            style={inputStyle}
            placeholder="Country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          />
          <input
            className="input"
            style={inputStyle}
            placeholder="Timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          />
        </div>
      </div>

      {/* Contact */}
      <div className="card" style={cardStyle}>
        <div className="sectionTitle">Primary Contact</div>

        <div className="grid">
          <input
            className="input"
            style={inputStyle}
            placeholder="Full Name *"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
          <input
            className="input"
            style={inputStyle}
            placeholder="Title / Designation"
            value={contactTitle}
            onChange={(e) => setContactTitle(e.target.value)}
          />
          <input
            className="input"
            style={inputStyle}
            placeholder="Email Address *"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="input"
            style={inputStyle}
            placeholder="Phone Number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      </div>

      {/* Status */}
      <div className="card" style={cardStyle}>
        <div className="sectionTitle">Status & Lifecycle</div>

        <div className="grid">
          <select
            className="input"
            style={inputStyle}
            value={stage}
            onChange={(e) => setStage(e.target.value as SalesStage)}
          >
            {stageOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            className="input"
            style={inputStyle}
            value={paymentStatus}
            onChange={(e) =>
              setPaymentStatus(e.target.value as PaymentStatus)
            }
          >
            {paymentOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <select
            className="input"
            style={inputStyle}
            value={retainerStatus}
            onChange={(e) =>
              setRetainerStatus(e.target.value as RetainerStatus)
            }
          >
            {retainerOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      <style jsx>{`
        .pageTitle {
          font-size: 26px;
          font-weight: 700;
        }
        .pageDesc {
          font-size: 14px;
          opacity: 0.7;
          margin-bottom: 16px;
        }
        .card {
          padding: 16px;
          margin-bottom: 16px;
        }
        .sectionTitle {
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 12px;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 12px;
        }
        .input {
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid rgba(148, 163, 184, 0.25);
          font-size: 14px;
        }
        select option {
          color: #0f172a;
        }
        :global(.dark) select option {
          color: #0f172a;
        }
      `}</style>
    </div>
  );
}
