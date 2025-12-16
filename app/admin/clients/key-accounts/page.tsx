"use client";

import React, { useMemo, useState } from "react";

type PaymentStatus = "Unpaid" | "Partially Paid" | "Paid" | "Refunded";
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
  company: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  country?: string;
  website?: string;
  industry?: string;
  timezone?: string;
  stage: SalesStage;
  paymentStatus: PaymentStatus;
  retainerStatus: RetainerStatus;
  totalPaidUsd: number;
  openBalanceUsd: number;
  services: string[];
  salesOwner?: string;
  accountManager?: string;
  productionOwner?: string;
  createdAt: string; // YYYY-MM-DD
};

// Dummy data (same style as All Clients) — Key Accounts is just a filtered view (Total Paid >= $1,000).
const clients: ClientRecord[] = [
  {
    id: "c-001",
    company: "Nova Fitness Studio",
    contactName: "Areeba Khan",
    contactEmail: "areeba@novafitness.com",
    contactPhone: "+44 20 7946 0958",
    country: "United Kingdom",
    website: "novafitness.com",
    industry: "Fitness",
    timezone: "Europe/London",
    stage: "Contacted",
    paymentStatus: "Unpaid",
    retainerStatus: "None",
    totalPaidUsd: 0,
    openBalanceUsd: 0,
    services: ["Social Media Marketing"],
    salesOwner: "Junaid (Sales)",
    accountManager: "—",
    productionOwner: "—",
    createdAt: "2025-12-09",
  },
  {
    id: "c-002",
    company: "ACME Trading LLC",
    contactName: "Bilal Ahmed",
    contactEmail: "bilal@acme.com",
    contactPhone: "+1 312 555 0199",
    country: "United States",
    website: "acme.com",
    industry: "Retail",
    timezone: "America/Chicago",
    stage: "Qualified",
    paymentStatus: "Partially Paid",
    retainerStatus: "Active",
    totalPaidUsd: 2500,
    openBalanceUsd: 1500,
    services: ["Website Design", "SEO Retainer"],
    salesOwner: "Mansoor (Sales)",
    accountManager: "Sarah (AM)",
    productionOwner: "Ayesha (Prod)",
    createdAt: "2025-12-01",
  },
  {
    id: "c-003",
    company: "Brightwood Press",
    contactName: "Jennifer Lanzetti",
    contactEmail: "jennifer@brightwoodpress.com",
    contactPhone: "+1 646 555 0101",
    country: "United States",
    website: "brightwoodpress.com",
    industry: "Publishing",
    timezone: "America/New_York",
    stage: "Closed Won",
    paymentStatus: "Paid",
    retainerStatus: "Active",
    totalPaidUsd: 12000,
    openBalanceUsd: 0,
    services: ["Branding", "Website Design", "SEO Retainer"],
    salesOwner: "Mansoor (Sales)",
    accountManager: "Sarah (AM)",
    productionOwner: "Ayesha (Prod)",
    createdAt: "2025-11-19",
  },
  {
    id: "c-004",
    company: "Zenora Dental Group",
    contactName: "Hassan Raza",
    contactEmail: "hassan@zenoradental.com",
    contactPhone: "+1 213 555 0120",
    country: "United States",
    website: "zenoradental.com",
    industry: "Healthcare",
    timezone: "America/Los_Angeles",
    stage: "Closed Won",
    paymentStatus: "Paid",
    retainerStatus: "Active",
    totalPaidUsd: 18500,
    openBalanceUsd: 0,
    services: ["Website Design", "SMM Retainer", "SEO Retainer"],
    salesOwner: "Mansoor (Sales)",
    accountManager: "Sarah (AM)",
    productionOwner: "Ayesha (Prod)",
    createdAt: "2025-10-28",
  },
];

