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

const KEY_ACCOUNT_THRESHOLD = 1000;

type SortKey =
  | "orderId"
  | "companyName"
  | "primaryContactName"
  | "primaryContactEmail"
  | "primaryContactPhone";

type SortDir = "asc" | "desc";

function fmtMoney(n: number) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(Number(n || 0));
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

export default function KeyAccountsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ClientRecord[]>([]);

  const [sortKey, setSortKey] = useState<SortKey>("companyName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ClientRecord | null>(null);

  const headerCellStyle: React.CSSProperties = {
    padding: "12px 14px",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border-subtle)",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
    textAlign: "left",
  };

  // ✅ TABLE BODY MUST BE REGULAR (NOT BOLD)
  const cellStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderBottom: "1px dashed var(--border-subtle)",
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    fontWeight: 400,
  };

  // stable sorting label (no layout shift)
  const headerLabel = (label: string, badge?: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span>{label}</span>
      <span style={{ width: 14, display: "inline-block", textAlign: "center", opacity: badge ? 1 : 0.35 }}>
        {badge || "•"}
      </span>
    </span>
  );

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/admin/clients/list", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || res.statusText || "Failed to load clients");
        }

        const list: ClientRecord[] = Array.isArray(json?.clients) ? json.clients : [];
        if (!alive) return;
        setRows(list);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Forbidden");
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

  const keyAccountsFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = (rows || []).filter((c) => Number(c?.totalPaidUsd || 0) >= KEY_ACCOUNT_THRESHOLD);

    if (!q) return base;

    return base.filter((c) => {
      const oid = normalizeOrderId(c.orderId);
      const hay = [
        c.companyName,
        c.primaryContactName,
        c.primaryContactEmail,
        c.primaryContactPhone,
        c.orderId,
        oid,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [rows, query]);

  const keyAccountsSorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;

    const getVal = (c: ClientRecord) => {
      switch (sortKey) {
        case "orderId":
          return normalizeOrderId(c.orderId) || "";
        case "companyName":
          return c.companyName || "";
        case "primaryContactName":
          return c.primaryContactName || "";
        case "primaryContactEmail":
          return c.primaryContactEmail || "";
        case "primaryContactPhone":
          return c.primaryContactPhone || "";
        default:
          return "";
      }
    };

    const arr = [...keyAccountsFiltered];
    arr.sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);

      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });

    return arr;
  }, [keyAccountsFiltered, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir("asc");
    }
  }

  const sortBadge = (k: SortKey) => (k !== sortKey ? "" : sortDir === "asc" ? "▲" : "▼");

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
      <h1 className="page-title">Key Accounts</h1>

      <div className="page-subtitle" style={{ marginBottom: 18 }}>
        High-value clients (revenue-based). Key Account = <b>Total Paid ≥ $1,000</b>.
      </div>

      <div
        className="card"
        style={{
          marginBottom: 16,
          padding: 14,
          borderRadius: 16,
          background: "var(--surface-card)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-md)",
          display: "grid",
          gridTemplateColumns: "minmax(220px, 1.3fr) repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          alignItems: "center",
        }}
      >
        <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search keyword" />
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {loading ? "Loading..." : `${keyAccountsSorted.length} key account(s)`}
        </div>
      </div>

      <div className="table-shell">
        <div>
        {loading ? (
          <p style={{ fontSize: 14, color: "var(--text-muted)" }}>
            Loading key accounts...
          </p>
        ) : error ? (
          <p style={{ fontSize: 14, color: "#FCA5A5" }}>{error}</p>
        ) : keyAccountsSorted.length === 0 ? (
          <p style={{ fontSize: 14, color: "var(--text-muted)" }}>
            No key accounts found.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={headerCellStyle} onClick={() => toggleSort("orderId")}>
                    {headerLabel("Order ID", sortBadge("orderId"))}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("companyName")}>
                    {headerLabel("Company", sortBadge("companyName"))}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("primaryContactName")}>
                    {headerLabel("Contact", sortBadge("primaryContactName"))}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("primaryContactEmail")}>
                    {headerLabel("Email", sortBadge("primaryContactEmail"))}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("primaryContactPhone")}>
                    {headerLabel("Phone", sortBadge("primaryContactPhone"))}
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "center", cursor: "default" }}>
                    {headerLabel("Action")}
                  </th>
                </tr>
              </thead>

              <tbody>
                {keyAccountsSorted.map((c) => {
                  return (
                    <tr key={c.id} onClick={() => openDrawer(c)} title="View details">
                      <td style={cellStyle}>{normalizeOrderId(c.orderId) || "-"}</td>
                      <td style={{ ...cellStyle, whiteSpace: "normal" }}>{c.companyName || "-"}</td>
                      <td style={cellStyle}>{c.primaryContactName || "-"}</td>
                      <td style={cellStyle}>{c.primaryContactEmail || "-"}</td>
                      <td style={cellStyle}>{c.primaryContactPhone || "-"}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        <div style={{ display: "flex", justifyContent: "center" }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openDrawer(c);
                            }}
                            className="btn ghost"
                            style={{ padding: "8px 14px", borderRadius: 999, fontWeight: 500 }}
                          >
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </div>

      {drawerOpen && selected && (
        <div className="drawer-overlay" onClick={closeDrawer}>
          <div className="drawer-panel drawer-panel--sm" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text-primary)" }}>
                  {selected.companyName}
                </div>
                <div style={{ opacity: 0.75, fontSize: 12, color: "var(--text-muted)" }}>
                  {selected.primaryContactName} · {selected.primaryContactEmail}
                </div>
              </div>

              <button className="btn ghost" onClick={closeDrawer} style={{ height: 34, borderRadius: 999 }}>
                Close
              </button>
            </div>

            <div style={{ height: 14 }} />

            <Section title="Company">
              <Row label="Order ID" value={normalizeOrderId(selected.orderId) || "-"} />
              <Row label="Website" value={selected.website || "-"} />
              <Row label="Industry" value={selected.industry || "-"} />
              <Row label="Country" value={selected.country || "-"} />
              <Row label="Timezone" value={selected.timezone || "-"} />
            </Section>

            <div style={{ height: 12 }} />

            <Section title="Contact">
              <Row label="Name" value={selected.primaryContactName || "-"} />
              <Row label="Title" value={selected.primaryContactTitle || "-"} />
              <Row label="Email" value={selected.primaryContactEmail || "-"} />
              <Row label="Phone" value={selected.primaryContactPhone || "-"} />
            </Section>

            <div style={{ height: 12 }} />

            <Section title="Finance">
              <Row label="Payment Status" value={selected.paymentStatus || "-"} />
              <Row label="Total Paid (USD)" value={fmtMoney(Number(selected.totalPaidUsd || 0))} />
              <Row label="Created" value={fmtDate(selected.createdAt)} />
              <Row label="Last Activity" value={fmtDate(selected.lastActivity)} />
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 14,
        borderRadius: 14,
        background: "var(--surface-muted)",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.06em", opacity: 0.75 }}>{title}</div>
      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 12,
        border: "1px solid var(--border-subtle)",
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
