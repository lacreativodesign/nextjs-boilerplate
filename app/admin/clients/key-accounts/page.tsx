"use client";

import React, { useMemo, useState } from "react";

// ✅ LOCKED RULE
const KEY_ACCOUNT_THRESHOLD_USD = 1000;

// Keep these labels consistent with your ERP
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
  primaryContactEmail: string;
  primaryContactPhone?: string;

  salesStage: SalesStage;
  paymentStatus: PaymentStatus;
  retainerStatus: RetainerStatus;

  totalPaidUsd: number;
  createdAt: string; // yyyy-mm-dd or m/d/yyyy (your UI already shows both in places)
  lastActivity?: string;

  salesOwner?: string; // e.g. "Mansoor (Sales)"
  accountManager?: string; // e.g. "Sarah (AM)"
  productionOwner?: string; // e.g. "Ayesha (Prod)"
};

// ✅ Dummy data (matches your current Clients module approach)
const DUMMY_CLIENTS: ClientRecord[] = [
  {
    id: "cl_001",
    companyName: "ACME Trading LLC",
    website: "acme.com",
    industry: "Retail",
    country: "United States",
    timezone: "America/Chicago",
    primaryContactName: "Bilal Ahmed",
    primaryContactEmail: "bilal@acme.com",
    primaryContactPhone: "+1 312 555 0199",
    salesStage: "Qualified",
    paymentStatus: "Partially Paid",
    retainerStatus: "Active",
    totalPaidUsd: 2500,
    createdAt: "2025-12-01",
    lastActivity: "2025-12-11",
    salesOwner: "Mansoor (Sales)",
    accountManager: "Sarah (AM)",
    productionOwner: "Ayesha (Prod)",
  },
  {
    id: "cl_002",
    companyName: "Brightwood Press",
    website: "brightwoodpress.com",
    industry: "Publishing",
    country: "United States",
    timezone: "America/New_York",
    primaryContactName: "Jennifer Lanzetti",
    primaryContactEmail: "jennifer@brightwoodpress.com",
    primaryContactPhone: "+1 646 555 0101",
    salesStage: "Closed Won",
    paymentStatus: "Paid",
    retainerStatus: "Active",
    totalPaidUsd: 12000,
    createdAt: "2025-11-19",
    lastActivity: "2025-12-12",
    salesOwner: "Mansoor (Sales)",
    accountManager: "Sarah (AM)",
    productionOwner: "Ayesha (Prod)",
  },
  {
    id: "cl_003",
    companyName: "Zenora Dental Group",
    website: "zenoradental.com",
    industry: "Healthcare",
    country: "United States",
    timezone: "America/New_York",
    primaryContactName: "Hassan Raza",
    primaryContactEmail: "hassan@zenoradental.com",
    primaryContactPhone: "+1 213 555 0120",
    salesStage: "Closed Won",
    paymentStatus: "Paid",
    retainerStatus: "None",
    totalPaidUsd: 18500,
    createdAt: "2025-10-28",
    lastActivity: "2025-12-09",
    salesOwner: "Junaid (Sales)",
    accountManager: "Sarah (AM)",
    productionOwner: "Ayesha (Prod)",
  },
  {
    id: "cl_004",
    companyName: "Nova Fitness Studio",
    website: "novafitnessss.com",
    industry: "Fitness",
    country: "United Kingdom",
    timezone: "Europe/London",
    primaryContactName: "Areeba Khan",
    primaryContactEmail: "areeba@novafitnessss.com",
    primaryContactPhone: "+44 20 7946 0958",
    salesStage: "Contacted",
    paymentStatus: "Unpaid",
    retainerStatus: "None",
    totalPaidUsd: 0,
    createdAt: "12/9/2025",
    lastActivity: "12/11/2025",
    salesOwner: "Junaid (Sales)",
    accountManager: "",
    productionOwner: "",
  },
];