function formatUsd(amount: number): string {
  // ✅ $ 12,500 (with commas).
  return "$ " + amount.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function isKeyAccount(c: ClientRecord): boolean {
  // ✅ Key Account = Total Paid >= $1,000
  return c.totalPaidUsd >= 1000;
}

export default function KeyAccountsPage() {
  const [query, setQuery] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<ClientRecord | null>(null);

  const keyAccounts = useMemo(() => clients.filter(isKeyAccount), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? keyAccounts.filter((c) => {
          const hay = [
            c.company,
            c.contactName,
            c.contactEmail,
            c.contactPhone,
            c.paymentStatus,
            c.stage,
            c.retainerStatus,
            ...(c.services ?? []),
            c.salesOwner ?? "",
            c.accountManager ?? "",
            c.productionOwner ?? "",
          ]
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        })
      : keyAccounts;

    const sorted = [...base].sort((a, b) => {
      const ad = new Date(a.createdAt).getTime();
      const bd = new Date(b.createdAt).getTime();
      return sortDir === "asc" ? ad - bd : bd - ad;
    });

    return sorted;
  }, [keyAccounts, query, sortDir]);

  return (
    <div className="w-full overflow-x-hidden">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Key Accounts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          High-value clients (revenue-based). Key Account = <b>Total Paid ≥ $ 1,000</b>.
        </p>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-sm">
          <label className="sr-only">Search keyword</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search keyword"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-0 focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Created</span>
          <button
            type="button"
            onClick={() => setSortDir((p) => (p === "asc" ? "desc" : "asc"))}
            className="rounded-lg border border-border bg-background px-3 py-2 hover:bg-muted"
            aria-label="Toggle created sort"
          >
            {sortDir === "desc" ? "▼" : "▲"}
          </button>
        </div>
      </div>

      {/* Table shell — matches All Clients styling */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Company</th>
                <th className="px-4 py-3 text-left">Contact</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Phone</th>
                <th className="px-4 py-3 text-left">Payment</th>
                <th className="px-4 py-3 text-left">Total Paid</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 font-medium">{c.company}</td>
                  <td className="px-4 py-3">{c.contactName}</td>
                  <td className="px-4 py-3">{c.contactEmail}</td>
                  <td className="px-4 py-3">{c.contactPhone}</td>
                  <td className="px-4 py-3">{c.paymentStatus}</td>
                  <td className="px-4 py-3">{formatUsd(c.totalPaidUsd)}</td>
                  <td className="px-4 py-3">{c.createdAt}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelected(c)}
                      className="rounded-full border border-border bg-background px-4 py-1.5 text-xs font-medium hover:bg-muted"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td className="px-4 py-10 text-center text-muted-foreground" colSpan={8}>
                    No key accounts found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer — same overlay/panel behavior as All Clients */}
      {selected && (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Client drawer"
        >
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setSelected(null)}
          />

          <div className="absolute right-0 top-0 h-full w-full max-w-[520px] overflow-y-auto border-l border-border bg-card p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold">{selected.company}</div>
                <div className="text-sm text-muted-foreground">{selected.contactEmail}</div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-6">
              <section>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Summary
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border border-border bg-background p-3">
                    <div className="text-xs text-muted-foreground">Sales Stage</div>
                    <div className="mt-1 font-medium">{selected.stage}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3">
                    <div className="text-xs text-muted-foreground">Payment Status</div>
                    <div className="mt-1 font-medium">{selected.paymentStatus}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3">
                    <div className="text-xs text-muted-foreground">Retainer Status</div>
                    <div className="mt-1 font-medium">{selected.retainerStatus}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3">
                    <div className="text-xs text-muted-foreground">Total Paid (USD)</div>
                    <div className="mt-1 font-medium">{formatUsd(selected.totalPaidUsd)}</div>
                  </div>
                </div>
              </section>

              <section>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Company
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  <Row label="Company" value={selected.company} />
                  <Row label="Website" value={selected.website ?? "—"} />
                  <Row label="Industry" value={selected.industry ?? "—"} />
                  <Row label="Country" value={selected.country ?? "—"} />
                  <Row label="Timezone" value={selected.timezone ?? "—"} />
                </div>
              </section>

              <section>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Contact
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  <Row label="Contact" value={selected.contactName} />
                  <Row label="Email" value={selected.contactEmail} />
                  <Row label="Phone" value={selected.contactPhone} />
                </div>
              </section>

              <section>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Services
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(selected.services ?? []).length === 0 ? (
                    <span className="text-sm text-muted-foreground">—</span>
                  ) : (selected.services ?? []).length <= 2 ? (
                    selected.services.map((s) => (
                      <span
                        key={s}
                        className="rounded-full border border-border bg-background px-3 py-1 text-xs"
                      >
                        {s}
                      </span>
                    ))
                  ) : (
                    <>
                      <span className="rounded-full border border-border bg-background px-3 py-1 text-xs">
                        {selected.services.length} services
                      </span>
                      {selected.services.slice(0, 2).map((s) => (
                        <span
                          key={s}
                          className="rounded-full border border-border bg-background px-3 py-1 text-xs"
                        >
                          {s}
                        </span>
                      ))}
                    </>
                  )}
                </div>
              </section>

              <section>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Ownership
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  <Row label="Sales Owner" value={selected.salesOwner ?? "—"} />
                  <Row label="Account Manager" value={selected.accountManager ?? "—"} />
                  <Row label="Production Owner" value={selected.productionOwner ?? "—"} />
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-right text-sm font-medium">{value}</div>
    </div>
  );
}
