"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Period = "7d" | "30d" | "90d" | "12m";

type TerminalResponse = {
  ok: boolean;
  connected: boolean;
  message?: string;
  metrics?: {
    totalRevenue: number;
    totalFees: number;
    netRevenue: number;
    totalRefunded: number;
    thisMonthRevenue: number;
    thisMonthFees: number;
    transactionCount: number;
    failedCount: number;
  };
  balance?: {
    available: Array<{ amount: number; currency: string }>;
    pending: Array<{ amount: number; currency: string }>;
  };
  transactions?: Array<{
    id: string;
    amount: number;
    amountRefunded: number;
    currency: string;
    status: string;
    platformFee: number;
    netAmount: number;
    description: string | null;
    customerEmail: string | null;
    invoiceId: string | null;
    clientId: string | null;
    createdAt: string;
    receiptUrl: string | null;
    refunded: boolean;
  }>;
  payouts?: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    arrivalDate: string;
    description: string | null;
    createdAt: string;
  }>;
  disputes?: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    reason: string;
    chargeId: string;
    createdAt: string;
    dueBy: string | null;
  }>;
  connectStatus?: {
    businessName: string | null;
    email: string | null;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
  };
};

type SummaryResponse = {
  ok: boolean;
  period: Period;
  chartData: Array<{ date: string; revenue: number; fees: number; count: number }>;
  totals: { revenue: number; fees: number; netRevenue: number; transactionCount: number };
};

type TerminalTransaction = NonNullable<TerminalResponse["transactions"]>[number];

const PERIODS: Period[] = ["7d", "30d", "90d", "12m"];

const usdFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatMoney(value: number) {
  return usdFormatter.format(value || 0);
}

function formatDate(iso: string) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "-";
  return dateFormatter.format(dt);
}

function getTransactionStatus(transaction: TerminalTransaction) {
  if (transaction.refunded || transaction.amountRefunded > 0) return "refunded";
  return transaction.status;
}

function statusClass(status: string) {
  if (status === "succeeded" || status === "paid") return "bg-emerald-100 text-emerald-800";
  if (status === "failed") return "bg-red-100 text-red-800";
  if (status === "refunded" || status === "pending") return "bg-amber-100 text-amber-800";
  if (status === "in_transit") return "bg-blue-100 text-blue-800";
  return "bg-[var(--surface-muted)] text-[var(--text-muted)]";
}

