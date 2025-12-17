"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

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

const KEY_ACCOUNT_THRESHOLD = 1000;

function fmtMoney(n: number) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `$ ${Number(n || 0).toLocaleString()}`;
  }
}

function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US");
}

// Force branding: Order IDs must present as LC-0001... even if legacy data contains ORD-0001
function normalizeOrderId(orderId?: string) {
  const v = (orderId || "").trim();
  if (!v) return "";
  const up = v.toUpperCase();

  if (up.startsWith("LC-")) return up;
  if (up.startsWith("ORD-")) return `LC-${up.slice(4)}`;

  // If someone stored only digits like "12" or "00012", normalize to LC-0012-ish
  const digits = up.replace(/\D/g, "");
  if (digits) return `LC-${digits.padStart(4, "0")}`;

  // Fallback: still brand it
  return `LC-${up}`;
}

/**
 * Your ERP uses ThemeProvider class toggling, not OS theme.
 * So dark mode must read <html class="dark"> (or similar).
 */
function useIsDarkMode() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;

    const read = () => {
      setIsDark(root.classList.contains("dark"));
    };

    read();

    const obs = new MutationObserver(() => read());
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });

    return () => obs.disconnect();
  }, []);

  return isDark;
}

export default function KeyAccountsPage() {
  const isDark = useIsDarkMode();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ClientRecord[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ClientRecord | null>(null);

  // Same table surface rules you already approved globally
  const tableShellStyle: CSSProperties = {
    background: isDark ? "rgba(20, 20, 20, 0.65)" : "rgba(255, 255, 255, 0.9)",
    border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
    borderRadius: 16,
    boxShadow: isDark ? "0 10px 30px rgba(0,0,0,0.45)" : "0 10px 30px rgba(15,23,42,0.08)",
  };

  const inputStyle: CSSProperties = {
    width: "100%",
    maxWidth: 360,
    padding: "12px 14px",
    borderRadius: 12,
    outline: "none",
    background: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.95)",
    color: isDark ? "rgba(255,255,255,0.92)" : "rgba(15,23,42,0.92)",
    border: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
  };

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/admin/clients/list", {
          method: "GET",
          cache: "no-store",
        });

        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to load clients");
        }

        const list: ClientRecord[] = Array.isArray(json?.clients) ? json.clients : [];

        if (!alive) return;
        setRows(list);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Failed to load clients");
        setRows([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  const keyAccounts = useMemo(() => {
    const q = query.trim().toLowerCase();

    const base = (rows || []).filter((c) => Number(c?.totalPaidUsd || 0) >= KEY_ACCOUNT_THRESHOLD);

    if (!q) return base;

    return base.filter((c) => {
      const orderIdLc = normalizeOrderId(c.orderId);
      const hay = [
        c.companyName,
        c.primaryContactName,
        c.primaryContactEmail,
        c.primaryContactPhone,
        c.orderId,
        orderIdLc,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [rows, query]);

  function openDrawer(c: ClientRecord) {
    setSelected(c);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSelected(null);
  }

  return (
    <div style={{ width: "100%" }}>
      <h1
        style={{
          fontSize: 34,
          fontWeight: 800,
          marginBottom: 8,
          color: isDark ? "rgba(255,255,255,0.95)" : "rgba(15,23,42,0.95)",
        }}
      >
        Key Accounts
      </h1>

      <div
        style={{
          marginBottom: 18,
          color: isDark ? "rgba(255,255,255,0.75)" : "rgba(15,23,42,0.65)",
        }}
      >
        High-value clients (revenue-based). Key Account = <b>Total Paid ≥ $1,000</b>.
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search keyword"
          style={inputStyle}
        />
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          {loading ? "Loading..." : `${keyAccounts.length} key account(s)`}
        </div>
      </div>

      <div style={{ ...tableShellStyle, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
            <thead>
              <tr
                style={{
                  background: isDark ? "rgba(255,255,255,0.03)" : "rgba(15,23,42,0.03)",
                }}
              >
                {[
                  "ORDER ID",
                  "COMPANY",
                  "CONTACT",
                  "EMAIL",
                  "PHONE",
                  "PAYMENT",
                  "TOTAL PAID",
                  "CREATED",
                  "ACTION",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      fontSize: 11,
                      letterSpacing: "0.06em",
                      padding: "14px 16px",
                      color: isDark ? "rgba(255,255,255,0.55)" : "rgba(15,23,42,0.55)",
                      borderBottom: isDark
                        ? "1px solid rgba(255,255,255,0.08)"
                        : "1px solid rgba(15,23,42,0.08)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {error && (
                <tr>
                  <td colSpan={9} style={{ padding: 16, color: "rgba(239,68,68,0.9)" }}>
                    {error}
                  </td>
                </tr>
              )}

              {!error && loading && (
                <tr>
                  <td colSpan={9} style={{ padding: 16, opacity: 0.7 }}>
                    Loading key accounts...
                  </td>
                </tr>
              )}

              {!error && !loading && keyAccounts.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    style={{
                      padding: 16,
                      color: isDark ? "rgba(255,255,255,0.70)" : "rgba(15,23,42,0.65)",
                    }}
                  >
                    No key accounts found (Total Paid ≥ $1,000).
                  </td>
                </tr>
              )}

              {!error &&
                !loading &&
                keyAccounts.map((c) => {
                  const orderIdLc = normalizeOrderId(c.orderId) || "-";

                  return (
                    <tr
                      key={c.id}
                      style={{
                        borderBottom: isDark
                          ? "1px dashed rgba(255,255,255,0.08)"
                          : "1px dashed rgba(15,23,42,0.08)",
                      }}
                    >
                      <td style={{ padding: "14px 16px", whiteSpace: "nowrap" }}>{orderIdLc}</td>
                      <td style={{ padding: "14px 16px", fontWeight: 700 }}>{c.companyName || "-"}</td>
                      <td style={{ padding: "14px 16px" }}>{c.primaryContactName || "-"}</td>
                      <td style={{ padding: "14px 16px" }}>{c.primaryContactEmail || "-"}</td>
                      <td style={{ padding: "14px 16px" }}>{c.primaryContactPhone || "-"}</td>
                      <td style={{ padding: "14px 16px", whiteSpace: "nowrap" }}>
                        {c.paymentStatus || "-"}
                      </td>
                      <td style={{ padding: "14px 16px", whiteSpace: "nowrap", fontWeight: 700 }}>
                        {fmtMoney(Number(c.totalPaidUsd || 0))}
                      </td>
                      <td style={{ padding: "14px 16px", whiteSpace: "nowrap" }}>{fmtDate(c.createdAt)}</td>
                      <td style={{ padding: "14px 16px" }}>
                        <button
                          onClick={() => openDrawer(c)}
                          style={{
                            padding: "8px 14px",
                            borderRadius: 999,
                            background: "transparent",
                            cursor: "pointer",
                            border: isDark
                              ? "1px solid rgba(255,255,255,0.22)"
                              : "1px solid rgba(15,23,42,0.22)",
                            color: isDark ? "rgba(255,255,255,0.88)" : "rgba(15,23,42,0.88)",
                            fontWeight: 700,
                          }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer (matches your Users/All Clients pattern: blurred overlay + right panel) */}
      {drawerOpen && selected && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: isDark ? "rgba(0,0,0,0.55)" : "rgba(15,23,42,0.35)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
          onClick={closeDrawer}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: "min(460px, 92vw)",
              height: "100%",
              padding: 18,
              background: isDark ? "rgba(12,12,12,0.92)" : "rgba(255,255,255,0.96)",
              borderLeft: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900 }}>{selected.companyName}</div>
                <div style={{ opacity: 0.75, fontSize: 12 }}>
                  {selected.primaryContactName} · {selected.primaryContactEmail}
                </div>
              </div>

              <button
                onClick={closeDrawer}
                style={{
                  height: 34,
                  padding: "0 14px",
                  borderRadius: 999,
                  background: "transparent",
                  cursor: "pointer",
                  border: isDark ? "1px solid rgba(255,255,255,0.20)" : "1px solid rgba(15,23,42,0.20)",
                }}
              >
                Close
              </button>
            </div>

            <div style={{ height: 14 }} />

            <div
              style={{
                padding: 14,
                borderRadius: 14,
                border: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
                background: isDark ? "rgba(255,255,255,0.03)" : "rgba(15,23,42,0.03)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.06em", opacity: 0.75 }}>
                SUMMARY
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                {[
                  ["Sales Stage", selected.salesStage || "-"],
                  ["Payment Status", selected.paymentStatus || "-"],
                  ["Retainer Status", selected.retainerStatus || "-"],
                  ["Total Paid (USD)", fmtMoney(Number(selected.totalPaidUsd || 0))],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
                    }}
                  >
                    <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 800 }}>{k}</div>
                    <div style={{ marginTop: 4, fontWeight: 800 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ height: 14 }} />

            <Section title="COMPANY" isDark={isDark}>
              <Row label="Order ID" value={normalizeOrderId(selected.orderId) || "-"} isDark={isDark} />
              <Row label="Company" value={selected.companyName || "-"} isDark={isDark} />
              <Row label="Website" value={selected.website || "-"} isDark={isDark} />
              <Row label="Industry" value={selected.industry || "-"} isDark={isDark} />
              <Row label="Country" value={selected.country || "-"} isDark={isDark} />
              <Row label="Timezone" value={selected.timezone || "-"} isDark={isDark} />
            </Section>

            <div style={{ height: 12 }} />

            <Section title="CONTACT" isDark={isDark}>
              <Row label="Contact" value={selected.primaryContactName || "-"} isDark={isDark} />
              <Row label="Title" value={selected.primaryContactTitle || "-"} isDark={isDark} />
              <Row label="Email" value={selected.primaryContactEmail || "-"} isDark={isDark} />
              <Row label="Phone" value={selected.primaryContactPhone || "-"} isDark={isDark} />
            </Section>

            <div style={{ height: 12 }} />

            <Section title="OWNERSHIP" isDark={isDark}>
              <Row label="Sales Owner" value={selected.salesOwner || "-"} isDark={isDark} />
              <Row label="Assigned to (AM)" value={selected.accountManager || "-"} isDark={isDark} />
              <Row label="Production Owner" value={selected.productionOwner || "-"} isDark={isDark} />
              <Row label="Created" value={fmtDate(selected.createdAt)} isDark={isDark} />
              <Row label="Last Activity" value={fmtDate(selected.lastActivity)} isDark={isDark} />
            </Section>

            <div style={{ height: 14 }} />

            <div style={{ display: "flex", gap: 12 }}>
              <button
                style={{
                  flex: 1,
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "none",
                  background: "#2563eb",
                  color: "white",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
                onClick={() => {
                  alert("Edit flow: wire to your Edit Client route.");
                }}
              >
                Edit Client
              </button>

              <button
                style={{
                  flex: 1,
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: "transparent",
                  border: "1px solid rgba(239,68,68,0.55)",
                  color: isDark ? "rgba(255,255,255,0.88)" : "rgba(15,23,42,0.88)",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
                onClick={() => alert("Archive flow: wire to archive endpoint later.")}
              >
                Archive
              </button>
            </div>
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
  children: ReactNode;
  isDark: boolean;
}) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 14,
        border: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
        background: isDark ? "rgba(255,255,255,0.02)" : "rgba(15,23,42,0.02)",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.06em", opacity: 0.75 }}>{title}</div>
      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>{children}</div>
    </div>
  );
}

function Row({ label, value, isDark }: { label: string; value: string; isDark: boolean }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 12,
        border: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 900 }}>{label}</div>
      <div style={{ fontWeight: 800, textAlign: "right" }}>{value}</div>
    </div>
  );
}
