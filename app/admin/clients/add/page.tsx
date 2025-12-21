"use client";

import { useEffect, useMemo, useState } from "react";

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

type ClientRecord = {
  id: string;
  companyName: string;
  website?: string;
  industry?: string;
  country?: string;
  timezone?: string;

  primaryContactName: string;
  primaryContactTitle?: string;
  primaryContactEmail: string;
  primaryContactPhone?: string;

  salesStage?: SalesStage | string;
  paymentStatus?: PaymentStatus | string;
  retainerStatus?: RetainerStatus | string;

  salesOwner?: string;
  accountManager?: string;
  productionOwner?: string;

  totalPaidUsd: number;
  orderId?: string;

  createdAt?: string | null;
  updatedAt?: string | null;
  lastActivity?: string | null;
};

type ApiResp =
  | { ok: true; clientId?: string }
  | { ok?: false; error?: string };

function normalizeOrderId(orderId?: string) {
  const v = (orderId || "").trim();
  if (!v) return "";
  const up = v.toUpperCase();

  if (up.startsWith("LC-")) return up;
  if (up.startsWith("ORD-")) return `LC-${up.slice(4)}`;

  const digits = up.replace(/\D/g, "");
  if (digits) return `LC-${digits.padStart(4, "0")}`;

  return `LC-${up}`;
}

