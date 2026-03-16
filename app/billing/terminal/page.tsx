"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
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
const ADMIN_ROLES = ["admin", "super_admin"];

const usdFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

function formatMoney(value: number) {
  return usdFormatter.format(value || 0);
}

function formatDate(iso: string) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) {
    return "-";
  }
  return dateFormatter.format(dt);
}

function getTransactionStatus(transaction: TerminalTransaction) {
  if (transaction.refunded || transaction.amountRefunded > 0) {
    return "refunded";
  }
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
        !term ||
        item.customerEmail?.toLowerCase().includes(term) ||
        item.invoiceId?.toLowerCase().includes(term);
      return Boolean(statusMatch && textMatch);
    });
  }, [transactions, query, filter]);

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const availableBalance = data?.balance?.available?.[0] || { amount: 0, currency: "usd" };
  const pendingBalance = data?.balance?.pending?.[0] || { amount: 0, currency: "usd" };

  return (
    <RequireAuth allowed={ADMIN_ROLES}>
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <div className="flex gap-2 border-b border-[var(--border-subtle)] pb-3 text-sm font-medium">
          <Link href="/billing" className="rounded-md px-3 py-2 text-[var(--text-muted)] hover:bg-[var(--surface-muted)]">
            Subscription
          </Link>
          <Link href="/billing/terminal" className="rounded-md bg-[var(--erp-blue)] px-3 py-2 text-white">
            Payment Terminal
          </Link>
        </div>

        <header>
          <h1 className="text-2xl font-semibold">Payment Terminal</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Your client payment activity, payouts, and revenue summary
          </p>
        </header>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p>{error}</p>
            <button className="mt-3 rounded bg-red-600 px-3 py-2 text-white" onClick={() => void loadTerminal()}>
              Retry
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="h-28 animate-pulse rounded-xl bg-[var(--surface-muted)]" />
            ))}
          </div>
        ) : data?.connected === false ? (
          <section className="mx-auto w-full max-w-xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-8 text-center">
            <div className="text-4xl">💳</div>
            <h2 className="mt-4 text-xl font-semibold">Connect Stripe to Accept Payments</h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              You haven&apos;t connected a Stripe account yet. Connect your account to start accepting payments from your clients.
            </p>
            <Link href="/settings/payments" className="mt-5 inline-flex rounded bg-[var(--erp-blue)] px-4 py-2 text-sm font-semibold text-white">
              Connect Stripe Account
            </Link>
            <p className="mt-3 text-xs text-[var(--text-muted)]">A 0.5% platform handling fee applies to all transactions.</p>
          </section>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <article className="rounded-xl border border-[var(--border-subtle)] p-4">
                <p className="text-sm text-[var(--text-muted)]">Total Revenue</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-600">{formatMoney(data?.metrics?.totalRevenue || 0)}</p>
                <p className="text-xs text-[var(--text-muted)]">{data?.metrics?.transactionCount || 0} transactions</p>
              </article>
              <article className="rounded-xl border border-[var(--border-subtle)] p-4">
                <p className="text-sm text-[var(--text-muted)]">Platform Fees Paid</p>
                <p className="mt-2 text-2xl font-semibold text-[var(--text-muted)]">{formatMoney(data?.metrics?.totalFees || 0)}</p>
                <p className="text-xs text-[var(--text-muted)]">0.5% per transaction</p>
              </article>
              <article className="rounded-xl border border-[var(--border-subtle)] p-4">
                <p className="text-sm text-[var(--text-muted)]">Net Revenue</p>
                <p className="mt-2 text-2xl font-semibold text-[var(--erp-blue)]">{formatMoney(data?.metrics?.netRevenue || 0)}</p>
                <p className="text-xs text-[var(--text-muted)]">After platform fee</p>
              </article>
              <article className="rounded-xl border border-[var(--border-subtle)] p-4">
                <p className="text-sm text-[var(--text-muted)]">This Month</p>
                <p className="mt-2 text-2xl font-semibold text-violet-700">{formatMoney(data?.metrics?.thisMonthRevenue || 0)}</p>
                <p className="text-xs text-[var(--text-muted)]">Fees: {formatMoney(data?.metrics?.thisMonthFees || 0)}</p>
              </article>
              <article className="rounded-xl border border-[var(--border-subtle)] p-4">
                <p className="text-sm text-[var(--text-muted)]">Available Balance</p>
                <p className="mt-2 text-2xl font-semibold text-green-600">
                  {formatMoney(availableBalance.amount)} {availableBalance.currency.toUpperCase()}
                </p>
                <p className="text-xs text-[var(--text-muted)]">Ready for payout</p>
              </article>
              <article className="rounded-xl border border-[var(--border-subtle)] p-4">
                <p className="text-sm text-[var(--text-muted)]">Pending Balance</p>
                <p className="mt-2 text-2xl font-semibold text-amber-600">
                  {formatMoney(pendingBalance.amount)} {pendingBalance.currency.toUpperCase()}
                </p>
                <p className="text-xs text-[var(--text-muted)]">In transit</p>
              </article>
            </section>

            <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Revenue Summary</h2>
                <div className="flex gap-2">
                  {PERIODS.map((key) => (
                    <button
                      key={key}
                      className={`rounded-md px-3 py-1 text-xs font-medium ${period === key ? "bg-[var(--erp-blue)] text-white" : "bg-[var(--surface-muted)] text-[var(--text-muted)]"}`}
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
                <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <p>{summaryError}</p>
                  <button className="mt-2 rounded bg-red-600 px-3 py-1 text-white" onClick={() => void loadSummary(period)}>
                    Retry
                  </button>
                </div>
              ) : summaryLoading ? (
                <div className="h-72 animate-pulse rounded bg-[var(--surface-muted)]" />
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary?.chartData || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis tickFormatter={(v) => `$${v}`} />
                      <Tooltip
                        formatter={(value, name, item) => {
                          if (name === "count") {
                            return [String(value), "Transactions"];
                          }
                          return [formatMoney(Number(value || 0)), String(name).toUpperCase()];
                        }}
                        labelFormatter={(label, payload) => {
                          const row = payload?.[0]?.payload as { revenue: number; fees: number; count: number } | undefined;
                          if (!row) return label;
                          const net = row.revenue - row.fees;
                          return `${label} • Net: ${formatMoney(net)} • Transactions: ${row.count}`;
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

            <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Transactions</h2>
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search by customer email or invoice ID"
                  className="w-full max-w-xs rounded border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm"
                />
              </div>
              <div className="mb-3 flex gap-2">
                {(["all", "succeeded", "failed", "refunded"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => {
                      setFilter(tab);
                      setPage(1);
                    }}
                    className={`rounded px-3 py-1 text-xs font-medium ${filter === tab ? "bg-[var(--erp-blue)] text-white" : "bg-[var(--surface-muted)] text-[var(--text-muted)]"}`}
                  >
                    {tab === "all" ? "All" : tab[0].toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-[var(--border-subtle)] text-xs uppercase text-[var(--text-muted)]">
                    <tr>
                      <th className="px-2 py-3">Date</th>
                      <th className="px-2 py-3">Customer</th>
                      <th className="px-2 py-3">Amount</th>
                      <th className="px-2 py-3">Platform Fee</th>
                      <th className="px-2 py-3">Net</th>
                      <th className="px-2 py-3">Status</th>
                      <th className="px-2 py-3">Invoice</th>
                      <th className="px-2 py-3">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-2 py-8 text-center text-sm text-[var(--text-muted)]">
                          No transactions yet. Payments from your clients will appear here.
                        </td>
                      </tr>
                    ) : (
                      paginatedTransactions.map((transaction) => {
                        const transactionStatus = getTransactionStatus(transaction);
                        return (
                          <tr key={transaction.id} className="border-b border-[var(--border-subtle)]">
                            <td className="px-2 py-3">{formatDate(transaction.createdAt)}</td>
                            <td className="px-2 py-3">{transaction.customerEmail || "Unknown"}</td>
                            <td className="px-2 py-3">{formatMoney(transaction.amount)}</td>
                            <td className="px-2 py-3 text-[var(--text-muted)]">-{formatMoney(transaction.platformFee)}</td>
                            <td className="px-2 py-3 text-emerald-600">{formatMoney(transaction.netAmount)}</td>
                            <td className="px-2 py-3">
                              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(transactionStatus)}`}>
                                {transactionStatus}
                              </span>
                            </td>
                            <td className="px-2 py-3">
                              {transaction.invoiceId ? (
                                <Link href={`/finance/invoices/${transaction.invoiceId}`} className="text-[var(--erp-blue)] hover:underline">
                                  {transaction.invoiceId}
                                </Link>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td className="px-2 py-3">
                              {transaction.receiptUrl ? (
                                <a href={transaction.receiptUrl} target="_blank" rel="noreferrer" className="text-[var(--erp-blue)] hover:underline">
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

              <div className="mt-4 flex items-center justify-between text-sm">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  className="rounded border border-[var(--border-subtle)] px-3 py-1 disabled:opacity-50"
                >
                  Prev
                </button>
                <span>Page {currentPage} of {totalPages}</span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  className="rounded border border-[var(--border-subtle)] px-3 py-1 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </section>

            <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
              <h2 className="text-lg font-semibold">Payouts</h2>
              <p className="text-sm text-[var(--text-muted)]">Funds transferred to your bank account</p>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-[var(--border-subtle)] text-xs uppercase text-[var(--text-muted)]">
                    <tr>
                      <th className="px-2 py-3">Date</th>
                      <th className="px-2 py-3">Amount</th>
                      <th className="px-2 py-3">Status</th>
                      <th className="px-2 py-3">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.payouts || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-2 py-8 text-center text-sm text-[var(--text-muted)]">
                          No payouts yet. Payouts are processed automatically by Stripe.
                        </td>
                      </tr>
                    ) : (
                      (data?.payouts || []).map((payout) => (
                        <tr key={payout.id} className="border-b border-[var(--border-subtle)]">
                          <td className="px-2 py-3">{formatDate(payout.arrivalDate)}</td>
                          <td className="px-2 py-3">{formatMoney(payout.amount)}</td>
                          <td className="px-2 py-3">
                            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(payout.status)}`}>
                              {payout.status}
                            </span>
                          </td>
                          <td className="px-2 py-3">{payout.description || "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
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

            {(data?.disputes || []).length > 0 ? (
              <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
                <h2 className="text-lg font-semibold">Disputes</h2>
                <div className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  ⚠ You have {(data?.disputes || []).length} open dispute(s). Disputes must be responded to in your Stripe Dashboard.
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-[var(--border-subtle)] text-xs uppercase text-[var(--text-muted)]">
                      <tr>
                        <th className="px-2 py-3">Date</th>
                        <th className="px-2 py-3">Amount</th>
                        <th className="px-2 py-3">Reason</th>
                        <th className="px-2 py-3">Status</th>
                        <th className="px-2 py-3">Response Due</th>
                        <th className="px-2 py-3">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.disputes || []).map((dispute) => {
                        const dueDate = dispute.dueBy ? new Date(dispute.dueBy) : null;
                        const daysLeft = dueDate ? (dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24) : null;
                        const urgentClass = daysLeft !== null && daysLeft <= 3 ? "text-red-600 font-semibold" : "";
                        return (
                          <tr key={dispute.id} className="border-b border-[var(--border-subtle)]">
                            <td className="px-2 py-3">{formatDate(dispute.createdAt)}</td>
                            <td className="px-2 py-3">{formatMoney(dispute.amount)}</td>
                            <td className="px-2 py-3">{dispute.reason.replace(/_/g, " ").replace(/\b\w/g, (s) => s.toUpperCase())}</td>
                            <td className="px-2 py-3">{dispute.status}</td>
                            <td className={`px-2 py-3 ${urgentClass}`}>{dispute.dueBy ? formatDate(dispute.dueBy) : "-"}</td>
                            <td className="px-2 py-3">
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
                <p className="mt-4 text-sm text-[var(--text-muted)]">
                  Bizosto does not manage disputes. You are the merchant of record and must handle disputes directly with Stripe.
                </p>
              </section>
            ) : null}

            <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 text-sm text-[var(--text-muted)]">
              Stripe Account: {data?.connectStatus?.businessName || data?.connectStatus?.email || "-"} | Status: Connected ✓ | Charges: {data?.connectStatus?.chargesEnabled ? "enabled" : "disabled"} | Payouts: {data?.connectStatus?.payoutsEnabled ? "enabled" : "disabled"}
              <Link href="/settings/payments" className="ml-2 font-medium text-[var(--erp-blue)] hover:underline">
                Manage Connection →
              </Link>
            </section>
          </>
        )}
      </div>
    </RequireAuth>
  );
}
