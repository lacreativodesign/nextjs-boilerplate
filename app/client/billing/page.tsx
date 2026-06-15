"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { SmartSearchBar } from "@/components/search/SmartSearchBar";
import { smartMatch } from "@/lib/search/smartMatch";

type InvoiceRecord = {
  id: string;
  orderId: string;
  status: string;
  amountUsd: number;
  dueDate: string | null;
  createdAt: string | null;
  issuedAt?: string | null;
  paidAt?: string | null;
};

type InvoiceDetail = {
  id: string;
  orderId: string;
  status: string;
  amountSubtotalUsd: number;
  amountTaxUsd: number;
  amountTotalUsd: number;
  dueDate: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  lineItems: Array<{ name?: string; qty?: number; unitPriceUsd?: number }>;
  notes: string | null;
};

type PaymentRecord = {
  id: string;
  orderId?: string | null;
  status?: string | null;
  amountUsd?: number | null;
  paidAt?: string | null;
  createdAt?: string | null;
  receiptUrl?: string | null;
  method?: string | null;
};

type ChangeRequestRecord = {
  id: string;
  title?: string | null;
  status?: string | null;
  costUsd?: number | null;
  createdAt?: string | null;
};


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
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function safeLower(s?: string | null) {
  return String(s || "").toLowerCase().trim();
}

