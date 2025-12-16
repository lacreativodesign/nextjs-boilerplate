// app/admin/clients/key-accounts/page.tsx
"use client";

import React, { useMemo, useState } from "react";
import ModuleSectionLayout from "@/components/admin/ModuleSectionLayout";

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

  totalPaidUsd: number;

  createdAt: string; // YYYY-MM-DD (demo)
  lastActivityAt?: string;

  salesOwner?: string;
  accountManager?: string;
  productionOwner?: string;
};

const formatUSD = (n: number) => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    // fallback
    const rounded = Math.round(n).toString();
    return `$ ${rounded.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  }
};

function ClientDrawer({
  client,
  onClose,
}: {
  client: ClientRecord;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="absolute right-0 top-0 h-full w-full sm:w-[460px] bg-white dark:bg-[#0B1220] border-l border-black/10 dark:border-white/10 shadow-2xl">
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="p-5 border-b border-black/10 dark:border-white/10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-black dark:text-white">
                  {client.companyName}
                </div>
                <div className="text-sm text-black/60 dark:text-white/60">
                  {client.contactName} · {client.email}
                </div>
              </div>

              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg border border-black/15 dark:border-white/15 text-sm text-black/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 transition"
              >
                Close
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5">
            {/* Identity & Ownership */}
            <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-transparent">
              <div className="px-4 pt-4 pb-2 text-xs font-semibold tracking-wide text-black/60 dark:text-white/60">
                IDENTITY &amp; OWNERSHIP
              </div>

              <div className="px-4 pb-4 space-y-3">
                <Row label="Primary Contact" value={client.contactName} />
                <Row label="Phone" value={client.phone || "—"} mono />
                <Row label="Email" value={client.email} mono />
                <Row label="Country" value={client.country || "—"} />
                <Row label="Timezone" value={client.timezone || "—"} />
                <Row label="Created" value={client.createdAt} />
                <Row label="Last Activity" value={client.lastActivityAt || "—"} />

                <div className="pt-2 border-t border-black/10 dark:border-white/10" />

                <Row label="Sales Owner" value={client.salesOwner || "—"} />
                <Row
                  label="Assigned To (AM)"
                  value={client.accountManager || "— (assign after payment)"}
                />
                <Row
                  label="Production Owner"
                  value={client.productionOwner || "—"}
                />
              </div>
            </div>

            {/* Summary */}
            <div className="mt-4 rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-transparent">
              <div className="px-4 pt-4 pb-2 text-xs font-semibold tracking-wide text-black/60 dark:text-white/60">
                SUMMARY
              </div>

              <div className="px-4 pb-4 grid grid-cols-2 gap-3">
                <MiniCard label="Sales Stage" value={client.salesStage} />
                <MiniCard label="Payment Status" value={client.paymentStatus} />
                <MiniCard label="Retainer Status" value={client.retainerStatus} />
                <MiniCard label="Total Paid (USD)" value={formatUSD(client.totalPaidUsd)} />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-black/10 dark:border-white/10 bg-white dark:bg-[#0B1220]">
            <div className="flex items-center gap-3">
              <button
                className="flex-1 h-11 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold transition"
                onClick={() => {
                  // Hook this up later to /admin/clients/edit/[id] or drawer edit mode
                  alert("Edit Client (wire this to edit route / drawer edit mode).");
                }}
              >
                Edit Client
              </button>

              <button
                className="flex-1 h-11 rounded-xl border border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10 font-semibold transition"
                onClick={() => {
                  alert("Archive (wire this to Firestore update: status=archived).");
                }}
              >
                Archive
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="text-[11px] font-semibold tracking-wide text-black/50 dark:text-white/50">
        {label.toUpperCase()}
      </div>
      <div
        className={[
          "text-sm text-black dark:text-white text-right",
          mono ? "font-mono text-[13px]" : "font-semibold",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] px-4 py-3">
      <div className="text-[11px] font-semibold tracking-wide text-black/50 dark:text-white/50">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-black dark:text-white">
        {value}
      </div>
    </div>
  );
}

export default function KeyAccountsPage() {
  const [keyword, setKeyword] = useState("");
  const [sortBy, setSortBy] = useState<"createdAt">("createdAt");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ✅ Keep demo data aligned with All Clients
  const clients: ClientRecord[] = useMemo(
    () => [
      {
        id: "c_001",
        companyName: "Nova Fitness Studio",
        website: "novafitnesss.com",
        industry: "Fitness",
        country: "United Kingdom",
        timezone: "Europe/London",
        contactName: "Areeba Khan",
        contactTitle: "Owner",
        email: "areeba@novafitnesss.com",
        phone: "+44 20 7946 0958",
        salesStage: "Contacted",
        paymentStatus: "Unpaid",
        retainerStatus: "None",
        totalPaidUsd: 0,
        createdAt: "2025-12-09",
        lastActivityAt: "2025-12-11",
        salesOwner: "Junaid (Sales)",
        accountManager: "",
        productionOwner: "",
      },
      {
        id: "c_002",
        companyName: "ACME Trading LLC",
        website: "acme.com",
        industry: "Retail",
        country: "United States",
        timezone: "America/Chicago",
        contactName: "Bilal Ahmed",
        contactTitle: "Founder",
        email: "bil@acme.com",
        phone: "+1 312 555 0199",
        salesStage: "Qualified",
        paymentStatus: "Partially Paid",
        retainerStatus: "Active",
        totalPaidUsd: 2500,
        createdAt: "2025-12-01",
        lastActivityAt: "2025-12-12",
        salesOwner: "Mansoor (Sales)",
        accountManager: "Sarah (AM)",
        productionOwner: "Ayesha (Prod)",
      },
      {
        id: "c_003",
        companyName: "Brightwood Press",
        website: "brightwoodpress.com",
        industry: "Publishing",
        country: "United States",
        timezone: "America/New_York",
        contactName: "Jennifer Lanzetti",
        contactTitle: "CEO",
        email: "jennifer@brightwoodpress.com",
        phone: "+1 646 555 0101",
        salesStage: "Closed Won",
        paymentStatus: "Paid",
        retainerStatus: "Active",
        totalPaidUsd: 12000,
        createdAt: "2025-11-19",
        lastActivityAt: "2025-12-10",
        salesOwner: "Mansoor (Sales)",
        accountManager: "Sarah (AM)",
        productionOwner: "Ayesha (Prod)",
      },
      {
        id: "c_004",
        companyName: "Zenora Dental Group",
        website: "zenoradental.com",
        industry: "Healthcare",
        country: "United States",
        timezone: "America/Los_Angeles",
        contactName: "Hassan Raza",
        contactTitle: "Owner",
        email: "hassan@zenoradental.com",
        phone: "+1 213 555 0120",
        salesStage: "Closed Won",
        paymentStatus: "Paid",
        retainerStatus: "Active",
        totalPaidUsd: 18500,
        createdAt: "2025-10-28",
        lastActivityAt: "2025-12-05",
        salesOwner: "Mansoor (Sales)",
        accountManager: "Sarah (AM)",
        productionOwner: "Ayesha (Prod)",
      },
    ],
    []
  );

  const keyAccounts = useMemo(() => {
    const k = keyword.trim().toLowerCase();

    const filtered = clients.filter((c) => {
      // ✅ Key Account rule locked:
      const isKey = c.totalPaidUsd >= 1000;

      if (!isKey) return false;
      if (!k) return true;

      const hay = [
        c.companyName,
        c.contactName,
        c.email,
        c.phone || "",
        c.paymentStatus,
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(k);
    });

    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      if (av === bv) return 0;
      const dir = sortDir === "desc" ? -1 : 1;
      return av > bv ? -1 * dir : 1 * dir;
    });

    return sorted;
  }, [clients, keyword, sortBy, sortDir]);

  const activeClient = useMemo(
    () => keyAccounts.find((c) => c.id === expandedId) || null,
    [expandedId, keyAccounts]
  );

  return (
    <ModuleSectionLayout
      title="Key Accounts"
      description={
        <>
          High-value clients (revenue-based).{" "}
          <span className="font-semibold">Key Account</span> ={" "}
          <span className="font-semibold">
            Total Paid ≥ {formatUSD(1000)}
          </span>
          .
        </>
      }
    >
      {/* Search */}
      <div className="mt-5">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Search keyword"
          className="w-full max-w-[340px] h-11 px-4 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black/20 text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40 outline-none focus:ring-2 focus:ring-blue-500/40"
        />
      </div>

      {/* Table */}
      <div className="mt-4 rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden bg-white dark:bg-[#121826]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-black/[0.02] dark:bg-white/[0.03]">
              <tr className="text-left text-black/60 dark:text-white/60">
                <th className="px-5 py-4 font-semibold">COMPANY</th>
                <th className="px-5 py-4 font-semibold">CONTACT</th>
                <th className="px-5 py-4 font-semibold">EMAIL</th>
                <th className="px-5 py-4 font-semibold">PHONE</th>
                <th className="px-5 py-4 font-semibold">PAYMENT</th>
                <th className="px-5 py-4 font-semibold">TOTAL PAID</th>
                <th className="px-5 py-4 font-semibold">
                  <button
                    className="inline-flex items-center gap-2 hover:text-black dark:hover:text-white transition"
                    onClick={() => {
                      if (sortBy !== "createdAt") setSortBy("createdAt");
                      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
                    }}
                    type="button"
                  >
                    CREATED <span className="text-xs">{sortDir === "desc" ? "▼" : "▲"}</span>
                  </button>
                </th>
                <th className="px-5 py-4 font-semibold text-right">ACTION</th>
              </tr>
            </thead>

            <tbody>
              {keyAccounts.map((c) => (
                <tr
                  key={c.id}
                  className="border-t border-black/5 dark:border-white/10 text-black dark:text-white"
                >
                  <td className="px-5 py-4 font-semibold">{c.companyName}</td>
                  <td className="px-5 py-4">{c.contactName}</td>
                  <td className="px-5 py-4">{c.email}</td>
                  <td className="px-5 py-4">{c.phone || "—"}</td>
                  <td className="px-5 py-4">{c.paymentStatus}</td>
                  <td className="px-5 py-4">{formatUSD(c.totalPaidUsd)}</td>
                  <td className="px-5 py-4">{c.createdAt}</td>
                  <td className="px-5 py-4 text-right">
                    <button
                      className="px-4 h-9 rounded-xl border border-black/15 dark:border-white/15 bg-white/60 dark:bg-white/[0.02] hover:bg-black/5 dark:hover:bg-white/[0.06] transition font-semibold"
                      onClick={() => setExpandedId(c.id)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}

              {keyAccounts.length === 0 && (
                <tr>
                  <td
                    className="px-5 py-10 text-center text-black/50 dark:text-white/50"
                    colSpan={8}
                  >
                    No key accounts found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer */}
      {activeClient && (
        <ClientDrawer client={activeClient} onClose={() => setExpandedId(null)} />
      )}
    </ModuleSectionLayout>
  );
}
