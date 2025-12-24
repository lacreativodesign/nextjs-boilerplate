"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

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

export default function EditClientPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ? String(params.id) : "";
  const isDark = useIsDarkMode();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [timezone, setTimezone] = useState("");

  const [primaryContactName, setPrimaryContactName] = useState("");
  const [primaryContactTitle, setPrimaryContactTitle] = useState("");
  const [primaryContactEmail, setPrimaryContactEmail] = useState("");
  const [primaryContactPhone, setPrimaryContactPhone] = useState("");
  const [initialEmail, setInitialEmail] = useState("");

  const [salesOwner, setSalesOwner] = useState("");
  const [accountManager, setAccountManager] = useState("");
  const [productionOwner, setProductionOwner] = useState("");

  const [salesStage, setSalesStage] = useState<SalesStage>("New Lead");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("Unpaid");
  const [retainerStatus, setRetainerStatus] = useState<RetainerStatus>("None");

  // ✅ keep value as string so we can avoid number spinner UI entirely
  const [totalPaidUsd, setTotalPaidUsd] = useState<string>("0");

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

  function toMoneyNumber(v: string) {
    const cleaned = (v || "").replace(/[^0-9.]/g, "");
    const n = Number(cleaned || 0);
    if (!Number.isFinite(n)) return 0;
    return n;
  }

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!id) return;
      setLoading(true);
      setError(null);
      setSuccess(null);

      try {
        const res = await fetch(`/api/admin/clients/get?id=${encodeURIComponent(id)}`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load client");

        if (!alive) return;
        const c = json.client || {};

        setCompanyName(String(c.companyName || ""));
        setWebsite(String(c.website || ""));
        setIndustry(String(c.industry || ""));
        setCountry(String(c.country || ""));
        setTimezone(String(c.timezone || ""));

        setPrimaryContactName(String(c.primaryContactName || ""));
        setPrimaryContactTitle(String(c.primaryContactTitle || ""));
        const email = String(c.primaryContactEmail || "");
        setPrimaryContactEmail(email);
        setInitialEmail(email);
        setPrimaryContactPhone(String(c.primaryContactPhone || ""));

        setSalesOwner(String(c.salesOwner || ""));
        setAccountManager(String(c.accountManager || ""));
        setProductionOwner(String(c.productionOwner || ""));

        setSalesStage((c.salesStage as SalesStage) || "New Lead");
        setPaymentStatus((c.paymentStatus as PaymentStatus) || "Unpaid");
        setRetainerStatus((c.retainerStatus as RetainerStatus) || "None");

        setTotalPaidUsd(String(Number(c.totalPaidUsd ?? 0)));
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Failed to load client");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [id]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!id) return setError("Missing client id");
    if (!companyName.trim()) return setError("Company name is required.");
    if (!primaryContactName.trim()) return setError("Primary contact name is required.");

    const emailToSend = (primaryContactEmail || initialEmail).trim();
    if (!emailToSend) return setError("Primary contact email is required.");

    setSaving(true);
    try {
      const payload = {
        id,
        companyName: companyName.trim(),
        website: website.trim() || undefined,
        industry: industry.trim() || undefined,
        country: country.trim() || undefined,
        timezone: timezone.trim() || undefined,

        primaryContactName: primaryContactName.trim(),
        primaryContactTitle: primaryContactTitle.trim() || undefined,
        primaryContactEmail: emailToSend,
        primaryContactPhone: primaryContactPhone.trim() || undefined,

        salesOwner: salesOwner.trim() || undefined,
        accountManager: accountManager.trim() || undefined,
        productionOwner: productionOwner.trim() || undefined,

        salesStage,
        paymentStatus,
        retainerStatus,

        totalPaidUsd: toMoneyNumber(totalPaidUsd),
      };

      const res = await fetch("/api/admin/clients/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to update client");
      }

      setSuccess("Client updated successfully.");
    } catch (err: any) {
      setError(err?.message || "Failed to update client");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ color: isDark ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.70)" }}>Loading...</div>;
  }

  return (
    <div style={styles.fullWidthWrap}>
      <h1 style={styles.pageTitle}>Edit Client</h1>
      <div style={styles.pageSub}>Update client details and keep pipeline, payments and ownership aligned.</div>

      <div style={styles.formShell}>
        {error ? <div style={styles.errorText}>{error}</div> : null}
        {success ? <div style={styles.okText}>{success}</div> : <div style={styles.okText} />}

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
                {/* ✅ spinner removed: use text input + numeric keyboard */}
                <input
                  className="input"
                  inputMode="decimal"
                  pattern="^[0-9]*[.]?[0-9]*$"
                  value={totalPaidUsd}
                  onChange={(e) => setTotalPaidUsd(e.target.value)}
                  placeholder="0"
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

          <div style={styles.actions}>
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