export default function ClientBillingPage() {

  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequestRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const headerCellStyle = {
    padding: "12px 14px",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border-subtle)",
    whiteSpace: "nowrap" as const,
    textAlign: "left" as const,
  };

  const cellStyle = {
    padding: "12px 14px",
    borderBottom: "1px dashed var(--border-subtle)",
    color: "var(--text-primary)",
    whiteSpace: "nowrap" as const,
    fontWeight: 400,
  };

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [invResS, payResS, crResS] = await Promise.allSettled([
          apiFetch("/api/client/billing/invoices/list", { cache: "no-store" }),
          apiFetch("/api/payments/history", { cache: "no-store" }),
          apiFetch("/api/client/change-requests/list", { cache: "no-store" }),
        ]);

        if (!alive) return;

        // Invoices are required
        if (invResS.status !== "fulfilled") throw new Error("Unable to load invoices.");
        const invRes = invResS.value;
        const invPayload = await invRes.json();
        if (!invRes.ok || !invPayload?.ok) throw new Error(invPayload?.error || "Unable to load invoices.");

        const invList: InvoiceRecord[] = invPayload?.invoices || [];

        // Payments are optional
        let payList: PaymentRecord[] = [];
        if (payResS.status === "fulfilled") {
          const payRes = payResS.value;
          try {
            const payPayload = await payRes.json();
            if (payRes.ok && payPayload?.ok) payList = payPayload?.payments || [];
          } catch {
            // ignore
          }
        }

        // Change requests are optional
        let crList: ChangeRequestRecord[] = [];
        if (crResS.status === "fulfilled") {
          const crRes = crResS.value;
          try {
            const crPayload = await crRes.json();
            if (crRes.ok && crPayload?.ok) crList = crPayload?.requests || crPayload?.changeRequests || [];
          } catch {
            // ignore
          }
        }

        setInvoices(invList);
        setPayments(payList);
        setChangeRequests(crList);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || "Unable to load billing.");
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

  const stats = useMemo(() => {
    const unpaid = invoices.filter((i) => safeLower(i.status) !== "paid");
    const outstandingUsd = unpaid.reduce((sum, i) => sum + Number(i.amountUsd || 0), 0);

    const pendingApprovals = changeRequests.filter((cr) => {
      const st = safeLower(cr.status);
      return st.includes("pending") && (st.includes("client") || st === "pending");
    }).length;

    const paidInvoices = invoices.filter((i) => safeLower(i.status) === "paid").length;

    return { outstandingUsd, pendingApprovals, paidInvoices };
  }, [invoices, changeRequests]);

  const filteredInvoices = useMemo(
    () => smartMatch(invoices, search, (invoice) => [invoice.orderId, invoice.status]),
    [invoices, search]
  );

  const openDrawer = async (invoice: InvoiceRecord) => {
    setDrawerOpen(true);
    setDetailLoading(true);
    setDetail(null);

    try {
      const res = await apiFetch(`/api/client/billing/invoices/get?id=${invoice.id}`, {
        cache: "no-store",
      });
      const payload = await res.json();
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || "Unable to load invoice.");
      setDetail(payload.invoice || null);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setDetail(null);
    setCheckoutError(null);
  };

  const startPayment = async (invoiceId: string) => {
    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      const res = await apiFetch("/api/payments/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.ok || !payload?.checkoutUrl) {
        throw new Error(payload?.error || "Unable to start payment.");
      }
      window.location.href = payload.checkoutUrl;
    } catch (err: any) {
      setCheckoutError(err?.message || "Unable to start payment.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Billing</h1>
        <p className="page-subtitle">View invoice status, outstanding balances, and payment history.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-4">
          <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Outstanding Balance</div>
          <div className="mt-2 text-2xl font-extrabold">{fmtMoney(stats.outstandingUsd)}</div>
          <div className="mt-1 text-sm text-[var(--text-muted)]">Unpaid invoices total</div>
        </div>

        <div className="card p-4">
          <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Pending Approvals</div>
          <div className="mt-2 text-2xl font-extrabold">{stats.pendingApprovals}</div>
          <div className="mt-1 text-sm text-[var(--text-muted)]">Change requests waiting on you</div>
          <div className="mt-3">
            <a className="btn ghost" href="/client/change-requests" style={{ borderRadius: 999 }}>
              Review
            </a>
          </div>
        </div>

        <div className="card p-4">
          <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Paid Invoices</div>
          <div className="mt-2 text-2xl font-extrabold">{stats.paidInvoices}</div>
          <div className="mt-1 text-sm text-[var(--text-muted)]">All-time paid count</div>
        </div>
      </div>

      <div className="card p-4">
        <SmartSearchBar value={search} onChange={setSearch} placeholder="Search invoice keyword" />
      </div>

      <div className="table-shell">
        {loading ? (
          <div className="p-4 text-sm text-[var(--text-muted)]">Loading invoices...</div>
        ) : error ? (
          <div className="p-4 text-sm text-red-400">{error}</div>
        ) : filteredInvoices.length === 0 ? (
          <div className="p-4 text-sm text-[var(--text-muted)]">No invoices found.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ minWidth: 860 }}>
              <thead>
                <tr>
                  <th style={headerCellStyle}>Invoice</th>
                  <th style={headerCellStyle}>Status</th>
                  <th style={{ ...headerCellStyle, textAlign: "right" }}>Amount (USD)</th>
                  <th style={{ ...headerCellStyle, textAlign: "right" }}>Due Date</th>
                  <th style={{ ...headerCellStyle, textAlign: "right" }}>Created</th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((invoice) => {
                  return (
                    <tr key={invoice.id} >
                      <td style={cellStyle}>{invoice.orderId || "-"}</td>
                      <td style={cellStyle}>{invoice.status || "-"}</td>
                      <td style={{ ...cellStyle, textAlign: "right" }}>{fmtMoney(invoice.amountUsd || 0)}</td>
                      <td style={{ ...cellStyle, textAlign: "right" }}>{fmtDate(invoice.dueDate)}</td>
                      <td style={{ ...cellStyle, textAlign: "right" }}>{fmtDate(invoice.createdAt)}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        <button className="btn ghost" style={{ borderRadius: 999 }} onClick={() => openDrawer(invoice)}>
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {payments.length > 0 && (
        <div className="table-shell">
          <div className="p-4">
            <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Payment History</div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ minWidth: 860 }}>
              <thead>
                <tr>
                  <th style={headerCellStyle}>Order</th>
                  <th style={headerCellStyle}>Status</th>
                  <th style={headerCellStyle}>Method</th>
                  <th style={{ ...headerCellStyle, textAlign: "right" }}>Amount</th>
                  <th style={{ ...headerCellStyle, textAlign: "right" }}>Paid</th>
                  <th style={{ ...headerCellStyle, textAlign: "right" }}>Created</th>
                  <th style={{ ...headerCellStyle, textAlign: "center" }}>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {payments.slice(0, 50).map((p) => {
                  return (
                    <tr key={p.id} >
                      <td style={cellStyle}>{p.orderId || "-"}</td>
                      <td style={cellStyle}>{p.status || "-"}</td>
                      <td style={cellStyle}>{p.method || "-"}</td>
                      <td style={{ ...cellStyle, textAlign: "right" }}>{fmtMoney(Number(p.amountUsd || 0))}</td>
                      <td style={{ ...cellStyle, textAlign: "right" }}>{fmtDate(p.paidAt)}</td>
                      <td style={{ ...cellStyle, textAlign: "right" }}>{fmtDate(p.createdAt)}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        {p.receiptUrl ? (
                          <a className="btn ghost" style={{ borderRadius: 999 }} href={p.receiptUrl} target="_blank" rel="noreferrer">
                            Download
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {drawerOpen && (
        <div className="drawer-overlay" onClick={closeDrawer}>
          <div className="drawer-panel drawer-panel--md" onClick={(e) => e.stopPropagation()}>
            {detailLoading || !detail ? (
              <div className="text-sm text-[var(--text-muted)]">Loading invoice...</div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>Invoice {detail.orderId}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Status · {detail.status}</div>
                  </div>
                  <button className="btn ghost" onClick={closeDrawer} style={{ height: 34, borderRadius: 999 }}>
                    Close
                  </button>
                </div>

                <div style={{ height: 16 }} />

                <div className="card p-4">
                  <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Summary</div>
                  <div className="mt-3 grid gap-3">
                    <Row label="Subtotal" value={fmtMoney(detail.amountSubtotalUsd)} />
                    <Row label="Tax" value={fmtMoney(detail.amountTaxUsd)} />
                    <Row label="Total" value={fmtMoney(detail.amountTotalUsd)} />
                    <Row label="Due Date" value={fmtDate(detail.dueDate)} />
                    <Row label="Issued" value={fmtDate(detail.issuedAt)} />
                    <Row label="Paid" value={detail.paidAt ? fmtDate(detail.paidAt) : "Payment Pending"} />
                  </div>
                </div>

                <div style={{ height: 12 }} />

                <div className="card p-4">
                  <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Line Items</div>
                  <div className="mt-3 grid gap-2">
                    {detail.lineItems?.length ? (
                      detail.lineItems.map((item, index) => (
                        <div key={`${item.name || "item"}-${index}`} className="flex items-center justify-between text-sm">
                          <div>
                            <div style={{ fontWeight: 600 }}>{item.name || "Item"}</div>
                            <div style={{ fontSize: 12, opacity: 0.7 }}>
                              Qty {item.qty || 1} · {fmtMoney(Number(item.unitPriceUsd || 0))}
                            </div>
                          </div>
                          <div style={{ fontWeight: 600 }}>
                            {fmtMoney(Number(item.qty || 1) * Number(item.unitPriceUsd || 0))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-[var(--text-muted)]">No line items provided.</div>
                    )}
                  </div>
                </div>

                <div style={{ height: 12 }} />

                <div className="card p-4">
                  <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Payment</div>
                  <p className="text-sm mt-2 text-[var(--text-muted)]">
                    {safeLower(detail.status) === "paid"
                      ? "Payment received. Receipt details will be emailed to you."
                      : "Pay this invoice securely via Stripe Checkout."}
                  </p>
                  {safeLower(detail.status) !== "paid" && (
                    <div className="mt-3">
                      <button
                        className="btn"
                        style={{ borderRadius: 999 }}
                        disabled={checkoutLoading}
                        onClick={() => startPayment(detail.id)}
                      >
                        {checkoutLoading ? "Redirecting to Stripe..." : "Pay invoice"}
                      </button>
                    </div>
                  )}
                  {checkoutError && <p className="mt-2 text-sm text-red-400">{checkoutError}</p>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}
