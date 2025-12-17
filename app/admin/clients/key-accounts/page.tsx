"use client";

import React, { useEffect, useMemo, useState } from "react";

type Client = {
  id: string;
  companyName?: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  industry?: string;
  country?: string;
  timezone?: string;

  salesStage?: string;
  paymentStatus?: string;
  retainerStatus?: string;

  salesOwner?: string;
  accountManager?: string;
  productionOwner?: string;

  totalPaidUsd?: number;

  createdAt?: string;     // or Timestamp string
  lastActivity?: string;  // or Timestamp string
};

const KEY_ACCOUNT_MIN_USD = 1000;

function money(n: any) {
  const num = Number(n || 0);
  return `$ ${num.toLocaleString("en-US")}`;
}

function safeText(v: any) {
  return v === null || v === undefined || v === "" ? "—" : String(v);
}

function dateText(v: any) {
  if (!v) return "—";
  // Handles ISO strings & simple date strings
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-US");
}

export default function KeyAccountsPage() {
  const [search, setSearch] = useState("");
  const [clients, setClients] = useState<Client[]>([]); // IMPORTANT: default []
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<Client | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [isDark, setIsDark] = useState(false);

  // Match your existing theme toggling logic (class="dark" on html/body)
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // LIVE fetch (falls back safely to empty [])
  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/admin/clients/list", { cache: "no-store" });
        const json = await res.json();

        if (!mounted) return;

        if (json?.ok && Array.isArray(json.clients)) {
          setClients(json.clients);
        } else {
          // Safe fallback (no crash)
          setClients([]);
        }
      } catch (e) {
        setClients([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const keyAccounts = useMemo(() => {
    const list = Array.isArray(clients) ? clients : [];

    const filtered = list.filter((c) => Number(c.totalPaidUsd || 0) >= KEY_ACCOUNT_MIN_USD);

    const q = search.trim().toLowerCase();
    if (!q) return filtered;

    return filtered.filter((c) => {
      const blob = [
        c.companyName,
        c.ownerName,
        c.ownerEmail,
        c.ownerPhone,
        c.paymentStatus,
        c.salesStage,
        c.retainerStatus,
        c.country,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [clients, search]);

  function openDrawer(client: Client) {
    setSelected(client);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSelected(null);
  }

  const cardBg = isDark ? "rgba(17, 24, 39, 0.72)" : "rgba(255, 255, 255, 0.9)";
  const tableSurface = isDark ? "rgba(31, 41, 55, 0.55)" : "#ffffff";
  const tableBorder = isDark ? "rgba(59, 130, 246, 0.20)" : "rgba(59, 130, 246, 0.18)";
  const textMuted = isDark ? "rgba(229, 231, 235, 0.70)" : "rgba(17, 24, 39, 0.55)";
  const inputBg = isDark ? "rgba(17, 24, 39, 0.75)" : "rgba(255, 255, 255, 0.95)";
  const inputBorder = isDark ? "rgba(148, 163, 184, 0.25)" : "rgba(148, 163, 184, 0.35)";

  return (
    <div style={{ padding: "18px 22px 28px" }}>
      <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 6 }}>Key Accounts</h1>
      <div style={{ color: textMuted, marginBottom: 18 }}>
        High-value clients (revenue-based). Key Account = <b>Total Paid ≥ ${KEY_ACCOUNT_MIN_USD.toLocaleString("en-US")}</b>.
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search keyword"
          style={{
            width: 360,
            maxWidth: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            outline: "none",
            background: inputBg,
            border: `1px solid ${inputBorder}`,
            color: isDark ? "rgba(255,255,255,0.92)" : "rgba(17,24,39,0.9)",
          }}
        />
        <div style={{ color: textMuted, fontSize: 13 }}>
          {loading ? "Loading…" : `${keyAccounts.length} key account(s)`}
        </div>
      </div>

      {/* TABLE CARD (match your locked style) */}
      <div
        style={{
          background: tableSurface,
          border: `1px solid ${tableBorder}`,
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: isDark ? "0 20px 60px rgba(0,0,0,0.45)" : "0 18px 50px rgba(15,23,42,0.08)",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
            <thead>
              <tr
                style={{
                  background: isDark ? "rgba(17,24,39,0.55)" : "rgba(248,250,252,0.9)",
                }}
              >
                {["COMPANY", "CONTACT", "EMAIL", "PHONE", "PAYMENT", "TOTAL PAID", "CREATED", "ACTION"].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "14px 16px",
                        fontSize: 12,
                        letterSpacing: "0.04em",
                        color: isDark ? "rgba(255,255,255,0.75)" : "rgba(17,24,39,0.55)",
                        borderBottom: `1px solid ${isDark ? "rgba(148,163,184,0.14)" : "rgba(226,232,240,0.8)"}`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>

            <tbody>
              {!loading && keyAccounts.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 18, color: textMuted }}>
                    No key accounts found (Total Paid ≥ ${KEY_ACCOUNT_MIN_USD.toLocaleString("en-US")}).
                  </td>
                </tr>
              ) : (
                keyAccounts.map((c) => (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: `1px dashed ${isDark ? "rgba(148,163,184,0.18)" : "rgba(226,232,240,0.9)"}`,
                    }}
                  >
                    <td style={{ padding: "14px 16px", fontWeight: 700 }}>
                      {safeText(c.companyName)}
                    </td>
                    <td style={{ padding: "14px 16px" }}>{safeText(c.ownerName)}</td>
                    <td style={{ padding: "14px 16px" }}>{safeText(c.ownerEmail)}</td>
                    <td style={{ padding: "14px 16px" }}>{safeText(c.ownerPhone)}</td>
                    <td style={{ padding: "14px 16px" }}>{safeText(c.paymentStatus)}</td>
                    <td style={{ padding: "14px 16px", fontWeight: 700 }}>
                      {money(c.totalPaidUsd)}
                    </td>
                    <td style={{ padding: "14px 16px" }}>{dateText(c.createdAt)}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <button
                        onClick={() => openDrawer(c)}
                        style={{
                          padding: "7px 14px",
                          borderRadius: 999,
                          border: `1px solid ${isDark ? "rgba(148,163,184,0.35)" : "rgba(148,163,184,0.45)"}`,
                          background: isDark ? "rgba(15,23,42,0.35)" : "rgba(255,255,255,0.9)",
                          color: isDark ? "rgba(255,255,255,0.9)" : "rgba(17,24,39,0.85)",
                          cursor: "pointer",
                          fontWeight: 700,
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DRAWER (same pattern as Users/Clients locked UI) */}
      {drawerOpen && (
        <div
          onClick={closeDrawer}
          style={{
            position: "fixed",
            inset: 0,
            background: isDark ? "rgba(0,0,0,0.55)" : "rgba(15,23,42,0.35)",
            backdropFilter: "blur(10px)",
            zIndex: 999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              height: "100%",
              width: "420px",
              maxWidth: "92vw",
              background: cardBg,
              borderLeft: `1px solid ${isDark ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.22)"}`,
              padding: 16,
              overflow: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900 }}>{safeText(selected?.companyName)}</div>
                <div style={{ fontSize: 12, color: textMuted }}>
                  {safeText(selected?.ownerName)} · {safeText(selected?.ownerEmail)}
                </div>
              </div>

              <button
                onClick={closeDrawer}
                style={{
                  height: 34,
                  padding: "0 14px",
                  borderRadius: 999,
                  border: `1px solid ${isDark ? "rgba(148,163,184,0.35)" : "rgba(148,163,184,0.45)"}`,
                  background: "transparent",
                  color: isDark ? "rgba(255,255,255,0.9)" : "rgba(17,24,39,0.85)",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Close
              </button>
            </div>

            <div style={{ height: 12 }} />

            <Section title="Summary" isDark={isDark}>
              <Grid4 isDark={isDark}>
                <MiniCard label="Sales Stage" value={safeText(selected?.salesStage)} isDark={isDark} />
                <MiniCard label="Payment Status" value={safeText(selected?.paymentStatus)} isDark={isDark} />
                <MiniCard label="Retainer Status" value={safeText(selected?.retainerStatus)} isDark={isDark} />
                <MiniCard label="Total Paid (USD)" value={money(selected?.totalPaidUsd)} isDark={isDark} />
              </Grid4>
            </Section>

            <Section title="Company" isDark={isDark}>
              <KeyVal label="Company" value={safeText(selected?.companyName)} isDark={isDark} />
              <KeyVal label="Website" value={safeText((selected as any)?.website)} isDark={isDark} />
              <KeyVal label="Industry" value={safeText(selected?.industry)} isDark={isDark} />
              <KeyVal label="Country" value={safeText(selected?.country)} isDark={isDark} />
              <KeyVal label="Timezone" value={safeText(selected?.timezone)} isDark={isDark} />
            </Section>

            <Section title="Contact" isDark={isDark}>
              <KeyVal label="Contact" value={safeText(selected?.ownerName)} isDark={isDark} />
              <KeyVal label="Email" value={safeText(selected?.ownerEmail)} isDark={isDark} />
              <KeyVal label="Phone" value={safeText(selected?.ownerPhone)} isDark={isDark} />
            </Section>

            <Section title="Ownership" isDark={isDark}>
              <KeyVal label="Sales Owner" value={safeText(selected?.salesOwner)} isDark={isDark} />
              <KeyVal label="Assigned To (AM)" value={safeText(selected?.accountManager)} isDark={isDark} />
              <KeyVal label="Production Owner" value={safeText(selected?.productionOwner)} isDark={isDark} />
              <KeyVal label="Created" value={dateText(selected?.createdAt)} isDark={isDark} />
              <KeyVal label="Last Activity" value={dateText(selected?.lastActivity)} isDark={isDark} />
            </Section>

            <div style={{ height: 14 }} />

            {/* Action buttons (match Clients drawer style you already have) */}
            <div style={{ display: "flex", gap: 12 }}>
              <button
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 12,
                  border: "0",
                  background: "#2563eb",
                  color: "white",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
                onClick={() => {
                  // TODO: route to edit page when available
                  alert("Edit Client (wire me to the edit route next)");
                }}
              >
                Edit Client
              </button>

              <button
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 12,
                  border: `1px solid ${isDark ? "rgba(239,68,68,0.35)" : "rgba(239,68,68,0.35)"}`,
                  background: isDark ? "rgba(127,29,29,0.18)" : "rgba(254,242,242,0.7)",
                  color: isDark ? "rgba(255,255,255,0.9)" : "rgba(127,29,29,0.95)",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
                onClick={() => {
                  alert("Archive (wire logic next)");
                }}
              >
                Archive
              </button>
            </div>

            <div style={{ height: 10 }} />
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
  isDark,
}: {
  title: string;
  children: React.ReactNode;
  isDark: boolean;
}) {
  return (
    <div
      style={{
        marginBottom: 12,
        borderRadius: 14,
        padding: 12,
        border: `1px solid ${isDark ? "rgba(148,163,184,0.16)" : "rgba(148,163,184,0.22)"}`,
        background: isDark ? "rgba(15,23,42,0.35)" : "rgba(255,255,255,0.85)",
      }}
    >
      <div
        style={{
          fontSize: 12,
          letterSpacing: "0.06em",
          fontWeight: 900,
          opacity: isDark ? 0.8 : 0.7,
          marginBottom: 10,
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Grid4({ children, isDark }: { children: React.ReactNode; isDark: boolean }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10,
      }}
    >
      {children}
    </div>
  );
}

function MiniCard({
  label,
  value,
  isDark,
}: {
  label: string;
  value: string;
  isDark: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: 12,
        padding: 12,
        border: `1px solid ${isDark ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.22)"}`,
        background: isDark ? "rgba(0,0,0,0.18)" : "rgba(248,250,252,0.8)",
      }}
    >
      <div style={{ fontSize: 11, opacity: isDark ? 0.75 : 0.6, fontWeight: 800 }}>
        {label}
      </div>
      <div style={{ marginTop: 6, fontSize: 14, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function KeyVal({ label, value, isDark }: { label: string; value: string; isDark: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 14,
        padding: "10px 12px",
        borderRadius: 12,
        border: `1px solid ${isDark ? "rgba(148,163,184,0.16)" : "rgba(148,163,184,0.2)"}`,
        background: isDark ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.7)",
        marginBottom: 8,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 900, opacity: isDark ? 0.75 : 0.6 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, textAlign: "right" }}>{value}</div>
    </div>
  );
}