function formatMoneyUSD(n: number) {
  // ✅ locked formatting: $ 12,500
  const safe = Number.isFinite(n) ? n : 0;
  return `$ ${safe.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function safeText(v?: string) {
  const s = (v ?? "").toString().trim();
  return s.length ? s : "—";
}

export default function KeyAccountsPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ClientRecord | null>(null);

  // ✅ key accounts list (never undefined)
  const keyAccounts = useMemo(() => {
    const list = Array.isArray(DUMMY_CLIENTS) ? DUMMY_CLIENTS : [];
    return list.filter((c) => (c?.totalPaidUsd ?? 0) >= KEY_ACCOUNT_THRESHOLD_USD);
  }, []);

  // ✅ search (never undefined)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return keyAccounts;

    return keyAccounts.filter((c) => {
      const hay = [
        c.companyName,
        c.primaryContactName,
        c.primaryContactEmail,
        c.primaryContactPhone,
        c.paymentStatus,
        c.salesStage,
        c.website,
        c.country,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [search, keyAccounts]);

  return (
    <div className="w-full">
      {/* Page header + description (matches Clients module style) */}
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Key Accounts</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          High-value clients (revenue-based). Key Account = <b>Total Paid ≥ {formatMoneyUSD(KEY_ACCOUNT_THRESHOLD_USD)}</b>.
        </p>
      </div>

      {/* Search (same as Users / All Clients) */}
      <div className="mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search keyword"
          className="w-full max-w-sm rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 shadow-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-[#141414] dark:text-white"
        />
      </div>

      {/* Table (same “Users-style” surface in light & dark) */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#171717]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                <th className="px-5 py-4">Company</th>
                <th className="px-5 py-4">Contact</th>
                <th className="px-5 py-4">Email</th>
                <th className="px-5 py-4">Phone</th>
                <th className="px-5 py-4">Payment</th>
                <th className="px-5 py-4">Total Paid</th>
                <th className="px-5 py-4">Created</th>
                <th className="px-5 py-4 text-right">Action</th>
              </tr>
            </thead>

            <tbody className="text-sm text-gray-900 dark:text-white">
              {filtered.length === 0 ? (
                <tr>
                  <td className="px-5 py-6 text-gray-500 dark:text-gray-400" colSpan={8}>
                    No key accounts found.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="border-t border-gray-100 hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/5"
                  >
                    <td className="px-5 py-5 font-medium">{c.companyName}</td>
                    <td className="px-5 py-5">{c.primaryContactName}</td>
                    <td className="px-5 py-5">{c.primaryContactEmail}</td>
                    <td className="px-5 py-5">{safeText(c.primaryContactPhone)}</td>
                    <td className="px-5 py-5">{c.paymentStatus}</td>
                    <td className="px-5 py-5">{formatMoneyUSD(c.totalPaidUsd)}</td>
                    <td className="px-5 py-5">{c.createdAt}</td>
                    <td className="px-5 py-5 text-right">
                      <button
                        onClick={() => setSelected(c)}
                        className="rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-900 shadow-sm hover:bg-gray-50 dark:border-white/10 dark:bg-[#141414] dark:text-white dark:hover:bg-white/5"
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

      {/* ✅ Drawer (matches All Clients behavior) */}
      {selected && (
        <div className="fixed inset-0 z-50">
          {/* overlay */}
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-[2px] dark:bg-black/60"
            onClick={() => setSelected(null)}
          />

          {/* panel */}
          <div className="absolute right-0 top-0 h-full w-full max-w-[440px] bg-white shadow-2xl dark:bg-[#0f0f10]">
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-white/10">
                <div className="min-w-0">
                  <div className="truncate text-lg font-bold text-gray-900 dark:text-white">
                    {selected.companyName}
                  </div>
                  <div className="truncate text-xs text-gray-600 dark:text-gray-300">
                    {selected.primaryContactName} · {selected.primaryContactEmail}
                  </div>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-900 hover:bg-gray-50 dark:border-white/10 dark:bg-[#141414] dark:text-white dark:hover:bg-white/5"
                >
                  Close
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-[#141414]">
                  <div className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                    Summary
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-gray-200 p-3 dark:border-white/10">
                      <div className="text-[11px] text-gray-600 dark:text-gray-300">Sales Stage</div>
                      <div className="mt-1 text-sm font-semibold">{selected.salesStage}</div>
                    </div>
                    <div className="rounded-xl border border-gray-200 p-3 dark:border-white/10">
                      <div className="text-[11px] text-gray-600 dark:text-gray-300">Payment Status</div>
                      <div className="mt-1 text-sm font-semibold">{selected.paymentStatus}</div>
                    </div>
                    <div className="rounded-xl border border-gray-200 p-3 dark:border-white/10">
                      <div className="text-[11px] text-gray-600 dark:text-gray-300">Retainer Status</div>
                      <div className="mt-1 text-sm font-semibold">{selected.retainerStatus}</div>
                    </div>
                    <div className="rounded-xl border border-gray-200 p-3 dark:border-white/10">
                      <div className="text-[11px] text-gray-600 dark:text-gray-300">Total Paid (USD)</div>
                      <div className="mt-1 text-sm font-semibold">{formatMoneyUSD(selected.totalPaidUsd)}</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-[#141414]">
                    <div className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                      Company
                    </div>
                    <div className="space-y-3 text-sm">
                      <Row label="Company" value={selected.companyName} />
                      <Row label="Website" value={safeText(selected.website)} />
                      <Row label="Industry" value={safeText(selected.industry)} />
                      <Row label="Country" value={safeText(selected.country)} />
                      <Row label="Timezone" value={safeText(selected.timezone)} />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-[#141414]">
                    <div className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                      Contact
                    </div>
                    <div className="space-y-3 text-sm">
                      <Row label="Contact" value={selected.primaryContactName} />
                      <Row label="Email" value={selected.primaryContactEmail} />
                      <Row label="Phone" value={safeText(selected.primaryContactPhone)} />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-[#141414]">
                    <div className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                      Ownership
                    </div>
                    <div className="space-y-3 text-sm">
                      <Row label="Sales Owner" value={safeText(selected.salesOwner)} />
                      <Row label="Assigned To (AM)" value={safeText(selected.accountManager)} />
                      <Row label="Production Owner" value={safeText(selected.productionOwner)} />
                      <Row label="Created" value={safeText(selected.createdAt)} />
                      <Row label="Last Activity" value={safeText(selected.lastActivity)} />
                    </div>
                  </div>
                </div>
              </div>

              {/* bottom actions (same pattern as your Clients drawer screenshot) */}
              <div className="border-t border-gray-100 px-5 py-4 dark:border-white/10">
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      // TODO: route to edit page when you wire edit flow
                      // example: router.push(`/admin/clients/edit?id=${selected.id}`)
                      alert("Edit Client (wire route next)");
                    }}
                    className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Edit Client
                  </button>

                  <button
                    onClick={() => alert("Archive (wire backend next)")}
                    className="flex-1 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200 hover:bg-red-500/15"
                  >
                    Archive
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
        {label}
      </div>
      <div className="text-right text-sm font-semibold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}
