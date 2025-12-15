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
type DeliveryStatus = "Not Started" | "In Progress" | "Blocked" | "Delivered";
type RetainerStatus = "None" | "Active" | "Paused" | "Cancelled";

type ClientService = {
  name: string;
  type: "One-time" | "Retainer";
  status: DeliveryStatus;
  priceUsd?: number;
  startDate?: string;
  dueDate?: string;
  assignedProduction?: string;
  notes?: string;
};

type ClientRecord = {
  id: string;

  // Table essentials
  companyName: string;
  primaryContactName: string;
  email: string;
  phone: string;

  paymentStatus: PaymentStatus;
  totalPaidUsd: number;

  createdAt: string;

  // Drawer details
  stage: SalesStage;
  openBalanceUsd: number;
  services: ClientService[];

  salesOwner: string;
  accountManager?: string; // only meaningful for paid/partial
  productionOwner?: string;

  lastActivityAt?: string;

  country?: string;
  timezone?: string;

  totalContractValueUsd?: number;
  lastPaymentDate?: string;
  nextFollowUpDate?: string;

  // Retainer controls
  retainerStatus: RetainerStatus;
  retainerPlanName?: string;
  monthlyRetainerUsd?: number;
  billingDay?: number;
  thisMonthPaid?: boolean;
  nextMonthExpectedUsd?: number;
  retainerStartDate?: string;
};

type SortKey =
  | "companyName"
  | "primaryContactName"
  | "email"
  | "phone"
  | "paymentStatus"
  | "totalPaidUsd"
  | "createdAt";

type SortDir = "asc" | "desc";

const formatUSD = (v: any) => {
  const num = Number(v);
  return isNaN(num) ? "-" : `$ ${num.toLocaleString("en-US")}`;
};

const formatDate = (v?: string) => {
  if (!v) return "-";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "-" : d.toLocaleDateString();
};

const isPaidOrPartial = (ps: PaymentStatus) => ps === "Paid" || ps === "Partially Paid";

