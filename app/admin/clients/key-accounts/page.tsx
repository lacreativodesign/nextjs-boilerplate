"use client";

import { useMemo, useState } from "react";

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
  title?: string;
  email: string;
  phone?: string;

  salesStage: SalesStage;
  paymentStatus: PaymentStatus;
  retainerStatus: RetainerStatus;

  totalPaid: number; // USD
  createdAt: string; // MM/DD/YYYY (dummy for now)

  // drawer extras
  services?: string[];
};

function formatUSD(amount: number) {
  // ✅ "$ 12,500" format (with commas)
  const n = Math.round(Number(amount || 0));
  return `$ ${n.toLocaleString("en-US")}`;
}

const KEY_ACCOUNT_THRESHOLD = 1000;

export default function KeyAccountsPage() {
  // Dummy data (same style as All Clients). Replace later with Firestore.
  const allClients: ClientRecord[] = [
    {
      id: "c_001",
      companyName: "Brightwood Press",
      website: "brightwoodpress.com",
      industry: "Publishing",
      country: "United States",
      timezone: "America/New_York",
      contactName: "Jennifer Lanzetti",
      title: "Founder / CEO",
      email: "jennifer@brightwoodpress.com",
      phone: "+1 646 555 0101",
      salesStage: "Closed Won",
      paymentStatus: "Paid",
      retainerStatus: "Active",
      totalPaid: 12000,
      createdAt: "11/19/2025",
      services: ["Website Design", "SEO Retainer", "Branding"],
    },
    {
      id: "c_002",
      companyName: "Zenora Dental Group",
      website: "zenoradental.com",
      industry: "Healthcare",
      country: "United States",
      timezone: "America/Chicago",
      contactName: "Hassan Raza",
      title: "Owner",
      email: "hassan@zenoradental.com",
      phone: "+1 213 555 0120",
      salesStage: "Closed Won",
      paymentStatus: "Paid",
      retainerStatus: "Active",
      totalPaid: 18500,
      createdAt: "10/28/2025",
      services: ["SEO Retainer", "SMM Retainer"],
    },
    {
      id: "c_003",
      companyName: "Nova Fitness Studio",
      website: "novafitness.com",
      industry: "Fitness",
      country: "United Kingdom",
      timezone: "Europe/London",
      contactName: "Areeba Khan",
      title: "Manager",
      email: "areeba@novafitness.com",
      phone: "+44 20 7946 0958",
      salesStage: "Contacted",
      paymentStatus: "Unpaid",
      retainerStatus: "None",
      totalPaid: 0,
      createdAt: "12/09/2025",
      services: ["Social Media Marketing"],
    },
  ];

  const [query, setQuery] = useState("");
  const [activeClientId, setActiveClientId] = useState<string | null>(null);

  // ✅ Key Accounts = Total Paid >= $1,000
  const keyAccounts = useMemo(() => {
    return allClients.filter((c) => (c.totalPaid || 0) >= KEY_ACCOUNT_THRESHOLD);
  }, [allClients]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return keyAccounts;
    return keyAccounts.filter((c) => {
      const blob = [
        c.companyName,
        c.contactName,
        c.email,
        c.phone,
        c.paymentStatus,
        c.salesStage,
        c.retainerStatus,
        (c.services || []).join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [keyAccounts, query]);

  const activeClient = useMemo(() => {
    if (!activeClientId) return null;
    return keyAccounts.find((c) => c.id === activeClientId) || null;
  }, [activeClientId, keyAccounts]);

  // ✅ Use the SAME “enterprise table + grey surfaces” pattern:
  // - light: white/neutral
  // - dark: neutral charcoal/grey (NOT blue)
  // Drawer: fixed + overlay (so it NEVER dumps under the table)
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-[color:var(--sidebar-text)]">Key Accounts</h2>
        <p className="mt-1 text-sm text-[color:var(--sidebar-muted)]">
          High-value clients (revenue-based). Key Account = <b>Total Paid ≥ $ 1,000</b>.
        </p>
      </div>

      {/* Search (locked pattern: “Search keyword”) */}
      <div className="max-w-sm">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search keyword"
          className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] px-4 py-2 text-sm text-[color:var(--text)] placeholder:text-[color:var(--muted)] focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left">
            <thead className="bg-[color:var(--panel-2)]">
              <tr className="text-xs font-semibold tracking-wide text-[color:var(--muted)]">
                <th className="px-5 py-3">COMPANY</th>
                <th className="px-5 py-3">CONTACT</th>
                <th className="px-5 py-3">EMAIL</th>
                <th className="px-5 py-3">PHONE</th>
                <th className="px-5 py-3">PAYMENT</th>
                <th className="px-5 py-3">TOTAL PAID</th>
                <th className="px-5 py-3">CREATED</th>
                <th className="px-5 py-3 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="border-t border-[color:var(--border)] text-sm text-[color:var(--text)] hover:bg-[color:var(--rowHover)]"
                >
                  <td className="px-5 py-4 font-medium">{c.companyName}</td>
                  <td className="px-5 py-4">{c.contactName}</td>
                  <td className="px-5 py-4">{c.email}</td>
                  <td className="px-5 py-4">{c.phone || "—"}</td>
                  <td className="px-5 py-4">{c.paymentStatus}</td>
                  <td className="px-5 py-4 font-semibold">{formatUSD(c.totalPaid)}</td>
                  <td className="px-5 py-4">{c.createdAt}</td>
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => setActiveClientId(c.id)}
                      className="inline-flex items-center justify-center rounded-md border border-[color:var(--border)] bg-transparent px-4 py-2 text-sm font-medium text-[color:var(--text)] hover:bg-[color:var(--panel-2)]"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr className="border-t border-[color:var(--border)]">
                  <td className="px-5 py-10 text-center text-sm text-[color:var(--muted)]" colSpan={8}>
                    No key accounts found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer (fixed + overlay; consistent enterprise behavior) */}
      {activeClient && (
        <div className="fixed inset-0 z-[60]">
          {/* Overlay */}
          <button
            type="button"
            aria-label="Close"
            onClick={() => setActiveClientId(null)}
            className="absolute inset-0 bg-black/50"
          />

          {/* Panel */}
          <div className="absolute right-0 top-0 h-full w-full sm:w-[520px] bg-[color:var(--panel)] border-l border-[color:var(--border)] shadow-xl">
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-3 border-b border-[color:var(--border)] px-6 py-5">
                <div>
                  <div className="text-lg font-semibold text-[color:var(--text)]">{activeClient.companyName}</div>
                  <div className="text-sm text-[color:var(--muted)]">{activeClient.email}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveClientId(null)}
                  className="rounded-md border border-[color:var(--border)] px-3 py-2 text-sm font-medium text-[color:var(--text)] hover:bg-[color:var(--panel-2)]"
                >
                  Close
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                <section className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel-2)] p-4">
                  <h4 className="text-xs font-semibold tracking-wide text-[color:var(--muted)]">SUMMARY</h4>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[color:var(--muted)]">Sales Stage</span>
                      <span className="text-right text-[color:var(--text)]">{activeClient.salesStage}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[color:var(--muted)]">Payment Status</span>
                      <span className="text-right text-[color:var(--text)]">{activeClient.paymentStatus}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[color:var(--muted)]">Retainer Status</span>
                      <span className="text-right text-[color:var(--text)]">{activeClient.retainerStatus}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[color:var(--muted)]">Total Paid (USD)</span>
                      <span className="text-right font-semibold text-[color:var(--text)]">
                        {formatUSD(activeClient.totalPaid)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[color:var(--muted)]">Services</span>
                      <span className="text-right text-[color:var(--text)]">
                        {activeClient.services?.length ? `${activeClient.services.length} services` : "—"}
                      </span>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel-2)] p-4">
                  <h4 className="text-xs font-semibold tracking-wide text-[color:var(--muted)]">COMPANY</h4>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[color:var(--muted)]">Website</span>
                      <span className="text-right text-[color:var(--text)]">{activeClient.website || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[color:var(--muted)]">Industry</span>
                      <span className="text-right text-[color:var(--text)]">{activeClient.industry || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[color:var(--muted)]">Country</span>
                      <span className="text-right text-[color:var(--text)]">{activeClient.country || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[color:var(--muted)]">Timezone</span>
                      <span className="text-right text-[color:var(--text)]">{activeClient.timezone || "—"}</span>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel-2)] p-4">
                  <h4 className="text-xs font-semibold tracking-wide text-[color:var(--muted)]">CONTACT</h4>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[color:var(--muted)]">Contact</span>
                      <span className="text-right text-[color:var(--text)]">{activeClient.contactName}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[color:var(--muted)]">Email</span>
                      <span className="text-right text-[color:var(--text)]">{activeClient.email}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[color:var(--muted)]">Phone</span>
                      <span className="text-right text-[color:var(--text)]">{activeClient.phone || "—"}</span>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Local tokens (kept inside this page to avoid changing global theme files) */}
      <style jsx global>{`
        :root {
          --text: #0f172a;
          --muted: #64748b;
          --border: rgba(15, 23, 42, 0.10);
          --panel: #ffffff;
          --panel-2: #f8fafc;
          --rowHover: rgba(15, 23, 42, 0.03);
        }
        .dark :root,
        .dark {
          --text: rgba(255, 255, 255, 0.92);
          --muted: rgba(255, 255, 255, 0.60);
          --border: rgba(255, 255, 255, 0.10);
          --panel: #0b0f16;     /* neutral charcoal (matches your table standard) */
          --panel-2: #111827;   /* slightly lighter grey panel */
          --rowHover: rgba(255, 255, 255, 0.04);
        }
      `}</style>
    </div>
  );
}
