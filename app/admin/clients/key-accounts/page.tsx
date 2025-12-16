"use client";

import React, { useEffect, useMemo, useState } from "react";

type PaymentStatus = "Unpaid" | "Partially Paid" | "Paid";
type SalesStage =
  | "New Lead"
  | "Contacted"
  | "Qualified"
  | "Proposal Sent"
  | "Negotiation"
  | "Closed Won"
  | "Closed Lost";

type RetainerStatus = "None" | "Active" | "Paused" | "Cancelled";

type ClientRecord = {
  id: string;

  companyName: string;
  website?: string;
  industry?: string;
  country?: string;
  timezone?: string;

  contactName: string;
  contactTitle?: string;
  email: string;
  phone?: string;

  salesStage: SalesStage;
  paymentStatus: PaymentStatus;
  retainerStatus: RetainerStatus;

  salesOwner: string;
  accountManager?: string; // assigned after payment
  productionOwner?: string;

  totalPaidUsd: number;

  createdAt: string; // YYYY-MM-DD
  updatedAt?: string; // YYYY-MM-DD
  lastActivity?: string; // optional
};

function formatUSD(amount: number) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // fallback
    const withCommas = Math.round(amount)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `$ ${withCommas}`;
  }
}

function normalize(text: string) {
  return (text || "").toLowerCase().trim();
}

function matchesSearch(client: ClientRecord, q: string) {
  const query = normalize(q);
  if (!query) return true;

  const hay = [
    client.companyName,
    client.contactName,
    client.email,
    client.phone || "",
    client.salesOwner,
    client.accountManager || "",
    client.paymentStatus,
    client.salesStage,
    client.retainerStatus,
    client.country || "",
  ]
    .join(" ")
    .toLowerCase();

  return hay.includes(query);
}

const KEY_ACCOUNT_MIN_TOTAL_PAID_USD = 1000;

