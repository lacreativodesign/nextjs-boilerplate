"use client";

import { useMemo, useState } from "react";

type PaymentStatus = "Unpaid" | "Partially Paid" | "Paid";
type RetainerStatus = "None" | "Active" | "Paused" | "Cancelled";

type ClientRecord = {
  id: string;
  company: string;
  contact: string;
  email: string;
  phone: string;
  country?: string;
  paymentStatus: PaymentStatus;
  totalPaid: number; // USD
  createdAt: string; // MM/DD/YYYY (dummy)
  services: string[]; // tags
  salesOwner?: string;
  accountManager?: string;
  productionOwner?: string;
  retainerStatus?: RetainerStatus;
  notes?: string;
};

function formatUSD(amount: number) {
  const n = Number.isFinite(amount) ? amount : 0;
  return `$ ${n.toLocaleString("en-US")}`;
}

export default function KeyAccountsPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ClientRecord | null>(null);

  // ✅ Dummy data (same “enterprise” style as All Clients)
  const allClients: ClientRecord[] = useMemo(
    () => [
      {
        id: "c_1001",
        company: "Brightwood Press",
        contact: "Jennifer Lanzetti",
        email: "jennifer@brightwoodpress.com",
        phone: "+1 646 555 0101",
        country: "United States",
        paymentStatus: "Paid",
        totalPaid: 12000,
        createdAt: "11/19/2025",
        services: ["Branding", "Website Design", "SEO Retainer"],
        salesOwner: "Mansoor (Sales)",
        accountManager: "Sarah (AM)",
        productionOwner: "Ayesha (Prod)",
        retainerStatus: "Active",
        notes: "High-value client. Retainer ongoing. Priority delivery.",
      },
      {
        id: "c_1002",
        company: "ACME Trading LLC",
        contact: "Bilal Ahmed",
        email: "bilal@acme.com",
        phone: "+1 312 555 0199",
        country: "United States",
        paymentStatus: "Partially Paid",
        totalPaid: 2500,
        createdAt: "12/01/2025",
        services: ["Website Design", "SEO Retainer"],
        salesOwner: "Mansoor (Sales)",
        accountManager: "Sarah (AM)",
        productionOwner: "Ayesha (Prod)",
        retainerStatus: "Active",
        notes: "Upsell in progress. Follow-up scheduled.",
      },
      {
        id: "c_1003",
        company: "Nova Fitness Studio",
        contact: "Areeba Khan",
        email: "areeba@novafitness.com",
        phone: "+44 20 7946 0958",
        country: "United Kingdom",
        paymentStatus: "Unpaid",
        totalPaid: 0,
        createdAt: "12/09/2025",
        services: ["Social Media Marketing"],
        salesOwner: "Junaid (Sales)",
        accountManager: "—",
        productionOwner: "—",
        retainerStatus: "None",
        notes: "Lead is valuable. Needs follow-up + proposal.",
      },
      {
        id: "c_1004",
        company: "Zenora Dental Group",
        contact: "Hassan Raza",
        email: "hassan@zenoradental.com",
        phone: "+1 213 555 0120",
        country: "United States",
        paymentStatus: "Paid",
        totalPaid: 18500,
        createdAt: "10/28/2025",
        services: ["Website Design", "SEO Retainer", "SMM Retainer"],
        salesOwner: "Mansoor (Sales)",
        accountManager: "Sarah (AM)",
        productionOwner: "Ayesha (Prod)",
        retainerStatus: "Active",
        notes: "Key Account: strong revenue + multiple retainers.",
      },
    ],
    []
  );

  // ✅ Key Accounts logic (revenue-based)
  const keyAccounts = useMemo(() => {
    const HIGH_VALUE_THRESHOLD = 10000; // future-safe baseline
    return allClients.filter((c) => c.totalPaid >= HIGH_VALUE_THRESHOLD);
  }, [allClients]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return keyAccounts;

    return keyAccounts.filter((c) => {
      const hay = [
        c.company,
        c.contact,
        c.email,
        c.phone,
        c.paymentStatus,
        c.salesOwner ?? "",
        c.accountManager ?? "",
        c.productionOwner ?? "",
        (c.services || []).join(" "),
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [search, keyAccounts]);

  return (
    <div style={{ padding: "24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>
          Key Accounts
        </h1>
        <p style={{ opacity: 0.75, margin: 0 }}>
          High-value clients (revenue-based). Track ownership, payment, services,
          and retainers — enterprise grade.
        </p>
      </div>

      {/* Search (same behavior as Users / All Clients) */}
      <div style={{ margin: "14px 0 18px 0" }}>
        <input
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search keyword"
          style={{ width: 320, maxWidth: "100%" }}
        />
      </div>

      {/* Table (kept compact to avoid horizontal scroll issues) */}
      <div className="tableWrap">
        <div className="tableCard">
          <div className="tableScroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Contact</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Payment</th>
                  <th>Total Paid</th>
                  <th>Created</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>

              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: 16, opacity: 0.75 }}>
                      No key accounts found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 700 }}>{c.company}</td>
                      <td>{c.contact}</td>
                      <td>{c.email}</td>
                      <td>{c.phone}</td>
                      <td>{c.paymentStatus}</td>
                      <td style={{ fontWeight: 700 }}>{formatUSD(c.totalPaid)}</td>
                      <td>{c.createdAt}</td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          className="btnOutline"
                          onClick={() => setSelected(c)}
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
      </div>

      {/* Drawer */}
      {selected && (
        <div className="drawerOverlay" onClick={() => setSelected(null)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawerHeader">
              <div>
                <div className="drawerTitle">{selected.company}</div>
                <div className="drawerSub">
                  {selected.email} · {selected.phone}
                </div>
              </div>

              <button className="btnOutline" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>

            <div className="drawerBody">
              <div className="drawerGrid">
                <div className="drawerItem">
                  <div className="drawerLabel">Contact</div>
                  <div className="drawerValue">{selected.contact}</div>
                </div>

                <div className="drawerItem">
                  <div className="drawerLabel">Country</div>
                  <div className="drawerValue">{selected.country ?? "—"}</div>
                </div>

                <div className="drawerItem">
                  <div className="drawerLabel">Payment Status</div>
                  <div className="drawerValue">{selected.paymentStatus}</div>
                </div>

                <div className="drawerItem">
                  <div className="drawerLabel">Total Paid (USD)</div>
                  <div className="drawerValue">{formatUSD(selected.totalPaid)}</div>
                </div>

                <div className="drawerItem">
                  <div className="drawerLabel">Retainer Status</div>
                  <div className="drawerValue">{selected.retainerStatus ?? "—"}</div>
                </div>

                <div className="drawerItem">
                  <div className="drawerLabel">Services</div>
                  <div className="drawerValue">
                    {selected.services?.length ? selected.services.join(" · ") : "—"}
                  </div>
                </div>

                <div className="drawerItem">
                  <div className="drawerLabel">Sales Owner</div>
                  <div className="drawerValue">{selected.salesOwner ?? "—"}</div>
                </div>

                <div className="drawerItem">
                  <div className="drawerLabel">Account Manager</div>
                  <div className="drawerValue">{selected.accountManager ?? "—"}</div>
                </div>

                <div className="drawerItem">
                  <div className="drawerLabel">Production Owner</div>
                  <div className="drawerValue">{selected.productionOwner ?? "—"}</div>
                </div>

                <div className="drawerItem" style={{ gridColumn: "1 / -1" }}>
                  <div className="drawerLabel">Notes</div>
                  <div className="drawerValue">{selected.notes ?? "—"}</div>
                </div>
              </div>
            </div>

            {/* 🚫 No Edit button here YET (we’ll add Edit in the NEXT step) */}
          </div>
        </div>
      )}
    </div>
  );
}