export default function ClientsPage() {
  const [isDark, setIsDark] = useState(false);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Stop page-level horizontal scroll (fixes right-side background + sidebar mess)
  useEffect(() => {
    const prev = document.body.style.overflowX;
    document.body.style.overflowX = "hidden";
    return () => {
      document.body.style.overflowX = prev;
    };
  }, []);

  // Theme: follow OS
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

  // Dummy data
  const clients: ClientRecord[] = useMemo(
    () => [
      {
        id: "c_001",
        companyName: "ACME Trading LLC",
        primaryContactName: "Bilal Ahmed",
        email: "bilal@acme.com",
        phone: "+1 312 555 0199",
        stage: "Qualified",
        paymentStatus: "Partially Paid",
        totalPaidUsd: 2500,
        openBalanceUsd: 1500,
        services: [
          {
            name: "Website Design",
            type: "One-time",
            status: "In Progress",
            priceUsd: 4000,
            startDate: "2025-12-01",
            dueDate: "2025-12-28",
            assignedProduction: "Ayesha (Prod)",
          },
          {
            name: "SEO Retainer",
            type: "Retainer",
            status: "In Progress",
            assignedProduction: "Hassan (SEO)",
            notes: "Monthly on-page + reporting",
          },
        ],
        salesOwner: "Mansoor (Sales)",
        accountManager: "Sarah (AM)",
        productionOwner: "Ayesha (Prod)",
        createdAt: "2025-12-02",
        lastActivityAt: "2025-12-14",
        country: "United States",
        timezone: "America/Chicago",
        totalContractValueUsd: 5500,
        lastPaymentDate: "2025-12-07",
        nextFollowUpDate: "2025-12-18",
        retainerStatus: "Active",
        retainerPlanName: "SEO Retainer",
        monthlyRetainerUsd: 800,
        billingDay: 1,
        thisMonthPaid: true,
        nextMonthExpectedUsd: 800,
        retainerStartDate: "2025-12-01",
      },
      {
        id: "c_002",
        companyName: "Nova Fitness Studio",
        primaryContactName: "Areeba Khan",
        email: "areeba@novafitnesss.com",
        phone: "+44 20 7946 0958",
        stage: "Contacted",
        paymentStatus: "Unpaid",
        totalPaidUsd: 0,
        openBalanceUsd: 0,
        services: [{ name: "Social Media Marketing", type: "Retainer", status: "Not Started" }],
        salesOwner: "Junaid (Sales)",
        createdAt: "2025-12-10",
        lastActivityAt: "2025-12-12",
        country: "United Kingdom",
        timezone: "Europe/London",
        retainerStatus: "None",
      },
      {
        id: "c_003",
        companyName: "Brightwood Press",
        primaryContactName: "Jennifer Lanzetti",
        email: "jennifer@brightwoodpress.com",
        phone: "+1 646 555 0101",
        stage: "Closed Won",
        paymentStatus: "Paid",
        totalPaidUsd: 12000,
        openBalanceUsd: 0,
        services: [
          { name: "Branding", type: "One-time", status: "Delivered", priceUsd: 2500 },
          { name: "Website Design", type: "One-time", status: "Delivered", priceUsd: 4500 },
          { name: "SEO Retainer", type: "Retainer", status: "In Progress", assignedProduction: "Hassan (SEO)" },
        ],
        salesOwner: "Mansoor (Sales)",
        accountManager: "Sarah (AM)",
        productionOwner: "Umer (Prod Lead)",
        createdAt: "2025-11-20",
        lastActivityAt: "2025-12-13",
        country: "United States",
        timezone: "America/New_York",
        totalContractValueUsd: 12000,
        lastPaymentDate: "2025-11-29",
        retainerStatus: "Active",
        retainerPlanName: "SEO Retainer",
        monthlyRetainerUsd: 1200,
        billingDay: 5,
        thisMonthPaid: true,
        nextMonthExpectedUsd: 1200,
        retainerStartDate: "2025-12-01",
      },
    ],
    []
  );

  // Search
  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const term = search.trim().toLowerCase();

    return clients.filter((c) => {
      const haystack = [
        c.companyName,
        c.primaryContactName,
        c.email,
        c.phone,
        c.paymentStatus,
        formatUSD(c.totalPaidUsd),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [clients, search]);

  // Sorting
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((p) => (p === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = useMemo(() => {
    const getVal = (c: ClientRecord, key: SortKey) => {
      switch (key) {
        case "companyName":
          return c.companyName.toLowerCase();
        case "primaryContactName":
          return c.primaryContactName.toLowerCase();
        case "email":
          return c.email.toLowerCase();
        case "phone":
          return c.phone.toLowerCase();
        case "paymentStatus":
          return c.paymentStatus.toLowerCase();
        case "totalPaidUsd":
          return Number(c.totalPaidUsd) || 0;
        case "createdAt": {
          const d = new Date(c.createdAt);
          return isNaN(d.getTime()) ? 0 : d.getTime();
        }
        default:
          return "";
      }
    };

    return [...filtered].sort((a, b) => {
      const av: any = getVal(a, sortKey);
      const bv: any = getVal(b, sortKey);

      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const activeClient = useMemo(
    () => (expandedId ? clients.find((c) => c.id === expandedId) || null : null),
    [expandedId, clients]
  );

  const toggleDrawer = (id: string) => setExpandedId((p) => (p === id ? null : id));

  // Locked table shell styling
  const lightShell = "#F8FAFC";
  const darkShell = "rgba(255,255,255,0.055)";

  const pageWrap: React.CSSProperties = {
    maxWidth: "100%",
    overflowX: "hidden",
  };

  const tableShellStyle: React.CSSProperties = {
    borderRadius: 20,
    background: isDark ? darkShell : lightShell,
    border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
    padding: 16,
    boxShadow: isDark ? "0 18px 55px rgba(0,0,0,0.55)" : "0 14px 40px rgba(15,23,42,0.06)",
    maxWidth: "100%",
    overflow: "hidden",
  };

  const headerCellStyle: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.08,
    color: isDark ? "rgba(255,255,255,0.80)" : "rgba(15,23,42,0.70)",
    fontWeight: 800,
    borderBottom: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
    whiteSpace: "nowrap",
    textAlign: "left",
    cursor: "pointer",
    userSelect: "none",
  };

  const bodyCellStyle: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: 14,
    color: isDark ? "rgba(255,255,255,0.88)" : "rgba(15,23,42,0.86)",
    borderBottom: isDark ? "1px dashed rgba(255,255,255,0.10)" : "1px dashed rgba(15,23,42,0.10)",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
  };

  // Drawer styling (light/dark differs)
  const drawerStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    right: 0,
    height: "100vh",
    width: "min(420px, 100%)",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    zIndex: 50,
    animation: "slideInClientsDrawer 220ms ease-out",
    background: isDark
      ? "radial-gradient(circle at top left, rgba(59,130,246,0.18), transparent 55%), rgba(2,6,23,0.92)"
      : "radial-gradient(circle at top left, rgba(59,130,246,0.10), transparent 55%), rgba(248,250,252,0.98)",
    borderLeft: isDark ? "1px solid rgba(148,163,184,0.35)" : "1px solid rgba(15,23,42,0.10)",
    boxShadow: isDark ? "-32px 0 80px rgba(2,6,23,0.92)" : "-28px 0 70px rgba(15,23,42,0.20)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  };

  return (
    <div style={pageWrap}>
      <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 10 }}>All Clients</h2>
      <p style={{ fontSize: 14, color: "var(--mut, #94A3B8)", marginBottom: 16 }}>
        Track every lead and every client — pipeline, payments, services, ownership, and retainers — in one control panel.
      </p>

      {/* Search (LOCKED: same as Users) */}
      <div style={{ marginBottom: 16, maxWidth: 360 }}>
        <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search keyword" />
      </div>

      <div style={tableShellStyle}>
        <div style={{ width: "100%", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 880 }}>
            <thead>
              <tr>
                <th style={headerCellStyle} onClick={() => handleSort("companyName")}>
                  Company {sortKey === "companyName" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th style={headerCellStyle} onClick={() => handleSort("primaryContactName")}>
                  Contact {sortKey === "primaryContactName" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th style={headerCellStyle} onClick={() => handleSort("email")}>
                  Email {sortKey === "email" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th style={headerCellStyle} onClick={() => handleSort("phone")}>
                  Phone {sortKey === "phone" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th style={headerCellStyle} onClick={() => handleSort("paymentStatus")}>
                  Payment {sortKey === "paymentStatus" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th style={headerCellStyle} onClick={() => handleSort("totalPaidUsd")}>
                  Total Paid {sortKey === "totalPaidUsd" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th style={headerCellStyle} onClick={() => handleSort("createdAt")}>
                  Created {sortKey === "createdAt" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th style={{ ...headerCellStyle, textAlign: "right", cursor: "default" }}>Action</th>
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

                return (
                  <tr
                    key={c.id}
                    style={{ background: rowBg, transition: "background 120ms ease" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.background = isDark
                        ? "rgba(255,255,255,0.04)"
                        : "rgba(15,23,42,0.03)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.background = rowBg;
                    }}
                  >
                    <td style={bodyCellStyle}>{c.companyName}</td>
                    <td style={bodyCellStyle}>{c.primaryContactName}</td>
                    <td style={bodyCellStyle}>{c.email}</td>
                    <td style={bodyCellStyle}>{c.phone}</td>
                    <td style={bodyCellStyle}>{c.paymentStatus}</td>
                    <td style={bodyCellStyle}>{formatUSD(c.totalPaidUsd)}</td>
                    <td style={bodyCellStyle}>{formatDate(c.createdAt)}</td>
                    <td style={{ ...bodyCellStyle, textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => toggleDrawer(c.id)}
                        className="btn ghost"
                        style={{
                          padding: "6px 14px",
                          borderRadius: 999,
                          fontSize: 13,
                          fontWeight: 700,
                          borderColor: isDark ? "rgba(255,255,255,0.28)" : "rgba(15,23,42,0.18)",
                          color: isDark ? "rgba(255,255,255,0.92)" : "rgba(15,23,42,0.85)",
                          background: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.55)",
                        }}
                      >
                        {expandedId === c.id ? "Close" : "View"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer */}
      {activeClient && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setExpandedId(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: isDark ? "rgba(2,6,23,0.68)" : "rgba(15,23,42,0.35)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              zIndex: 40,
            }}
          />

          <aside style={drawerStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 900, color: isDark ? "#F9FAFB" : "#0F172A" }}>
                  {activeClient.companyName}
                </div>
                <div style={{ fontSize: 13, color: isDark ? "rgba(255,255,255,0.70)" : "rgba(15,23,42,0.62)", marginTop: 2 }}>
                  {activeClient.primaryContactName} · {activeClient.email}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setExpandedId(null)}
                className="btn ghost"
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  borderColor: isDark ? "rgba(255,255,255,0.22)" : "rgba(15,23,42,0.15)",
                  color: isDark ? "rgba(255,255,255,0.92)" : "rgba(15,23,42,0.85)",
                  background: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.60)",
                }}
              >
                Close
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", paddingRight: 2 }}>
              <ClientDrawerContent client={activeClient} isDark={isDark} />
            </div>

            {/* Drawer Actions (NEW) */}
            <div
              style={{
                display: "flex",
                gap: 10,
                paddingTop: 10,
                borderTop: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
              }}
            >
              <button className="btn" style={{ flex: 1, borderRadius: 12, fontWeight: 800 }}>
                Edit Client
              </button>
              <button
                className="btn"
                style={{
                  flex: 1,
                  borderRadius: 12,
                  fontWeight: 800,
                  background: "rgba(239,68,68,0.12)",
                  border: "1px solid rgba(239,68,68,0.35)",
                  color: isDark ? "rgba(255,255,255,0.92)" : "rgba(15,23,42,0.86)",
                }}
              >
                Archive
              </button>
            </div>
          </aside>

          <style jsx global>{`
            @keyframes slideInClientsDrawer {
              from {
                transform: translateX(100%);
                opacity: 0;
              }
              to {
                transform: translateX(0);
                opacity: 1;
              }
            }
          `}</style>
        </>
      )}
    </div>
  );
}

function ClientDrawerContent({ client, isDark }: { client: ClientRecord; isDark: boolean }) {
  const paidOrPartial = isPaidOrPartial(client.paymentStatus);

  const oneTime = (client.services || []).filter((s) => s.type === "One-time");
  const retainer = (client.services || []).filter((s) => s.type === "Retainer");
  const serviceTags = (client.services || []).map((s) => s.name);

  const surface: React.CSSProperties = {
    borderRadius: 20,
    padding: 16,
    border: isDark ? "1px solid rgba(148,163,184,0.35)" : "1px solid rgba(15,23,42,0.10)",
    background: isDark ? "rgba(2,6,23,0.68)" : "rgba(255,255,255,0.85)",
    boxShadow: isDark ? "0 20px 60px rgba(0,0,0,0.55)" : "0 18px 55px rgba(15,23,42,0.10)",
  };

  const badgeRow: React.CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  };

  const badge: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 800,
    borderRadius: 999,
    padding: "6px 10px",
    border: isDark ? "1px solid rgba(255,255,255,0.16)" : "1px solid rgba(15,23,42,0.12)",
    background: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.70)",
    color: isDark ? "rgba(255,255,255,0.90)" : "rgba(15,23,42,0.85)",
  };

  const sectionTitle = (t: string) => (
    <div
      style={{
        fontSize: 12,
        fontWeight: 900,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        marginBottom: 10,
        color: isDark ? "rgba(255,255,255,0.72)" : "rgba(15,23,42,0.55)",
      }}
    >
      {t}
    </div>
  );

  const twoCol: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  };

  const tagWrap: React.CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  };

  const tagStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 800,
    padding: "6px 10px",
    borderRadius: 999,
    border: isDark ? "1px solid rgba(255,255,255,0.16)" : "1px solid rgba(15,23,42,0.12)",
    background: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.70)",
    color: isDark ? "rgba(255,255,255,0.92)" : "rgba(15,23,42,0.86)",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Identity + Ownership */}
      <div style={surface}>
        {sectionTitle("Identity & Ownership")}
        <div style={twoCol}>
          <Field label="Primary Contact" value={client.primaryContactName} isDark={isDark} />
          <Field label="Phone" value={client.phone} isDark={isDark} />
          <Field label="Email" value={client.email} isDark={isDark} />
          <Field label="Country" value={client.country || "-"} isDark={isDark} />
          <Field label="Timezone" value={client.timezone || "-"} isDark={isDark} />
          <Field label="Created" value={formatDate(client.createdAt)} isDark={isDark} />
          <Field label="Last Activity" value={formatDate(client.lastActivityAt)} isDark={isDark} />
          <Field label="Sales Owner" value={client.salesOwner} isDark={isDark} />
          <Field label="Assigned To (AM)" value={paidOrPartial ? client.accountManager || "-" : "— (assign after payment)"} isDark={isDark} />
          <Field label="Production Owner" value={client.productionOwner || "-"} isDark={isDark} />
        </div>

        {/* Badges: Stage + Delivery moved here (not in table) */}
        <div style={badgeRow}>
          <div style={badge}>Stage: {client.stage}</div>
          <div style={badge}>Payment: {client.paymentStatus}</div>
          <div style={badge}>Delivery: {calcDelivery(client.services)}</div>
          <div style={badge}>Retainer: {client.retainerStatus}</div>
        </div>
      </div>

      {/* Money */}
      <div style={surface}>
        {sectionTitle("Money Overview")}
        <div style={twoCol}>
          <Field label="Total Contract Value" value={formatUSD(client.totalContractValueUsd ?? client.totalPaidUsd + client.openBalanceUsd)} isDark={isDark} />
          <Field label="Total Paid (Lifetime)" value={formatUSD(client.totalPaidUsd)} isDark={isDark} />
          <Field label="Open Balance" value={formatUSD(client.openBalanceUsd)} isDark={isDark} />
          <Field label="Last Payment Date" value={formatDate(client.lastPaymentDate)} isDark={isDark} />
          <Field label="Next Follow-up" value={formatDate(client.nextFollowUpDate)} isDark={isDark} />
        </div>
      </div>

      {/* Retainer Control */}
      <div style={surface}>
        {sectionTitle("Retainer Control")}
        {client.retainerStatus === "None" ? (
          <div style={{ fontSize: 14, color: isDark ? "rgba(255,255,255,0.72)" : "rgba(15,23,42,0.62)" }}>
            No retainer plan assigned.
          </div>
        ) : (
          <div style={twoCol}>
            <Field label="Plan" value={client.retainerPlanName || "-"} isDark={isDark} />
            <Field label="Monthly Retainer (USD)" value={formatUSD(client.monthlyRetainerUsd)} isDark={isDark} />
            <Field label="Billing Day" value={client.billingDay ? `${client.billingDay}` : "-"} isDark={isDark} />
            <Field label="This Month Paid?" value={client.thisMonthPaid === true ? "Yes" : client.thisMonthPaid === false ? "No" : "-"} isDark={isDark} />
            <Field label="Next Month Expected" value={formatUSD(client.nextMonthExpectedUsd ?? client.monthlyRetainerUsd)} isDark={isDark} />
            <Field label="Retainer Start" value={formatDate(client.retainerStartDate)} isDark={isDark} />
            <Field label="Retainer Status" value={client.retainerStatus} isDark={isDark} />
          </div>
        )}
      </div>

      {/* Services */}
      <div style={surface}>
        {sectionTitle("Services")}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: isDark ? "rgba(255,255,255,0.72)" : "rgba(15,23,42,0.55)", marginBottom: 8 }}>
            Services (compact)
          </div>
          <div style={tagWrap}>
            {serviceTags.length === 0 ? (
              <span style={{ fontSize: 14, color: isDark ? "rgba(255,255,255,0.72)" : "rgba(15,23,42,0.62)" }}>-</span>
            ) : (
              serviceTags.map((t, i) => (
                <span key={`${t}-${i}`} style={tagStyle} title={t}>
                  {t}
                </span>
              ))
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <ServiceGroup title="One-time Services" items={oneTime} isDark={isDark} />
          <ServiceGroup title="Retainer Services" items={retainer} isDark={isDark} />
        </div>
      </div>

      {/* Invoices & Payments (stub for now) */}
      <div style={surface}>
        {sectionTitle("Invoices & Payments")}
        <div style={{ fontSize: 14, color: isDark ? "rgba(255,255,255,0.72)" : "rgba(15,23,42,0.62)" }}>
          Coming next: invoices list, payments list, next due date.
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, isDark }: { label: string; value: string; isDark: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.45, color: isDark ? "rgba(255,255,255,0.72)" : "rgba(15,23,42,0.55)" }}>
        {label}
      </span>
      <span style={{ fontSize: 14, fontWeight: 700, color: isDark ? "#FFFFFF" : "#0F172A" }}>{value}</span>
    </div>
  );
}

