"use client";

import { useEffect, useState } from "react";

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
  status: string;
  amountUsd: number;
  method: string;
  paidAt: string | null;
  createdAt: string | null;
  orderId?: string | null;
};

type ChangeRequestRecord = {
  id: string;
  title: string;
  status: string;
  estimatedCost: number | null;
  estimatedTimelineDays: number | null;
};

function useIsSystemDark() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const read = () => setIsDark(!!mql.matches);
    read();
    // @ts-expect-error older browsers
    mql.addEventListener ? mql.addEventListener("change", read) : mql.addListener(read);
    return () => {
      // @ts-expect-error older browsers
      mql.removeEventListener ? mql.removeEventListener("change", read) : mql.removeListener(read);
    };
  }, []);

  return isDark;
}

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

export default function ClientBillingPage() {
  const isDark = useIsSystemDark();
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const headerCellStyle: React.CSSProperties = {
    padding: "12px 14px",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: isDark ? "rgba(226,232,240,0.66)" : "rgba(15,23,42,0.55)",
    borderBottom: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.10)",
    whiteSpace: "nowrap",
    textAlign: "left",
  };

  const cellStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderBottom: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px dashed rgba(15,23,42,0.10)",
    color: isDark ? "rgba(226,232,240,0.86)" : "rgba(15,23,42,0.85)",
    whiteSpace: "nowrap",
    fontWeight: 400,
  };

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [invoiceRes, paymentRes, changeRequestRes] = await Promise.all([
          fetch("/api/client/billing/invoices/list", { credentials: "include", cache: "no-store" }),
          fetch("/api/client/billing/payments/list", { credentials: "include", cache: "no-store" }),
          fetch("/api/client/change-requests/list", { credentials: "include", cache: "no-store" }),
        ]);
        const payload = await invoiceRes.json();
        const paymentPayload = await paymentRes.json();
        const changeRequestPayload = await changeRequestRes.json();
        if (!invoiceRes.ok || !payload?.ok) throw new Error(payload?.error || "Unable to load invoices.");
        if (!alive) return;
        setInvoices(payload.invoices || []);
        setPayments(paymentPayload?.payments || []);
        setChangeRequests(changeRequestPayload?.changeRequests || []);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || "Unable to load invoices.");
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

  const openDrawer = async (invoice: InvoiceRecord) => {
    setDrawerOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await fetch(`/api/client/billing/invoices/get?id=${invoice.id}`, {
        credentials: "include",
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
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Billing</h1>
        <p className="page-subtitle">View invoice status, outstanding balances, and payment history.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-4">
          <div className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">Outstanding Balance</div>
          <div className="mt-2 text-2xl font-semibold">
            {fmtMoney(
              invoices.reduce((sum, invoice) => {
                if (["Paid", "Void"].includes(invoice.status)) return sum;
                return sum + Number(invoice.amountUsd || 0);
              }, 0)
            )}
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1">Open invoices requiring payment</p>
        </div>
        <div className="card p-4 md:col-span-2">
          <div className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">Pending approvals</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="card p-3">
              <div className="text-xs text-[var(--text-muted)]">Change requests</div>
              <div className="mt-1 text-lg font-semibold">
                {changeRequests.filter((request) => [\"Submitted\", \"In Review\"].includes(request.status)).length}
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-1">Awaiting your decision</p>
            </div>
            <div className="card p-3">
              <div className="text-xs text-[var(--text-muted)]">Invoices due</div>
              <div className="mt-1 text-lg font-semibold">
                {
                  invoices.filter((invoice) => !["Paid", "Void"].includes(invoice.status)).length
                }
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-1">Pending payments</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <input className="input" placeholder="Search keyword" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card table-shell">
        {loading ? (
          <div className="p-4 text-sm text-[var(--text-muted)]">Loading invoices...</div>
        ) : error ? (
          <div className="p-4 text-sm text-red-400">{error}</div>
        ) : invoices.length === 0 ? (
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
                {invoices
                  .filter((invoice) => {
                    const q = search.trim().toLowerCase();
                    if (!q) return true;
                    const hay = [invoice.orderId, invoice.status].filter(Boolean).join(" ").toLowerCase();
                    return hay.includes(q);
                  })
                  .map((invoice, idx) => {
                    const rowBg = isDark
                      ? idx % 2 === 0
                        ? "rgba(255,255,255,0.015)"
                        : "rgba(255,255,255,0.00)"
                      : idx % 2 === 0
                      ? "rgba(15,23,42,0.015)"
                      : "rgba(15,23,42,0.00)";
                    return (
                      <tr key={invoice.id} style={{ background: rowBg }}>
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

      <div className="card table-shell">
        <div className="p-4 border-b border-slate-200/40">
          <div className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">Payments</div>
        </div>
        {loading ? (
          <div className="p-4 text-sm text-[var(--text-muted)]">Loading payments...</div>
        ) : payments.length === 0 ? (
          <div className="p-4 text-sm text-[var(--text-muted)]">No payments found.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={headerCellStyle}>Status</th>
                  <th style={headerCellStyle}>Method</th>
                  <th style={{ ...headerCellStyle, textAlign: "right" }}>Amount</th>
                  <th style={{ ...headerCellStyle, textAlign: "right" }}>Paid</th>
                  <th style={{ ...headerCellStyle, textAlign: "right" }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment, idx) => {
                  const rowBg = isDark
                    ? idx % 2 === 0
                      ? "rgba(255,255,255,0.015)"
                      : "rgba(255,255,255,0.00)"
                    : idx % 2 === 0
                    ? "rgba(15,23,42,0.015)"
                    : "rgba(15,23,42,0.00)";
                  return (
                    <tr key={payment.id} style={{ background: rowBg }}>
                      <td style={cellStyle}>{payment.status}</td>
                      <td style={cellStyle}>{payment.method}</td>
                      <td style={{ ...cellStyle, textAlign: "right" }}>{fmtMoney(payment.amountUsd)}</td>
                      <td style={{ ...cellStyle, textAlign: "right" }}>{fmtDate(payment.paidAt)}</td>
                      <td style={{ ...cellStyle, textAlign: "right" }}>{fmtDate(payment.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
                    {detail.lineItems.length ? (
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
                    {detail.status?.toLowerCase() === "paid"
                      ? "Payment received. Receipt details will be emailed to you."
                      : "Payment Pending — our team will follow up with next steps."}
                  </p>
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
