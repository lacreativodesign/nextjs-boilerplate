"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";

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

export default function EditClientPage() {
  const router = useRouter();
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

  const [totalContractValueUsd, setTotalContractValueUsd] = useState<string>("0");
  const [totalPaidUsd, setTotalPaidUsd] = useState<string>("0");
  const [openBalanceUsd, setOpenBalanceUsd] = useState<string>("0");
  const [services, setServices] = useState("");

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

    const fullWidthWrap: React.CSSProperties = {
      width: "100%",
      maxWidth: "none",
    };

    const formShell: React.CSSProperties = {
      borderRadius: 20,
      padding: 18,
      border: isDark ? "1px solid rgba(148,163,184,0.28)" : "1px solid rgba(15,23,42,0.10)",
      background: isDark ? "rgba(38,38,38,0.55)" : "rgba(255,255,255,0.85)",
      boxShadow: isDark ? "0 20px 60px rgba(0,0,0,0.55)" : "0 18px 55px rgba(15,23,42,0.10)",
    };

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

    return { pageTitle, pageSub, fullWidthWrap, formShell, sectionCard, sectionTitle, actions, errorText, okText };
  }, [isDark]);

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

        const email = String(c.primaryContactEmail || "");
        setInitialEmail(email);
        setPrimaryContactEmail(email);

        setCompanyName(String(c.companyName || ""));
        setWebsite(String(c.website || ""));
        setIndustry(String(c.industry || ""));
        setCountry(String(c.country || ""));
        setTimezone(String(c.timezone || ""));

        setPrimaryContactName(String(c.primaryContactName || ""));
        setPrimaryContactTitle(String(c.primaryContactTitle || ""));
        setPrimaryContactPhone(String(c.primaryContactPhone || ""));

        setSalesOwner(String(c.salesOwner || ""));
        setAccountManager(String(c.accountManager || ""));
        setProductionOwner(String(c.productionOwner || ""));

        setSalesStage((c.salesStage as SalesStage) || "New Lead");
        setPaymentStatus((c.paymentStatus as PaymentStatus) || "Unpaid");
        setRetainerStatus((c.retainerStatus as RetainerStatus) || "None");

        setTotalContractValueUsd(String(Number(c.totalContractValueUsd ?? 0)));
        setTotalPaidUsd(String(Number(c.totalPaidUsd ?? 0)));
        setOpenBalanceUsd(String(Number(c.openBalanceUsd ?? 0)));
        setServices(String(c.services || ""));
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

  const toNumber = (v: string) => {
    const n = Number(String(v ?? "").replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : 0;
  };

  async function onSave() {
    setError(null);
    setSuccess(null);

    if (!id) {
      setError("Missing client id");
      return;
    }
    if (!companyName.trim()) return setError("Company Name is required");
    if (!primaryContactName.trim()) return setError("Primary Contact Name is required");
    const emailToSend = initialEmail || primaryContactEmail;
    if (!emailToSend.trim()) return setError("Primary Contact Email is required");
    if (!salesOwner.trim()) return setError("Sales Owner is required");

    setSaving(true);
    try {
      const res = await fetch("/api/admin/clients/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id,
          companyName: companyName.trim(),
          website: website.trim(),
          industry: industry.trim(),
          country: country.trim(),
          timezone: timezone.trim(),

          primaryContactName: primaryContactName.trim(),
          primaryContactTitle: primaryContactTitle.trim(),
          primaryContactEmail: emailToSend.trim(), // immutable (server enforces)
          primaryContactPhone: primaryContactPhone.trim(),

          salesStage,
          paymentStatus,
          retainerStatus,

          salesOwner: salesOwner.trim(),
          accountManager: accountManager.trim(),
          productionOwner: productionOwner.trim(),

          totalContractValueUsd: toNumber(totalContractValueUsd),
          totalPaidUsd: toNumber(totalPaidUsd),
          openBalanceUsd: toNumber(openBalanceUsd),
          services: services.trim(),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to update client");

      setSuccess("Client updated");
      router.push("/admin/clients");
    } catch (e: any) {
      setError(e?.message || "Failed to update client");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ color: isDark ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.70)" }}>Loading...</div>;

  return (
    <div style={styles.fullWidthWrap}>
      <h1 style={styles.pageTitle}>Edit Client</h1>
      <div style={styles.pageSub}>Update client details. Primary email stays locked to preserve the 1-email-per-account rule.</div>

      <div style={styles.formShell}>
        {error ? <div style={styles.errorText}>{error}</div> : null}
        {success ? <div style={styles.okText}>{success}</div> : null}

        <div style={{ display: "grid", gap: 14 }}>
          <section style={styles.sectionCard}>
            <div style={styles.sectionTitle}>Company</div>
            <div style={{ display: "grid", gap: 10 }}>
              <Field label="Company Name *">
                <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Inc." />
              </Field>
              <Field label="Website">
                <input className="input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <Field label="Industry">
                  <input className="input" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Technology" />
                </Field>
                <Field label="Country">
                  <input className="input" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Pakistan" />
                </Field>
                <Field label="Timezone">
                  <input className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="GMT+5" />
                </Field>
              </div>
            </div>
          </section>

          <section style={styles.sectionCard}>
            <div style={styles.sectionTitle}>Primary Contact</div>
            <div style={{ display: "grid", gap: 10 }}>
              <Field label="Full Name *">
                <input className="input" value={primaryContactName} onChange={(e) => setPrimaryContactName(e.target.value)} placeholder="Jane Doe" />
              </Field>
              <Field label="Title">
                <input className="input" value={primaryContactTitle} onChange={(e) => setPrimaryContactTitle(e.target.value)} placeholder="CMO" />
              </Field>
              <Field label="Email (locked)">
                <input className="input" value={primaryContactEmail} disabled placeholder="Email cannot be changed" />
              </Field>
              <Field label="Phone">
                <input className="input" value={primaryContactPhone} onChange={(e) => setPrimaryContactPhone(e.target.value)} placeholder="+1 555 0000" />
              </Field>
            </div>
          </section>

          <section style={styles.sectionCard}>
            <div style={styles.sectionTitle}>Pipeline & Ownership</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <Field label="Sales Stage">
                  <select className="input" value={salesStage} onChange={(e) => setSalesStage(e.target.value as SalesStage)}>
                    <option value="New Lead">New Lead</option>
                    <option value="Contacted">Contacted</option>
                    <option value="Qualified">Qualified</option>
                    <option value="Proposal Sent">Proposal Sent</option>
                    <option value="Negotiation">Negotiation</option>
                    <option value="Closed Won">Closed Won</option>
                    <option value="Closed Lost">Closed Lost</option>
                  </select>
                </Field>
                <Field label="Payment Status">
                  <select className="input" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}>
                    <option value="Unpaid">Unpaid</option>
                    <option value="Partially Paid">Partially Paid</option>
                    <option value="Paid">Paid</option>
                    <option value="Refunded">Refunded</option>
                  </select>
                </Field>
                <Field label="Retainer Status">
                  <select className="input" value={retainerStatus} onChange={(e) => setRetainerStatus(e.target.value as RetainerStatus)}>
                    <option value="None">None</option>
                    <option value="Active">Active</option>
                    <option value="Paused">Paused</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </Field>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <Field label="Sales Owner *">
                  <input className="input" value={salesOwner} onChange={(e) => setSalesOwner(e.target.value)} placeholder="Owner name" />
                </Field>
                <Field label="Account Manager">
                  <input className="input" value={accountManager} onChange={(e) => setAccountManager(e.target.value)} placeholder="Account Manager" />
                </Field>
                <Field label="Production Owner">
                  <input className="input" value={productionOwner} onChange={(e) => setProductionOwner(e.target.value)} placeholder="Production Owner" />
                </Field>
              </div>
            </div>
          </section>

          <section style={styles.sectionCard}>
            <div style={styles.sectionTitle}>Finance</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <Field label="Total Contract Value (USD)">
                  <input className="input" value={totalContractValueUsd} onChange={(e) => setTotalContractValueUsd(e.target.value)} placeholder="50000" />
                </Field>
                <Field label="Total Paid (USD)">
                  <input className="input" value={totalPaidUsd} onChange={(e) => setTotalPaidUsd(e.target.value)} placeholder="20000" />
                </Field>
                <Field label="Open Balance (USD)">
                  <input className="input" value={openBalanceUsd} onChange={(e) => setOpenBalanceUsd(e.target.value)} placeholder="30000" />
                </Field>
              </div>
              <Field label="Services / Scope">
                <textarea
                  className="input"
                  rows={3}
                  style={{ resize: "vertical" }}
                  value={services}
                  onChange={(e) => setServices(e.target.value)}
                  placeholder="Campaign, design, production..."
                />
              </Field>
            </div>
          </section>

          <div style={styles.actions}>
            <button className="btn ghost" onClick={() => router.back()} disabled={saving}>
              Cancel
            </button>
            <button className="btn" onClick={onSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 900, opacity: 0.75 }}>{label}</div>
      {children}
    </div>
  );
}
