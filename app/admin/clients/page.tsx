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

type SortKey =
  | "orderId"
  | "companyName"
  | "primaryContactName"
  | "primaryContactEmail"
  | "primaryContactPhone"
  | "paymentStatus"
  | "totalPaidUsd"
  | "createdAt";

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

export default function ClientsPage() {
  const router = useRouter();
  const [isDark, setIsDark] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ClientRecord[]>([]);

  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ClientRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // OS-level theme only
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setIsDark(!!mql.matches);
    onChange();
    // @ts-expect-error older browsers
    mql.addEventListener ? mql.addEventListener("change", onChange) : mql.addListener(onChange);
    return () => {
      // @ts-expect-error older browsers
      mql.removeEventListener ? mql.removeEventListener("change", onChange) : mql.removeListener(onChange);
    };
  }, []);

  // Load Clients from API
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows || [];

    return (rows || []).filter((c) => {
      const oid = normalizeOrderId(c.orderId);
      const hay = [
        c.companyName,
        c.primaryContactName,
        c.primaryContactEmail,
        c.primaryContactPhone,
        c.paymentStatus,
        c.orderId,
        oid,
        String(c.totalPaidUsd ?? ""),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [rows, query]);

  const sorted = useMemo(() => {
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
        case "paymentStatus":
          return c.paymentStatus || "";
        case "totalPaidUsd":
          return Number(c.totalPaidUsd || 0);
        case "createdAt":
          return c.createdAt || "";
        default:
          return "";
      }
    };

    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);

      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });

    return arr;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "totalPaidUsd" ? "desc" : "asc");
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

  async function handleDelete(id: string) {
    const confirmed = window.confirm("Delete this client? This will archive the record for now.");
    if (!confirmed) return;

    try {
      setDeletingId(id);
      const res = await fetch("/api/admin/clients/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to delete client");

      setRows((prev) => prev.filter((c) => c.id !== id));
      if (selected?.id === id) {
        setSelected(null);
        setDrawerOpen(false);
      }
    } catch (e: any) {
      alert(e?.message || "Failed to delete client");
    } finally {
      setDeletingId((prev) => (prev === id ? null : prev));
    }
  }

  // Key-Accounts master table shell
  const tableShellStyle: React.CSSProperties = {
    borderRadius: 20,
    padding: 12,
    border: isDark ? "1px solid rgba(148,163,184,0.28)" : "1px solid rgba(15,23,42,0.10)",
    background: isDark ? "rgba(38,38,38,0.55)" : "rgba(255,255,255,0.85)",
    boxShadow: isDark ? "0 20px 60px rgba(0,0,0,0.55)" : "0 18px 55px rgba(15,23,42,0.10)",
  };

  const headerCellStyle: React.CSSProperties = {
    padding: "12px 14px",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: isDark ? "rgba(226,232,240,0.70)" : "rgba(15,23,42,0.55)",
    borderBottom: isDark ? "1px solid rgba(148,163,184,0.25)" : "1px solid rgba(15,23,42,0.10)",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  };

  const cellStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderBottom: isDark ? "1px dashed rgba(148,163,184,0.22)" : "1px dashed rgba(15,23,42,0.10)",
    color: isDark ? "rgba(226,232,240,0.88)" : "rgba(15,23,42,0.85)",
    whiteSpace: "nowrap",
    fontWeight: 400, // IMPORTANT: body text regular (not bold)
  };

  const headerLabel = (label: string, badge?: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span>{label}</span>
      {/* reserve space so sorting doesn't shift layout */}
      <span style={{ width: 14, display: "inline-block", textAlign: "center", opacity: badge ? 1 : 0.35 }}>
        {badge || "•"}
      </span>
    </span>
  );

  return (
    <div style={{ width: "100%" }}>
      <h1
        style={{
          fontSize: 34,
          fontWeight: 900,
          marginBottom: 8,
          color: isDark ? "rgba(255,255,255,0.95)" : "rgba(15,23,42,0.95)",
        }}
      >
        All Clients
      </h1>

      <div style={{ marginBottom: 18, color: isDark ? "rgba(255,255,255,0.75)" : "rgba(15,23,42,0.65)" }}>
        Track leads and clients — pipeline, payments, ownership, retainers — in one control panel.
      </div>

      <div style={{ marginBottom: 16, maxWidth: 360, display: "flex", alignItems: "center", gap: 12 }}>
        <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search keyword" />
        <div style={{ fontSize: 12, color: isDark ? "rgba(226,232,240,0.75)" : "rgba(15,23,42,0.65)" }}>
          {loading ? "Loading..." : `${sorted.length} client(s)`}
        </div>
      </div>

      <div style={tableShellStyle}>
        {loading ? (
          <p style={{ fontSize: 14, color: isDark ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.70)" }}>
            Loading clients...
          </p>
        ) : error ? (
          <p style={{ fontSize: 14, color: "#FCA5A5" }}>{error}</p>
        ) : sorted.length === 0 ? (
          <p style={{ fontSize: 14, color: isDark ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.70)" }}>
            No clients found.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 1080 }}>
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
                  <th style={headerCellStyle} onClick={() => toggleSort("paymentStatus")}>
                    {headerLabel("Payment", sortBadge("paymentStatus"))}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("totalPaidUsd")}>
                    {headerLabel("Total Paid", sortBadge("totalPaidUsd"))}
                  </th>
                  <th style={headerCellStyle} onClick={() => toggleSort("createdAt")}>
                    {headerLabel("Created", sortBadge("createdAt"))}
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: "right", cursor: "default" }}>{headerLabel("Action")}</th>
                </tr>
              </thead>

              <tbody>
                {sorted.map((c, idx) => {
                  const rowBg = isDark
                    ? idx % 2 === 0
                      ? "rgba(255,255,255,0.02)"
                      : "rgba(255,255,255,0.00)"
                    : idx % 2 === 0
                    ? "rgba(15,23,42,0.015)"
                    : "rgba(15,23,42,0.00)";

                  const hoverBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.03)";

                  return (
                    <tr
                      key={c.id}
                      style={{ background: rowBg, transition: "background 120ms ease", cursor: "pointer" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = hoverBg)}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = rowBg)}
                      onClick={() => openDrawer(c)}
                    >
                      <td style={cellStyle}>{normalizeOrderId(c.orderId) || "-"}</td>
                      <td style={{ ...cellStyle, whiteSpace: "normal" }}>{c.companyName || "-"}</td>
                      <td style={cellStyle}>{c.primaryContactName || "-"}</td>
                      <td style={cellStyle}>{c.primaryContactEmail || "-"}</td>
                      <td style={cellStyle}>{c.primaryContactPhone || "-"}</td>
                      <td style={cellStyle}>{(c.paymentStatus as string) || "-"}</td>
                      <td style={cellStyle}>{fmtMoney(Number(c.totalPaidUsd || 0))}</td>
                      <td style={cellStyle}>{fmtDate(c.createdAt)}</td>
                      <td style={{ ...cellStyle, textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 8 }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openDrawer(c);
                            }}
                            className="btn ghost"
                            style={{ padding: "8px 14px", borderRadius: 999, fontWeight: 800 }}
                          >
                            View
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/admin/clients/${c.id}/edit`);
                            }}
                            className="btn ghost"
                            style={{ padding: "8px 14px", borderRadius: 999, fontWeight: 800 }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(c.id);
                            }}
                            className="btn ghost"
                            disabled={deletingId === c.id}
                            style={{
                              padding: "8px 14px",
                              borderRadius: 999,
                              fontWeight: 800,
                              opacity: deletingId === c.id ? 0.7 : 1,
                            }}
                          >
                            {deletingId === c.id ? "Deleting..." : "Delete"}
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

      {/* Drawer (Key-Accounts master style) */}
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
              background: isDark ? "rgba(18,18,18,0.96)" : "rgba(255,255,255,0.96)",
              borderLeft: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, color: isDark ? "#fff" : "#0f172a" }}>
                  {selected.companyName}
                </div>
                <div style={{ opacity: 0.75, fontSize: 12, color: isDark ? "rgba(255,255,255,0.75)" : "#334155" }}>
                  {selected.primaryContactName} · {selected.primaryContactEmail}
                </div>
              </div>

              <button className="btn ghost" onClick={closeDrawer} style={{ height: 34, borderRadius: 999 }}>
                Close
              </button>
            </div>

            <div style={{ height: 14 }} />

            <Section title="Company" isDark={isDark}>
              <Row label="Order ID" value={normalizeOrderId(selected.orderId) || "-"} isDark={isDark} />
              <Row label="Website" value={selected.website || "-"} isDark={isDark} />
              <Row label="Industry" value={selected.industry || "-"} isDark={isDark} />
              <Row label="Country" value={selected.country || "-"} isDark={isDark} />
              <Row label="Timezone" value={selected.timezone || "-"} isDark={isDark} />
            </Section>

            <div style={{ height: 12 }} />

            <Section title="Contact" isDark={isDark}>
              <Row label="Name" value={selected.primaryContactName || "-"} isDark={isDark} />
              <Row label="Title" value={selected.primaryContactTitle || "-"} isDark={isDark} />
              <Row label="Email" value={selected.primaryContactEmail || "-"} isDark={isDark} />
              <Row label="Phone" value={selected.primaryContactPhone || "-"} isDark={isDark} />
            </Section>

            <div style={{ height: 12 }} />

            <Section title="Finance" isDark={isDark}>
              <Row label="Payment Status" value={(selected.paymentStatus as string) || "-"} isDark={isDark} />
              <Row label="Total Paid (USD)" value={fmtMoney(Number(selected.totalPaidUsd || 0))} isDark={isDark} />
              <Row label="Created" value={fmtDate(selected.createdAt)} isDark={isDark} />
              <Row label="Last Activity" value={fmtDate(selected.lastActivity)} isDark={isDark} />
            </Section>

            <div style={{ height: 12 }} />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                className="btn"
                style={{ borderRadius: 12, fontWeight: 800 }}
                onClick={() => router.push(`/admin/clients/${selected.id}/edit`)}
              >
                Edit Client
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={deletingId === selected.id}
                onClick={() => handleDelete(selected.id)}
                style={{
                  borderRadius: 12,
                  fontWeight: 800,
                  background: isDark ? "rgba(239,68,68,0.12)" : "rgba(239,68,68,0.10)",
                  border: "1px solid rgba(239,68,68,0.35)",
                  color: isDark ? "rgba(255,255,255,0.92)" : "rgba(15,23,42,0.86)",
                  opacity: deletingId === selected.id ? 0.7 : 1,
                }}
              >
                {deletingId === selected.id ? "Deleting..." : "Delete Client"}
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
  children: React.ReactNode;
  isDark: boolean;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 14,
        borderRadius: 14,
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