/**
 * Works with BOTH:
 * 1) Manual toggle (.dark on html)
 * 2) System dark mode (prefers-color-scheme)
 */
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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [timezone, setTimezone] = useState("");

  const [primaryContactName, setPrimaryContactName] = useState("");
  const [primaryContactTitle, setPrimaryContactTitle] = useState("");
  const [primaryContactEmail, setPrimaryContactEmail] = useState("");
  const [primaryContactPhone, setPrimaryContactPhone] = useState("");

  const [salesOwner, setSalesOwner] = useState("");
  const [accountManager, setAccountManager] = useState("");
  const [productionOwner, setProductionOwner] = useState("");

  const [salesStage, setSalesStage] = useState<SalesStage>("New Lead");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("Unpaid");
  const [retainerStatus, setRetainerStatus] = useState<RetainerStatus>("None");

  const [totalPaidUsd, setTotalPaidUsd] = useState<number>(0);
  const [orderId, setOrderId] = useState("");

  const styles = useMemo(() => {
    const pageTitle: React.CSSProperties = {
      fontSize: 34,
      fontWeight: 900,
      marginBottom: 8,
      color: isDark ? "rgba(255,255,255,0.95)" : "rgba(15,23,42,0.95)",
    };

    const pageSub: React.CSSProperties = {
      marginBottom: 18,
      color: isDark ? "rgba(255,255,255,0.72)" : "rgba(15,23,42,0.65)",
      fontSize: 14,
      lineHeight: 1.5,
    };

    // full-width like Create User (NOT centered)
    const fullWidthWrap: React.CSSProperties = {
      width: "100%",
      maxWidth: "none",
    };

    // KEY-ACCOUNTS master shell
    const formShell: React.CSSProperties = {
      borderRadius: 20,
      padding: 18,
      border: isDark ? "1px solid rgba(148,163,184,0.28)" : "1px solid rgba(15,23,42,0.10)",
      background: isDark ? "rgba(38,38,38,0.55)" : "rgba(255,255,255,0.85)",
      boxShadow: isDark ? "0 20px 60px rgba(0,0,0,0.55)" : "0 18px 55px rgba(15,23,42,0.10)",
    };

    // inner section surfaces MUST be grey in dark mode (not blue)
    const sectionCard: React.CSSProperties = {
      borderRadius: 16,
      padding: 14,
      border: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
      background: isDark ? "rgba(255,255,255,0.02)" : "rgba(15,23,42,0.02)",
    };

    const sectionTitle: React.CSSProperties = {
      fontSize: 12,
      fontWeight: 900,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      opacity: isDark ? 0.8 : 0.72,
      marginBottom: 10,
      color: isDark ? "rgba(226,232,240,0.92)" : "rgba(15,23,42,0.70)",
    };

    const label: React.CSSProperties = {
      fontSize: 11,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      fontWeight: 900,
      marginBottom: 6,
      color: isDark ? "rgba(226,232,240,0.70)" : "rgba(15,23,42,0.55)",
    };

    const help: React.CSSProperties = {
      fontSize: 12,
      marginTop: 6,
      color: isDark ? "rgba(226,232,240,0.60)" : "rgba(15,23,42,0.55)",
    };

    const actions: React.CSSProperties = {
      display: "flex",
      justifyContent: "flex-end",
      gap: 10,
      marginTop: 14,
    };

    const errorText: React.CSSProperties = {
      fontSize: 14,
      color: "#FCA5A5",
      marginBottom: 12,
    };

    const okText: React.CSSProperties = {
      fontSize: 14,
      color: isDark ? "rgba(226,232,240,0.85)" : "rgba(15,23,42,0.70)",
      marginBottom: 12,
    };

    return {
      pageTitle,
      pageSub,
      fullWidthWrap,
      formShell,
      sectionCard,
      sectionTitle,
      label,
      help,
      actions,
      errorText,
      okText,
    };
  }, [isDark]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!companyName.trim()) return setError("Company name is required.");
    if (!primaryContactName.trim()) return setError("Primary contact name is required.");
    if (!primaryContactEmail.trim()) return setError("Primary contact email is required.");

    setLoading(true);
    try {
      const payload: Partial<ClientRecord> = {
        companyName: companyName.trim(),
        website: website.trim() || undefined,
        industry: industry.trim() || undefined,
        country: country.trim() || undefined,
        timezone: timezone.trim() || undefined,

        primaryContactName: primaryContactName.trim(),
        primaryContactTitle: primaryContactTitle.trim() || undefined,
        primaryContactEmail: primaryContactEmail.trim(),
        primaryContactPhone: primaryContactPhone.trim() || undefined,

        salesOwner: salesOwner.trim() || undefined,
        accountManager: accountManager.trim() || undefined,
        productionOwner: productionOwner.trim() || undefined,

        salesStage,
        paymentStatus,
        retainerStatus,

        totalPaidUsd: Number(totalPaidUsd || 0),
        orderId: normalizeOrderId(orderId) || undefined,
      };

      const res = await fetch("/api/admin/clients/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });

      const json = (await res.json().catch(() => ({}))) as ApiResp;

      if (!res.ok || !("ok" in json) || !json.ok) {
        throw new Error((json as any)?.error || "Failed to create client");
      }

      // reset
      setCompanyName("");
      setWebsite("");
      setIndustry("");
      setCountry("");
      setTimezone("");

      setPrimaryContactName("");
      setPrimaryContactTitle("");
      setPrimaryContactEmail("");
      setPrimaryContactPhone("");

      setSalesOwner("");
      setAccountManager("");
      setProductionOwner("");

      setSalesStage("New Lead");
      setPaymentStatus("Unpaid");
      setRetainerStatus("None");

      setTotalPaidUsd(0);
      setOrderId("");
    } catch (err: any) {
      setError(err?.message || "Failed to create client");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.fullWidthWrap}>
      <h1 style={styles.pageTitle}>Add Client</h1>
      <div style={styles.pageSub}>
        Create a new client record and start tracking pipeline, payments and ownership.
      </div>

      <div style={styles.formShell}>
        {error ? <div style={styles.errorText}>{error}</div> : <div style={styles.okText} />}

        <form onSubmit={onSubmit}>
          {/* Company Information */}
          <div style={styles.sectionCard}>
            <div style={styles.sectionTitle}>Company Information</div>

            <div className="grid grid-cols-4 gap-3 max-[1100px]:grid-cols-2 max-[640px]:grid-cols-1">
              <div>
                <div style={styles.label}>
                  Company Name <span style={{ color: "#EF4444" }}>*</span>
                </div>
                <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>

              <div>
                <div style={styles.label}>Website</div>
                <input className="input" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>

              <div>
                <div style={styles.label}>Industry</div>
                <input className="input" value={industry} onChange={(e) => setIndustry(e.target.value)} />
              </div>

              <div>
                <div style={styles.label}>Country</div>
                <input className="input" value={country} onChange={(e) => setCountry(e.target.value)} />
              </div>
            </div>

            <div style={{ height: 12 }} />

            <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
              <div>
                <div style={styles.label}>Timezone</div>
                <input className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
                <div style={styles.help}>Keep it short. Don’t stretch the field across the whole page.</div>
              </div>

              <div>
                <div style={styles.label}>Initial Total Paid (USD)</div>
                <input
                  className="input"
                  type="number"
                  value={Number.isFinite(totalPaidUsd) ? String(totalPaidUsd) : "0"}
                  onChange={(e) => setTotalPaidUsd(Number(e.target.value || 0))}
                />
                <div style={styles.help}>Optional. You can leave it as 0.</div>
              </div>
            </div>
          </div>

          <div style={{ height: 12 }} />

          {/* Primary Contact */}
          <div style={styles.sectionCard}>
            <div style={styles.sectionTitle}>Primary Contact</div>

            <div className="grid grid-cols-4 gap-3 max-[1100px]:grid-cols-2 max-[640px]:grid-cols-1">
              <div>
                <div style={styles.label}>
                  Contact Name <span style={{ color: "#EF4444" }}>*</span>
                </div>
                <input
                  className="input"
                  value={primaryContactName}
                  onChange={(e) => setPrimaryContactName(e.target.value)}
                />
              </div>

              <div>
                <div style={styles.label}>Contact Title</div>
                <input
                  className="input"
                  value={primaryContactTitle}
                  onChange={(e) => setPrimaryContactTitle(e.target.value)}
                />
              </div>

              <div>
                <div style={styles.label}>
                  Contact Email <span style={{ color: "#EF4444" }}>*</span>
                </div>
                <input
                  className="input"
                  value={primaryContactEmail}
                  onChange={(e) => setPrimaryContactEmail(e.target.value)}
                />
              </div>

              <div>
                <div style={styles.label}>Contact Phone</div>
                <input
                  className="input"
                  value={primaryContactPhone}
                  onChange={(e) => setPrimaryContactPhone(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div style={{ height: 12 }} />

          {/* Ownership */}
          <div style={styles.sectionCard}>
            <div style={styles.sectionTitle}>Ownership</div>

            <div className="grid grid-cols-3 gap-3 max-[1100px]:grid-cols-2 max-[640px]:grid-cols-1">
              <div>
                <div style={styles.label}>Sales Owner</div>
                <input className="input" value={salesOwner} onChange={(e) => setSalesOwner(e.target.value)} />
              </div>

              <div>
                <div style={styles.label}>Account Manager</div>
                <input
                  className="input"
                  value={accountManager}
                  onChange={(e) => setAccountManager(e.target.value)}
                />
              </div>

              <div>
                <div style={styles.label}>Production Owner</div>
                <input
                  className="input"
                  value={productionOwner}
                  onChange={(e) => setProductionOwner(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div style={{ height: 12 }} />

          {/* Pipeline */}
          <div style={styles.sectionCard}>
            <div style={styles.sectionTitle}>Pipeline</div>

            <div className="grid grid-cols-3 gap-3 max-[1100px]:grid-cols-2 max-[640px]:grid-cols-1">
              <div>
                <div style={styles.label}>Sales Stage</div>
                <select className="input" value={salesStage} onChange={(e) => setSalesStage(e.target.value as SalesStage)}>
                  <option value="New Lead">New Lead</option>
                  <option value="Contacted">Contacted</option>
                  <option value="Qualified">Qualified</option>
                  <option value="Proposal Sent">Proposal Sent</option>
                  <option value="Negotiation">Negotiation</option>
                  <option value="Closed Won">Closed Won</option>
                  <option value="Closed Lost">Closed Lost</option>
                </select>
              </div>

              <div>
                <div style={styles.label}>Payment Status</div>
                <select
                  className="input"
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                >
                  <option value="Unpaid">Unpaid</option>
                  <option value="Partially Paid">Partially Paid</option>
                  <option value="Paid">Paid</option>
                  <option value="Refunded">Refunded</option>
                </select>
              </div>

              <div>
                <div style={styles.label}>Retainer Status</div>
                <select
                  className="input"
                  value={retainerStatus}
                  onChange={(e) => setRetainerStatus(e.target.value as RetainerStatus)}
                >
                  <option value="None">None</option>
                  <option value="Active">Active</option>
                  <option value="Paused">Paused</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
            </div>
          </div>

          <div style={{ height: 12 }} />

          {/* Order */}
          <div style={styles.sectionCard}>
            <div style={styles.sectionTitle}>Order</div>
            <div>
              <div style={styles.label}>Order ID</div>
              <input className="input" value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="LC-0001" />
            </div>
          </div>

          <div style={styles.actions}>
            <button className="btn" type="submit" disabled={loading}>
              {loading ? "Creating..." : "Add Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
