"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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

function useIsDarkMode() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const root = document.documentElement;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");

    const read = () => {
      const byClass = root.classList.contains("dark");
      const bySystem = !!mql.matches;
      setIsDark(byClass || bySystem);
    };

    read();

    const obs = new MutationObserver(() => read());
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });

    // @ts-expect-error older browsers
    mql.addEventListener ? mql.addEventListener("change", read) : mql.addListener(read);

    return () => {
      obs.disconnect();
      // @ts-expect-error older browsers
      mql.removeEventListener ? mql.removeEventListener("change", read) : mql.removeListener(read);
    };
  }, []);

  return isDark;
}

export default function AddClientPage() {
  const isDark = useIsDarkMode();
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Company
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [timezone, setTimezone] = useState("");

  // Primary Contact
  const [primaryContactName, setPrimaryContactName] = useState("");
  const [primaryContactTitle, setPrimaryContactTitle] = useState("");
  const [primaryContactEmail, setPrimaryContactEmail] = useState("");
  const [primaryContactPhone, setPrimaryContactPhone] = useState("");

  // Ownership
  const [salesOwner, setSalesOwner] = useState("");
  const [accountManager, setAccountManager] = useState("");
  const [productionOwner, setProductionOwner] = useState("");

  // Pipeline
  const [salesStage, setSalesStage] = useState<SalesStage>("New Lead");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("Unpaid");
  const [retainerStatus, setRetainerStatus] = useState<RetainerStatus>("None");

  // Finance (optional initial)
  const [totalPaidUsd, setTotalPaidUsd] = useState<string>("0");

  const pageMaxWidth = 1120;

  const shellStyle: React.CSSProperties = useMemo(
    () => ({
      borderRadius: 20,
      padding: 16,
      border: isDark ? "1px solid rgba(148,163,184,0.28)" : "1px solid rgba(15,23,42,0.10)",
      background: isDark ? "rgba(38,38,38,0.55)" : "rgba(255,255,255,0.90)",
      boxShadow: isDark ? "0 20px 60px rgba(0,0,0,0.55)" : "0 18px 55px rgba(15,23,42,0.10)",
    }),
    [isDark]
  );

  const sectionStyle: React.CSSProperties = useMemo(
    () => ({
      borderRadius: 16,
      padding: 14,
      border: isDark ? "1px solid rgba(148,163,184,0.22)" : "1px solid rgba(15,23,42,0.08)",
      background: isDark ? "rgba(255,255,255,0.02)" : "rgba(15,23,42,0.02)",
    }),
    [isDark]
  );

  const labelStyle: React.CSSProperties = useMemo(
    () => ({
      fontSize: 11,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      fontWeight: 900,
      color: isDark ? "rgba(226,232,240,0.80)" : "rgba(15,23,42,0.55)",
      marginBottom: 6,
    }),
    [isDark]
  );

  const helperStyle: React.CSSProperties = useMemo(
    () => ({
      marginTop: 2,
      fontSize: 12,
      color: isDark ? "rgba(226,232,240,0.65)" : "rgba(15,23,42,0.55)",
    }),
    [isDark]
  );

  const titleColor = isDark ? "rgba(255,255,255,0.95)" : "rgba(15,23,42,0.95)";
  const subColor = isDark ? "rgba(226,232,240,0.70)" : "rgba(15,23,42,0.65)";

  const grid2: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  };

  const grid3: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12,
  };

  const grid4: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!companyName.trim()) return setError("Company Name is required.");
    if (!primaryContactName.trim()) return setError("Contact Name is required.");
    if (!primaryContactEmail.trim()) return setError("Contact Email is required.");

    setSubmitting(true);
    try {
      const payload = {
        companyName: companyName.trim(),
        website: website.trim(),
        industry: industry.trim(),
        country: country.trim(),
        timezone: timezone.trim(),

        primaryContactName: primaryContactName.trim(),
        primaryContactTitle: primaryContactTitle.trim(),
        primaryContactEmail: primaryContactEmail.trim(),
        primaryContactPhone: primaryContactPhone.trim(),

        salesOwner: salesOwner.trim(),
        accountManager: accountManager.trim(),
        productionOwner: productionOwner.trim(),

        salesStage,
        paymentStatus,
        retainerStatus,

        totalPaidUsd: Number(String(totalPaidUsd || "0").replace(/,/g, "")) || 0,
      };

      const res = await fetch("/api/admin/clients/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || res.statusText || "Failed to create client");
      }

      router.push("/admin/clients");
    } catch (err: any) {
      setError(err?.message || "Failed to create client");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ width: "100%" }}>
      <div style={{ maxWidth: pageMaxWidth, margin: "0 auto" }}>
        <h1 style={{ fontSize: 34, fontWeight: 900, marginBottom: 8, color: titleColor }}>Add Client</h1>
        <div style={{ marginBottom: 18, color: subColor }}>
          Create a new client record and start tracking pipeline, payments and ownership.
        </div>

        <form onSubmit={onSubmit}>
          <div style={shellStyle}>
            {error && (
              <div style={{ marginBottom: 12, color: "#FCA5A5", fontSize: 14, fontWeight: 700 }}>
                {error}
              </div>
            )}

            {/* COMPANY INFORMATION */}
            <div style={sectionStyle}>
              <div style={labelStyle}>Company Information</div>

              <div style={{ height: 10 }} />

              <div style={grid4} className="lac-grid-4">
                <Field label="Company Name *" labelStyle={labelStyle}>
                  <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                </Field>

                <Field label="Website" labelStyle={labelStyle}>
                  <input className="input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" />
                </Field>

                <Field label="Industry" labelStyle={labelStyle}>
                  <input className="input" value={industry} onChange={(e) => setIndustry(e.target.value)} />
                </Field>

                <Field label="Country" labelStyle={labelStyle}>
                  <input className="input" value={country} onChange={(e) => setCountry(e.target.value)} />
                </Field>
              </div>

              <div style={{ height: 12 }} />

              <div style={grid2} className="lac-grid-2">
                <Field label="Timezone" labelStyle={labelStyle}>
                  <input className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="America/New_York" />
                  <div style={helperStyle}>Keep it short. Don’t stretch the field across the whole page.</div>
                </Field>

                <Field label="Initial Total Paid (USD)" labelStyle={labelStyle}>
                  <input className="input" value={totalPaidUsd} onChange={(e) => setTotalPaidUsd(e.target.value)} placeholder="0" />
                  <div style={helperStyle}>Optional. You can leave it as 0.</div>
                </Field>
              </div>
            </div>

            <div style={{ height: 12 }} />

            {/* PRIMARY CONTACT */}
            <div style={sectionStyle}>
              <div style={labelStyle}>Primary Contact</div>

              <div style={{ height: 10 }} />

              <div style={grid4} className="lac-grid-4">
                <Field label="Contact Name *" labelStyle={labelStyle}>
                  <input className="input" value={primaryContactName} onChange={(e) => setPrimaryContactName(e.target.value)} />
                </Field>

                <Field label="Contact Title" labelStyle={labelStyle}>
                  <input className="input" value={primaryContactTitle} onChange={(e) => setPrimaryContactTitle(e.target.value)} />
                </Field>

                <Field label="Contact Email *" labelStyle={labelStyle}>
                  <input className="input" value={primaryContactEmail} onChange={(e) => setPrimaryContactEmail(e.target.value)} />
                </Field>

                <Field label="Contact Phone" labelStyle={labelStyle}>
                  <input className="input" value={primaryContactPhone} onChange={(e) => setPrimaryContactPhone(e.target.value)} />
                </Field>
              </div>
            </div>

            <div style={{ height: 12 }} />

            {/* OWNERSHIP */}
            <div style={sectionStyle}>
              <div style={labelStyle}>Ownership</div>

              <div style={{ height: 10 }} />

              <div style={grid3} className="lac-grid-3">
                <Field label="Sales Owner" labelStyle={labelStyle}>
                  <input className="input" value={salesOwner} onChange={(e) => setSalesOwner(e.target.value)} placeholder="e.g. Chris" />
                </Field>

                <Field label="Account Manager" labelStyle={labelStyle}>
                  <input className="input" value={accountManager} onChange={(e) => setAccountManager(e.target.value)} placeholder="e.g. Marc" />
                </Field>

                <Field label="Production Owner" labelStyle={labelStyle}>
                  <input className="input" value={productionOwner} onChange={(e) => setProductionOwner(e.target.value)} placeholder="e.g. Jennifer" />
                </Field>
              </div>
            </div>

            <div style={{ height: 12 }} />

            {/* PIPELINE */}
            <div style={sectionStyle}>
              <div style={labelStyle}>Pipeline</div>

              <div style={{ height: 10 }} />

              <div style={grid3} className="lac-grid-3">
                <Field label="Sales Stage" labelStyle={labelStyle}>
                  <select className="input" value={salesStage} onChange={(e) => setSalesStage(e.target.value as SalesStage)}>
                    <option>New Lead</option>
                    <option>Contacted</option>
                    <option>Qualified</option>
                    <option>Proposal Sent</option>
                    <option>Negotiation</option>
                    <option>Closed Won</option>
                    <option>Closed Lost</option>
                  </select>
                </Field>

                <Field label="Payment Status" labelStyle={labelStyle}>
                  <select className="input" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}>
                    <option>Unpaid</option>
                    <option>Partially Paid</option>
                    <option>Paid</option>
                    <option>Refunded</option>
                  </select>
                </Field>

                <Field label="Retainer Status" labelStyle={labelStyle}>
                  <select className="input" value={retainerStatus} onChange={(e) => setRetainerStatus(e.target.value as RetainerStatus)}>
                    <option>None</option>
                    <option>Active</option>
                    <option>Paused</option>
                    <option>Cancelled</option>
                  </select>
                </Field>
              </div>
            </div>

            <div style={{ height: 16 }} />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" className="btn ghost" onClick={() => router.push("/admin/clients")} style={{ borderRadius: 999 }}>
                Cancel
              </button>
              <button type="submit" className="btn" disabled={submitting} style={{ borderRadius: 999 }}>
                {submitting ? "Adding..." : "Add Client"}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Responsive grid helpers (no Tailwind dependency, keeps it stable) */}
      <style>{`
        @media (max-width: 1024px){
          .lac-grid-4{ grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
          .lac-grid-3{ grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
        }
        @media (max-width: 640px){
          .lac-grid-4,
          .lac-grid-3,
          .lac-grid-2{ grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
  labelStyle,
}: {
  label: string;
  children: React.ReactNode;
  labelStyle: React.CSSProperties;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={labelStyle}>{label}</div>
      {children}
    </div>
  );
}