function ServiceGroup({ title, items, isDark }: { title: string; items: ClientService[]; isDark: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 900, color: isDark ? "rgba(255,255,255,0.72)" : "rgba(15,23,42,0.55)", marginBottom: 8 }}>
        {title}
      </div>

      {items.length === 0 ? (
        <div style={{ fontSize: 14, color: isDark ? "rgba(255,255,255,0.72)" : "rgba(15,23,42,0.62)" }}>-</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((s, idx) => (
            <div
              key={`${s.name}-${idx}`}
              style={{
                borderRadius: 14,
                padding: 12,
                border: isDark ? "1px solid rgba(255,255,255,0.14)" : "1px solid rgba(15,23,42,0.10)",
                background: isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.70)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: isDark ? "#fff" : "#0F172A" }}>{s.name}</div>
                <div style={{ fontSize: 12, fontWeight: 900, color: isDark ? "rgba(255,255,255,0.78)" : "rgba(15,23,42,0.62)" }}>
                  {s.status}
                </div>
              </div>

              <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                <Mini label="Type" value={s.type} isDark={isDark} />
                <Mini label="Price (USD)" value={s.priceUsd ? formatUSD(s.priceUsd) : "-"} isDark={isDark} />
                <Mini label="Start" value={formatDate(s.startDate)} isDark={isDark} />
                <Mini label="Due" value={formatDate(s.dueDate)} isDark={isDark} />
                <Mini label="Assigned Production" value={s.assignedProduction || "-"} isDark={isDark} />
              </div>

              {s.notes ? (
                <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: isDark ? "rgba(255,255,255,0.70)" : "rgba(15,23,42,0.62)" }}>
                  Notes: {s.notes}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Mini({ label, value, isDark }: { label: string; value: string; isDark: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.45, color: isDark ? "rgba(255,255,255,0.60)" : "rgba(15,23,42,0.50)" }}>
        {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 800, color: isDark ? "rgba(255,255,255,0.92)" : "rgba(15,23,42,0.86)" }}>
        {value}
      </span>
    </div>
  );
}

function calcDelivery(services: ClientService[]): DeliveryStatus {
  if (!services || services.length === 0) return "Not Started";
  if (services.some((s) => s.status === "Blocked")) return "Blocked";
  if (services.every((s) => s.status === "Delivered")) return "Delivered";
  if (services.some((s) => s.status === "In Progress")) return "In Progress";
  return "Not Started";
}