export default function KeyAccountsPage() {
  // keep page from creating weird right-side background gap when table scrolls
  useEffect(() => {
    const prev = document.body.style.overflowX;
    document.body.style.overflowX = "hidden";
    return () => {
      document.body.style.overflowX = prev;
    };
  }, []);

  // ✅ DUMMY DATA (replace with Firestore later)
  const clients: ClientRecord[] = useMemo(
    () => [
      {
        id: "c-001",
        companyName: "Brightwood Press",
        website: "brightwoodpress.com",
        industry: "Publishing",
        country: "United States",
        timezone: "America/New_York",
        contactName: "Jennifer Lanzetti",
        contactTitle: "Founder / CEO",
        email: "jennifer@brightwoodpress.com",
        phone: "+1 646 555 0101",
        salesStage: "Closed Won",
        paymentStatus: "Paid",
        retainerStatus: "Active",
        salesOwner: "Mansoor (Sales)",
        accountManager: "Sarah (AM)",
        productionOwner: "Ayesha (Prod)",
        totalPaidUsd: 12000,
        createdAt: "2025-11-19",
        updatedAt: "2025-12-13",
        lastActivity: "Payment received",
      },
      {
        id: "c-002",
        companyName: "Zenora Dental Group",
        website: "zenoradental.com",
        industry: "Healthcare",
        country: "United States",
        timezone: "America/Chicago",
        contactName: "Hassan Raza",
        contactTitle: "Operations Manager",
        email: "hassan@zenoradental.com",
        phone: "+1 213 555 0120",
        salesStage: "Closed Won",
        paymentStatus: "Paid",
        retainerStatus: "None",
        salesOwner: "Junaid (Sales)",
        accountManager: "Sarah (AM)",
        productionOwner: "Ayesha (Prod)",
        totalPaidUsd: 18500,
        createdAt: "2025-10-28",
        updatedAt: "2025-12-01",
        lastActivity: "Project delivered",
      },
      {
        id: "c-003",
        companyName: "Nova Fitness Studio",
        website: "novafitness.com",
        industry: "Fitness",
        country: "United Kingdom",
        timezone: "Europe/London",
        contactName: "Areeba Khan",
        contactTitle: "Owner",
        email: "areeba@novafitness.com",
        phone: "+44 20 7946 0958",
        salesStage: "Contacted",
        paymentStatus: "Unpaid",
        retainerStatus: "None",
        salesOwner: "Junaid (Sales)",
        accountManager: undefined,
        productionOwner: undefined,
        totalPaidUsd: 0,
        createdAt: "2025-12-09",
        updatedAt: "2025-12-09",
        lastActivity: "Intro call scheduled",
      },
    ],
    []
  );

  const keyAccounts = useMemo(
    () => clients.filter((c) => c.totalPaidUsd >= KEY_ACCOUNT_MIN_TOTAL_PAID_USD),
    [clients]
  );

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ClientRecord | null>(null);

  const filtered = useMemo(() => {
    return keyAccounts
      .filter((c) => matchesSearch(c, search))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [keyAccounts, search]);

  return (
    <div style={{ paddingBottom: 32 }}>
      <div style={{ marginBottom: 14 }}>
        <h2
          style={{
            fontSize: 34,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            margin: 0,
            color: "var(--text)",
          }}
        >
          Key Accounts
        </h2>
        <p style={{ margin: "8px 0 0", color: "var(--muted)", maxWidth: 900 }}>
          High-value clients (revenue-based). Key Account = <strong>Total Paid ≥ {formatUSD(KEY_ACCOUNT_MIN_TOTAL_PAID_USD)}</strong>.
        </p>
      </div>

      {/* Search */}
      <div style={{ margin: "14px 0 14px" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search keyword"
          style={{
            width: 320,
            maxWidth: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--card-bg)",
            color: "var(--text)",
            outline: "none",
          }}
        />
      </div>

      {/* Table */}
      <div
        style={{
          borderRadius: 14,
          border: "1px solid var(--border)",
          background: "var(--table-bg)",
          overflow: "hidden",
          boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
            <thead>
              <tr
                style={{
                  background: "var(--thead-bg)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <th style={thStyle}>Company</th>
                <th style={thStyle}>Contact</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>Payment</th>
                <th style={thStyle}>Total Paid</th>
                <th style={thStyle}>Created</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Action</th>
              </tr>
            </thead>

            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      padding: 18,
                      color: "var(--muted)",
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    No key accounts found.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr
                    key={c.id}
                    style={{
                      borderTop: "1px solid var(--border)",
                      background: "transparent",
                    }}
                  >
                    <td style={tdStyle}>{c.companyName}</td>
                    <td style={tdStyle}>{c.contactName}</td>
                    <td style={tdStyle}>{c.email}</td>
                    <td style={tdStyle}>{c.phone || "—"}</td>
                    <td style={tdStyle}>{c.paymentStatus}</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{formatUSD(c.totalPaidUsd)}</td>
                    <td style={tdStyle}>{new Date(c.createdAt).toLocaleDateString()}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <button
                        onClick={() => setSelected(c)}
                        style={{
                          padding: "7px 12px",
                          borderRadius: 999,
                          border: "1px solid var(--border)",
                          background: "transparent",
                          color: "var(--text)",
                          cursor: "pointer",
                          fontWeight: 600,
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

      {/* Drawer */}
      <ClientDrawer
        open={!!selected}
        client={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 14px",
  fontSize: 12,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--muted)",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 14px",
  color: "var(--text)",
  fontSize: 13.5,
  whiteSpace: "nowrap",
};

/** Drawer — consistent with Users + All Clients */
function ClientDrawer({
  open,
  client,
  onClose,
}: {
  open: boolean;
  client: ClientRecord | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {/* overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: open ? "rgba(0,0,0,0.55)" : "transparent",
          pointerEvents: open ? "auto" : "none",
          opacity: open ? 1 : 0,
          transition: "opacity 180ms ease",
          zIndex: 40,
        }}
      />

      {/* panel */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: "min(520px, 94vw)",
          background: "var(--drawer-bg)",
          borderLeft: "1px solid var(--border)",
          transform: open ? "translateX(0)" : "translateX(105%)",
          transition: "transform 220ms ease",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: "var(--text)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {client?.companyName || "Key Account"}
              </div>
              <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                {client?.email || "—"}
              </div>
            </div>

            <button
              onClick={onClose}
              style={{
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text)",
                borderRadius: 999,
                padding: "6px 10px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>

        <div style={{ padding: 16, overflowY: "auto" }}>
          <Section title="Summary">
            <KeyValue label="Sales Stage" value={client?.salesStage || "—"} />
            <KeyValue label="Payment Status" value={client?.paymentStatus || "—"} />
            <KeyValue label="Retainer Status" value={client?.retainerStatus || "—"} />
            <KeyValue
              label="Total Paid (USD)"
              value={client ? formatUSD(client.totalPaidUsd) : "—"}
            />
          </Section>

          <Section title="Company">
            <KeyValue label="Company" value={client?.companyName || "—"} />
            <KeyValue label="Website" value={client?.website || "—"} />
            <KeyValue label="Industry" value={client?.industry || "—"} />
            <KeyValue label="Country" value={client?.country || "—"} />
            <KeyValue label="Timezone" value={client?.timezone || "—"} />
          </Section>

          <Section title="Contact">
            <KeyValue label="Contact" value={client?.contactName || "—"} />
            <KeyValue label="Title" value={client?.contactTitle || "—"} />
            <KeyValue label="Email" value={client?.email || "—"} />
            <KeyValue label="Phone" value={client?.phone || "—"} />
          </Section>

          <Section title="Ownership">
            <KeyValue label="Sales Owner" value={client?.salesOwner || "—"} />
            <KeyValue label="Account Manager (AM)" value={client?.accountManager || "—"} />
            <KeyValue label="Production Owner" value={client?.productionOwner || "—"} />
          </Section>

          <Section title="Timeline">
            <KeyValue
              label="Created At"
              value={client?.createdAt ? new Date(client.createdAt).toLocaleDateString() : "—"}
            />
            <KeyValue
              label="Updated At"
              value={client?.updatedAt ? new Date(client.updatedAt).toLocaleDateString() : "—"}
            />
            <KeyValue label="Last Activity" value={client?.lastActivity || "—"} />
          </Section>
        </div>
      </aside>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        background: "var(--card-bg)",
        borderRadius: 14,
        padding: 14,
        marginBottom: 12,
      }}
    >
      <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
        {title}
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {children}
      </div>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
      <div style={{ color: "var(--muted)", fontSize: 12 }}>{label}</div>
      <div style={{ color: "var(--text)", fontSize: 13, fontWeight: 650, textAlign: "right" }}>
        {value}
      </div>
    </div>
  );
}