export default function BillingTerminalPage() {
  const [data, setData] = useState<TerminalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("30d");
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "succeeded" | "failed" | "refunded">("all");
  const [page, setPage] = useState(1);

  const loadTerminal = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/billing/terminal", { cache: "no-store", credentials: "include" });
      const json = (await res.json()) as TerminalResponse;
      if (!res.ok || !json.ok) {
        setError("Unable to load payment terminal data.");
        return;
      }
      setData(json);
    } catch {
      setError("Unable to load payment terminal data.");
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async (nextPeriod: Period) => {
    try {
      setSummaryLoading(true);
      setSummaryError(null);
      const res = await fetch(`/api/billing/terminal/summary?period=${nextPeriod}`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = (await res.json()) as SummaryResponse;
      if (!res.ok || !json.ok) {
        setSummaryError("Unable to load revenue summary.");
        return;
      }
      setSummary(json);
    } catch {
      setSummaryError("Unable to load revenue summary.");
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    void loadTerminal();
    void loadSummary("30d");
  }, []);

  const transactions = data?.transactions || [];
  const filteredTransactions = useMemo(() => {
    const term = query.trim().toLowerCase();
    return transactions.filter((item) => {
      const derivedStatus = getTransactionStatus(item);
      const statusMatch = filter === "all" ? true : derivedStatus === filter;
      const textMatch =
        !term || item.customerEmail?.toLowerCase().includes(term) || item.invoiceId?.toLowerCase().includes(term);
      return Boolean(statusMatch && textMatch);
    });
  }, [transactions, query, filter]);

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedTransactions = filteredTransactions.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const availableBalance = data?.balance?.available?.[0] || { amount: 0, currency: "usd" };
  const pendingBalance = data?.balance?.pending?.[0] || { amount: 0, currency: "usd" };

  return (
    <div className="space-y-6">
      <div className="tabs-bar">
        <Link href="/billing" className="tab-pill">Subscription</Link>
        <Link href="/billing/invoices" className="tab-pill">Invoice History</Link>
        <Link href="/billing/terminal" className="tab-pill active">Payment Terminal</Link>
      </div>

      <div className="mb-6">
        <h1 className="page-title">Payment Terminal</h1>
        <p className="page-subtitle">Your client payment activity, payouts, and revenue summary.</p>
      </div>

      {error && (
        <div className="card border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>{error}</p>
          <button className="btn btn-danger mt-3" onClick={() => void loadTerminal()}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="kpis">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="card h-28 skeleton-shimmer" />
          ))}
        </div>
      ) : data?.connected === false ? (
        <section className="card mx-auto max-w-xl text-center">
          <div className="text-4xl">💳</div>
          <h2 className="mt-4 section-title">Connect Stripe to Accept Payments</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            You haven&apos;t connected a Stripe account yet. Connect your account to start accepting payments from your
            clients.
          </p>
          <Link href="/settings/payments" className="btn mt-5 inline-flex">
            Connect Stripe Account
          </Link>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            A 0.5% platform handling fee applies to all transactions.
          </p>
        </section>
      ) : (
        <>
          <section className="kpis">
            <article className="card kpi-card">
              <p className="helper-text mb-1">Total Revenue</p>
              <p className="text-3xl font-bold text-emerald-600">{formatMoney(data?.metrics?.totalRevenue || 0)}</p>
              <p className="helper-text">{data?.metrics?.transactionCount || 0} transactions</p>
            </article>
            <article className="card kpi-card">
              <p className="helper-text mb-1">Platform Fees Paid</p>
              <p className="text-3xl font-bold text-[var(--text-muted)]">{formatMoney(data?.metrics?.totalFees || 0)}</p>
              <p className="helper-text">0.5% per transaction</p>
            </article>
            <article className="card kpi-card">
              <p className="helper-text mb-1">Net Revenue</p>
              <p className="text-3xl font-bold text-[var(--erp-blue)]">{formatMoney(data?.metrics?.netRevenue || 0)}</p>
              <p className="helper-text">After platform fee</p>
            </article>
            <article className="card kpi-card">
              <p className="helper-text mb-1">This Month</p>
              <p className="text-3xl font-bold text-violet-700">{formatMoney(data?.metrics?.thisMonthRevenue || 0)}</p>
              <p className="helper-text">Fees: {formatMoney(data?.metrics?.thisMonthFees || 0)}</p>
            </article>
            <article className="card kpi-card">
              <p className="helper-text mb-1">Available Balance</p>
              <p className="text-3xl font-bold text-green-600">
                {formatMoney(availableBalance.amount)} {availableBalance.currency.toUpperCase()}
              </p>
              <p className="helper-text">Ready for payout</p>
            </article>
            <article className="card kpi-card">
              <p className="helper-text mb-1">Pending Balance</p>
              <p className="text-3xl font-bold text-amber-600">
                {formatMoney(pendingBalance.amount)} {pendingBalance.currency.toUpperCase()}
              </p>
              <p className="helper-text">In transit</p>
            </article>
          </section>

          <section className="card">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="section-title">Revenue Summary</h2>
              <div className="tabs-bar" style={{ marginBottom: 0, borderBottom: "none" }}>
                {PERIODS.map((key) => (
                  <button
                    key={key}
                    className={`tab-pill ${period === key ? "active" : ""}`}
                    onClick={() => {
                      setPeriod(key);
                      void loadSummary(key);
                    }}
                  >
                    {key.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            {summaryError ? (
              <div className="card border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <p>{summaryError}</p>
                <button className="btn btn-danger mt-2" onClick={() => void loadSummary(period)}>
                  Retry
                </button>
              </div>
            ) : summaryLoading ? (
              <div className="h-72 skeleton-shimmer rounded-xl" />
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary?.chartData || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis tickFormatter={(v) => `$${v}`} />
                    <Tooltip
                      formatter={(value, name) => {
                        if (name === "count") return [String(value), "Transactions"];
                        return [formatMoney(Number(value || 0)), String(name).toUpperCase()];
                      }}
                      labelFormatter={(label, payload) => {
                        const row = payload?.[0]?.payload as
                          | { revenue: number; fees: number; count: number }
                          | undefined;
                        if (!row) return label;
                        return `${label} • Net: ${formatMoney(row.revenue - row.fees)} • Transactions: ${row.count}`;
                      }}
                    />
                    <Legend />
                    <Bar dataKey="revenue" fill="#2563eb" name="revenue" />
                    <Bar dataKey="fees" fill="#6b7280" name="fees" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="card">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="section-title">Transactions</h2>
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by email or invoice ID"
                className="input"
                style={{ maxWidth: 280 }}
              />
            </div>
            <div className="tabs-bar" style={{ marginBottom: 12 }}>
              {(["all", "succeeded", "failed", "refunded"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setFilter(tab);
                    setPage(1);
                  }}
                  className={`tab-pill ${filter === tab ? "active" : ""}`}
                >
                  {tab === "all" ? "All" : tab[0].toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            <div className="table-shell">
              <div>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Customer</th>
                      <th>Amount</th>
                      <th>Platform Fee</th>
                      <th>Net</th>
                      <th>Status</th>
                      <th>Invoice</th>
                      <th>Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="table-empty">
                          No transactions yet. Payments from your clients will appear here.
                        </td>
                      </tr>
                    ) : (
                      paginatedTransactions.map((transaction) => {
                        const transactionStatus = getTransactionStatus(transaction);
                        return (
                          <tr key={transaction.id}>
                            <td>{formatDate(transaction.createdAt)}</td>
                            <td>{transaction.customerEmail || "Unknown"}</td>
                            <td>{formatMoney(transaction.amount)}</td>
                            <td className="text-[var(--text-muted)]">-{formatMoney(transaction.platformFee)}</td>
                            <td className="text-emerald-600">{formatMoney(transaction.netAmount)}</td>
                            <td>
                              <span
                                className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(transactionStatus)}`}
                              >
                                {transactionStatus}
                              </span>
                            </td>
                            <td>
                              {transaction.invoiceId ? (
                                <Link
                                  href={`/finance/invoices/${transaction.invoiceId}`}
                                  className="text-[var(--erp-blue)] hover:underline"
                                >
                                  {transaction.invoiceId}
                                </Link>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td>
                              {transaction.receiptUrl ? (
                                <a
                                  href={transaction.receiptUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[var(--erp-blue)] hover:underline"
                                >
                                  View
                                </a>
                              ) : (
                                "-"
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button className="btn ghost" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Prev
              </button>
              <span className="text-sm text-[var(--text-muted)]">
                Page {currentPage} of {totalPages}
              </span>
              <button
                className="btn ghost"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </section>

          <section className="card">
            <h2 className="section-title mb-4">Payouts</h2>
            <p className="page-subtitle mb-4">Funds transferred to your bank account</p>
            <div className="table-shell">
              <div>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.payouts || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="table-empty">
                          No payouts yet. Payouts are processed automatically by Stripe.
                        </td>
                      </tr>
                    ) : (
                      (data?.payouts || []).map((payout) => (
                        <tr key={payout.id}>
                          <td>{formatDate(payout.arrivalDate)}</td>
                          <td>{formatMoney(payout.amount)}</td>
                          <td>
                            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(payout.status)}`}>
                              {payout.status}
                            </span>
                          </td>
                          <td>{payout.description || "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="mt-4 text-sm text-[var(--text-muted)]">Payout schedules are managed in your Stripe Dashboard.</p>
            <a
              href="https://dashboard.stripe.com"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-sm font-medium text-[var(--erp-blue)] hover:underline"
            >
              Manage Payout Schedule →
            </a>
          </section>

          {(data?.disputes || []).length > 0 && (
            <section className="card">
              <h2 className="section-title mb-4">Disputes</h2>
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                ⚠ You have {(data?.disputes || []).length} open dispute(s). Respond in your Stripe Dashboard.
              </div>
              <div className="table-shell mt-4">
                <div>
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Reason</th>
                        <th>Status</th>
                        <th>Response Due</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.disputes || []).map((dispute) => {
                        const dueDate = dispute.dueBy ? new Date(dispute.dueBy) : null;
                        const daysLeft = dueDate ? (dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24) : null;
                        const urgentClass = daysLeft !== null && daysLeft <= 3 ? "text-red-600 font-semibold" : "";
                        return (
                          <tr key={dispute.id}>
                            <td>{formatDate(dispute.createdAt)}</td>
                            <td>{formatMoney(dispute.amount)}</td>
                            <td>{dispute.reason.replace(/_/g, " ").replace(/\b\w/g, (s) => s.toUpperCase())}</td>
                            <td>{dispute.status}</td>
                            <td className={urgentClass}>{dispute.dueBy ? formatDate(dispute.dueBy) : "-"}</td>
                            <td>
                              <a
                                href={`https://dashboard.stripe.com/disputes/${dispute.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[var(--erp-blue)] hover:underline"
                              >
                                Respond in Stripe
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="mt-4 text-sm text-[var(--text-muted)]">
                Bizosto does not manage disputes. You are the merchant of record and must handle disputes directly with
                Stripe.
              </p>
            </section>
          )}

          <section className="card">
            <p className="text-sm text-[var(--text-muted)]">
              Stripe Account: {data?.connectStatus?.businessName || data?.connectStatus?.email || "-"} | Status:
              Connected ✓ | Charges: {data?.connectStatus?.chargesEnabled ? "enabled" : "disabled"} | Payouts:{" "}
              {data?.connectStatus?.payoutsEnabled ? "enabled" : "disabled"}
            </p>
            <Link
              href="/settings/payments"
              className="mt-2 inline-block text-sm font-medium text-[var(--erp-blue)] hover:underline"
            >
              Manage Connection →
            </Link>
          </section>
        </>
      )}
    </div>
  );
}
