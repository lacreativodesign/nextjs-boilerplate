"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

type ClientRecord = {
  id: string;
  companyName: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone?: string;
  paymentStatus?: string;
  totalPaidUsd: number;
  orderId?: string;
  createdAt?: string | null;
};

const KEY_ACCOUNT_THRESHOLD = 1000;

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
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n || 0));
}

function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("en-US");
}

// Branding rule: ALWAYS present as LC-0001...
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

  const [sortKey, setSortKey] = useState<SortKey>("totalPaidUsd");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Theme-safe tokens: these should already work in your ERP dark/light
  const surfaceStyle: CSSProperties = {
    background: "var(--card-bg)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    boxShadow: "var(--shadow-md)",
  };

  const inputStyle: CSSProperties = {
    width: "100%",
    maxWidth: 360,
    padding: "12px 14px",
    borderRadius: 12,
    outline: "none",
    background: "var(--input-bg)",
    color: "var(--text)",
    border: "1px solid var(--border)",
  };

  const thStyle: CSSProperties = {
    textAlign: "left",
    fontSize: 11,
    letterSpacing: "0.06em",
    padding: "14px 16px",
    color: "var(--muted)",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap",
    userSelect: "none",
    cursor: "pointer",
  };

  const tdStyle: CSSProperties = {
    padding: "14px 16px",
    borderBottom: "1px dashed var(--border)",
    whiteSpace: "nowrap",
    color: "var(--text)",
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
          credentials: "include", // IMPORTANT for cookie-based auth
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
      setSortDir(k === "totalPaidUsd" ? "desc" : "asc");
    }
  }

  const sortBadge = (k: SortKey) => (k !== sortKey ? "" : sortDir === "asc" ? " ▲" : " ▼");

  return (
    <div style={{ width: "100%" }}>
      <h1 style={{ fontSize: 34, fontWeight: 800, marginBottom: 8, color: "var(--text)" }}>
        Key Accounts
      </h1>

      <div style={{ marginBottom: 18, color: "var(--muted)" }}>
        High-value clients (revenue-based). Key Account = <b>Total Paid ≥ $1,000</b>.
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search keyword"
          style={inputStyle}
        />
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          {loading ? "Loading..." : `${keyAccountsSorted.length} key account(s)`}
        </div>
      </div>

      <div style={{ ...surfaceStyle, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
            <thead>
              <tr style={{ background: "var(--table-head-bg)" }}>
                <th style={thStyle} onClick={() => toggleSort("orderId")}>
                  ORDER ID{sortBadge("orderId")}
                </th>
                <th style={thStyle} onClick={() => toggleSort("companyName")}>
                  COMPANY{sortBadge("companyName")}
                </th>
                <th style={thStyle} onClick={() => toggleSort("primaryContactName")}>
                  CONTACT{sortBadge("primaryContactName")}
                </th>
                <th style={thStyle} onClick={() => toggleSort("primaryContactEmail")}>
                  EMAIL{sortBadge("primaryContactEmail")}
                </th>
                <th style={thStyle} onClick={() => toggleSort("primaryContactPhone")}>
                  PHONE{sortBadge("primaryContactPhone")}
                </th>
                <th style={thStyle} onClick={() => toggleSort("paymentStatus")}>
                  PAYMENT{sortBadge("paymentStatus")}
                </th>
                <th style={thStyle} onClick={() => toggleSort("totalPaidUsd")}>
                  TOTAL PAID{sortBadge("totalPaidUsd")}
                </th>
                <th style={thStyle} onClick={() => toggleSort("createdAt")}>
                  CREATED{sortBadge("createdAt")}
                </th>
                <th style={{ ...thStyle, cursor: "default" }}>ACTION</th>
              </tr>
            </thead>

            <tbody>
              {error && (
                <tr>
                  <td colSpan={9} style={{ padding: 16, color: "var(--danger)" }}>
                    {error}
                  </td>
                </tr>
              )}

              {!error && loading && (
                <tr>
                  <td colSpan={9} style={{ padding: 16, color: "var(--muted)" }}>
                    Loading key accounts...
                  </td>
                </tr>
              )}

              {!error && !loading && keyAccountsSorted.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: 16, color: "var(--muted)" }}>
                    No key accounts found (Total Paid ≥ $1,000).
                  </td>
                </tr>
              )}

              {!error &&
                !loading &&
                keyAccountsSorted.map((c) => (
                  <tr key={c.id}>
                    <td style={tdStyle}>{normalizeOrderId(c.orderId) || "-"}</td>
                    <td style={{ ...tdStyle, fontWeight: 800, whiteSpace: "normal" }}>{c.companyName || "-"}</td>
                    <td style={tdStyle}>{c.primaryContactName || "-"}</td>
                    <td style={tdStyle}>{c.primaryContactEmail || "-"}</td>
                    <td style={tdStyle}>{c.primaryContactPhone || "-"}</td>
                    <td style={tdStyle}>{c.paymentStatus || "-"}</td>
                    <td style={{ ...tdStyle, fontWeight: 800 }}>{fmtMoney(Number(c.totalPaidUsd || 0))}</td>
                    <td style={tdStyle}>{fmtDate(c.createdAt)}</td>
                    <td style={tdStyle}>
                      <button
                        style={{
                          padding: "8px 14px",
                          borderRadius: 999,
                          background: "transparent",
                          cursor: "pointer",
                          border: "1px solid var(--border)",
                          color: "var(--text)",
                          fontWeight: 800,
                        }}
                        onClick={() => alert("View drawer next: wire this to your approved drawer component.")}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
