'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { SmartSearchBar } from '@/components/search/SmartSearchBar';
import { smartMatch } from '@/lib/search/smartMatch';

type Metrics = {
  mrr: number;
  totalPayingTenants: number;
  unbilledActiveTenants: number;
  compedTenants: number;
  platformFeeRevenue: number;
  taxCollectedThisMonth: number;
  totalActiveTenants: number;
  totalTrialTenants: number;
  totalLockedTenants: number;
};

type PaymentTenant = {
  tenantId: string;
  tenantName: string;
  plan: string;
  subscriptionState: string;
  billingStatus: string;
  mrr: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  lastPaymentAt: string | null;
  lastInvoiceTotal: number;
  lastInvoiceTax: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  trialEndsAt: string | null;
  status: string;
};

type PaymentsResponse = {
  ok: boolean;
  fetchedAt: string;
  metrics: Metrics;
  breakdown: {
    byPlan: Record<string, number>;
    byState: Record<string, number>;
  };
  tenants: PaymentTenant[];
};

type FailedPayment = {
  tenantId: string;
  tenantName: string;
  plan: string;
  subscriptionState: string;
  lastPaymentAt: string | null;
  stripeCustomerId: string | null;
  trialEndsAt: string | null;
};

type Txn = {
  id: string;
  amount: number;
  amountRefunded: number;
  currency: string;
  status: string;
  description: string | null;
  customerEmail: string | null;
  customerId: string | null;
  tenantId: string | null;
  createdAt: string;
  receiptUrl: string | null;
};

const PAGE_SIZE = 20;

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function relativeTime(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  const diffMs = Date.now() - parsed.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function badgeClassForPlan(plan: string) {
  if (plan === 'starter') return 'bg-blue-500/15 text-blue-300';
  if (plan === 'pro') return 'bg-purple-500/15 text-purple-300';
  if (plan === 'enterprise') return 'bg-amber-500/15 text-amber-300';
  return 'bg-[var(--surface-muted)] text-[var(--text-muted)]';
}

function badgeClassForStatus(state: string) {
  if (state === 'active') return 'bg-green-500/15 text-green-300';
  if (state === 'grace') return 'bg-amber-500/15 text-amber-300';
  if (state === 'soft_locked') return 'bg-orange-500/15 text-orange-300';
  if (state === 'hard_locked') return 'bg-red-500/15 text-red-300';
  return 'bg-[var(--surface-muted)] text-[var(--text-muted)]';
}

export default function PaymentTerminalPage() {
  const [data, setData] = useState<PaymentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'active' | 'trial' | 'grace' | 'locked'>('all');
  const [sort, setSort] = useState<{
    key: 'mrr' | 'currentPeriodEnd' | 'lastPaymentAt';
    dir: 'asc' | 'desc';
  }>({ key: 'mrr', dir: 'desc' });
  const [page, setPage] = useState(1);

  const [failedOpen, setFailedOpen] = useState(false);
  const [failedLoading, setFailedLoading] = useState(false);
  const [failedPayments, setFailedPayments] = useState<FailedPayment[]>([]);

  const [transactions, setTransactions] = useState<Txn[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txMore, setTxMore] = useState(false);
  const [txCursor, setTxCursor] = useState<string | null>(null);
  const [txLoadingMore, setTxLoadingMore] = useState(false);

  const loadPayments = async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetch(`/api/super_admin/payments${forceRefresh ? '?refresh=true' : ''}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const json = (await res.json()) as PaymentsResponse;
      if (json?.ok) setData(json);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadTransactions = async (cursor?: string | null) => {
    if (cursor) setTxLoadingMore(true);
    else setTxLoading(true);

    try {
      const params = new URLSearchParams({ limit: '50' });
      if (cursor) params.set('starting_after', cursor);
      const res = await fetch(`/api/super_admin/payments/transactions?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const json = await res.json();
      if (json?.ok) {
        const next = (json.transactions || []) as Txn[];
        setTransactions((prev) => (cursor ? [...prev, ...next] : next));
        setTxMore(Boolean(json.hasMore));
        setTxCursor(json.nextCursor || null);
      }
    } finally {
      setTxLoading(false);
      setTxLoadingMore(false);
    }
  };

  useEffect(() => {
    loadPayments();
    loadTransactions();
  }, []);

  useEffect(() => {
    if (!failedOpen || failedPayments.length > 0) return;
    (async () => {
      setFailedLoading(true);
      try {
        const res = await fetch('/api/super_admin/payments/failed', {
          credentials: 'include',
          cache: 'no-store',
        });
        const json = await res.json();
        if (json?.ok) setFailedPayments(json.failedPayments || []);
      } finally {
        setFailedLoading(false);
      }
    })();
  }, [failedOpen, failedPayments.length]);

  const filteredTenants = useMemo(() => {
    const list = data?.tenants || [];
    const byTab = list.filter((tenant) => {
      if (tab === 'active' && tenant.subscriptionState !== 'active') return false;
      if (tab === 'trial' && tenant.plan !== 'trial') return false;
      if (tab === 'grace' && tenant.subscriptionState !== 'grace') return false;
      if (tab === 'locked' && !['soft_locked', 'hard_locked'].includes(tenant.subscriptionState))
        return false;
      return true;
    });
    return smartMatch(byTab, search, (tenant) => [tenant.tenantName]).sort((a, b) => {
      const direction = sort.dir === 'asc' ? 1 : -1;
      if (sort.key === 'mrr') return (a.mrr - b.mrr) * direction;

      const left = a[sort.key] ? new Date(String(a[sort.key])).getTime() : 0;
      const right = b[sort.key] ? new Date(String(b[sort.key])).getTime() : 0;
      return (left - right) * direction;
    });
  }, [data?.tenants, search, sort, tab]);

  const totalPages = Math.max(1, Math.ceil(filteredTenants.length / PAGE_SIZE));
  const pageRows = filteredTenants.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [tab, search, sort]);

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="page-title">Payment Terminal</h1>
        <p className="page-subtitle">
          Subscription revenue, billing status, and transaction history across all tenants
        </p>
      </div>

      <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
        <span>Last updated: {data?.fetchedAt ? formatDateTime(data.fetchedAt) : '—'}</span>
        <button
          onClick={() => loadPayments(true)}
          disabled={refreshing}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2 text-sm font-medium hover:border-[var(--erp-blue)]"
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          {
            label: 'Monthly Recurring Revenue',
            value: formatUsd(data?.metrics.mrr || 0),
            // MRR-1: only workspaces with a real Stripe subscription contribute.
            sub: 'Billed subscriptions only',
            color: 'var(--color-green)',
          },
          {
            label: 'Active Tenants',
            value: data?.metrics.totalActiveTenants || 0,
            // This counts every unlocked workspace, billed or not — which is why it can
            // legitimately exceed the paying count below.
            sub: `${data?.metrics.totalPayingTenants || 0} billed`,
            color: 'var(--erp-blue)',
          },
          {
            // COMP-1: anything left here is a genuine anomaly worth investigating —
            // deliberately free workspaces are counted separately below.
            label: 'Unbilled Active',
            value: data?.metrics.unbilledActiveTenants || 0,
            sub: 'Active, no subscription',
            color: 'var(--warning-strong)',
          },
          {
            label: 'Comped',
            value: data?.metrics.compedTenants || 0,
            sub: 'Internally managed, $0',
            color: 'var(--color-purple)',
          },
          {
            label: 'Trial Tenants',
            value: data?.metrics.totalTrialTenants || 0,
            sub: 'In free trial',
            color: 'var(--color-purple)',
          },
          {
            label: 'Locked Accounts',
            value: data?.metrics.totalLockedTenants || 0,
            sub: 'Require attention',
            color: 'var(--danger-strong)',
            redBorder: (data?.metrics.totalLockedTenants || 0) > 0,
          },
          {
            label: 'Tax Collected (Month)',
            value: formatUsd(data?.metrics.taxCollectedThisMonth || 0),
            sub: 'Auto-calculated by Stripe Tax',
            color: 'var(--warning-strong)',
          },
          {
            label: 'Platform Fee Revenue',
            value: formatUsd(data?.metrics.platformFeeRevenue || 0),
            sub: '0.5% handling fees',
            color: 'var(--info-strong)',
          },
        ].map((metric) => (
          <div
            key={metric.label}
            className={`card p-5 ${metric.redBorder ? 'border-red-500' : ''}`}
          >
            <p className="text-sm text-[var(--text-muted)]">{metric.label}</p>
            <p className="mt-2 text-3xl font-bold" style={{ color: metric.color }}>
              {loading ? '...' : metric.value}
            </p>
            <p className="mt-1 text-xs text-[var(--text-soft)]">{metric.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <div className="section-title">By Plan</div>
          <p className="mt-3 text-sm">
            Trial: {data?.breakdown.byPlan.trial || 0} | Starter:{' '}
            {data?.breakdown.byPlan.starter || 0} | Pro: {data?.breakdown.byPlan.pro || 0} |
            Enterprise: {data?.breakdown.byPlan.enterprise || 0}
          </p>
        </div>
        <div className="card p-5">
          <div className="section-title">By Status</div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {[
              { key: 'active', label: 'Active' },
              { key: 'grace', label: 'Grace' },
              { key: 'soft_locked', label: 'Read-only' },
              { key: 'hard_locked', label: 'Locked' },
            ].map((item) => (
              <span
                key={item.key}
                className={`inline-flex items-center rounded-full px-3 py-1 font-semibold ${badgeClassForStatus(item.key)}`}
              >
                {item.label}: {data?.breakdown.byState[item.key] || 0}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="section-title">Tenant Subscriptions</div>
          <SmartSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search tenants..."
            className="w-full max-w-xs"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {['all', 'active', 'trial', 'grace', 'locked'].map((item) => (
            <button
              key={item}
              onClick={() => setTab(item as typeof tab)}
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${tab === item ? 'bg-[var(--erp-blue)] text-white' : 'bg-[var(--surface-muted)] text-[var(--text-muted)]'}`}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                <th className="px-4 py-3">Tenant Name</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Status</th>
                <th
                  className="px-4 py-3 cursor-pointer"
                  onClick={() =>
                    setSort((s) => ({
                      key: 'mrr',
                      dir: s.key === 'mrr' && s.dir === 'desc' ? 'asc' : 'desc',
                    }))
                  }
                >
                  MRR ($)
                </th>
                <th
                  className="px-4 py-3 cursor-pointer"
                  onClick={() =>
                    setSort((s) => ({
                      key: 'currentPeriodEnd',
                      dir: s.key === 'currentPeriodEnd' && s.dir === 'desc' ? 'asc' : 'desc',
                    }))
                  }
                >
                  Next Billing
                </th>
                <th
                  className="px-4 py-3 cursor-pointer"
                  onClick={() =>
                    setSort((s) => ({
                      key: 'lastPaymentAt',
                      dir: s.key === 'lastPaymentAt' && s.dir === 'desc' ? 'asc' : 'desc',
                    }))
                  }
                >
                  Last Payment
                </th>
                <th className="px-4 py-3">Tax</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading &&
                pageRows.map((tenant) => (
                  <tr key={tenant.tenantId} className="border-t border-[var(--border-subtle)]">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{tenant.tenantName}</div>
                      <div className="text-xs text-[var(--text-muted)]">{tenant.tenantId}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase ${badgeClassForPlan(tenant.plan)}`}
                      >
                        {tenant.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${badgeClassForStatus(tenant.subscriptionState)}`}
                      >
                        {tenant.subscriptionState}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatUsd(tenant.mrr)}</td>
                    <td className="px-4 py-3">
                      {tenant.plan === 'trial'
                        ? `Trial ends ${formatDate(tenant.trialEndsAt || tenant.currentPeriodEnd)}`
                        : formatDate(tenant.currentPeriodEnd)}
                    </td>
                    <td className="px-4 py-3">{relativeTime(tenant.lastPaymentAt)}</td>
                    <td className="px-4 py-3">{formatUsd(tenant.lastInvoiceTax)}</td>
                    <td className="px-4 py-3 text-right">
                      {tenant.stripeCustomerId ? (
                        <a
                          href={`https://dashboard.stripe.com/customers/${tenant.stripeCustomerId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-semibold text-[var(--erp-blue)]"
                        >
                          View in Stripe
                        </a>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">No payment data</span>
                      )}
                    </td>
                  </tr>
                ))}
              {!loading && pageRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-sm text-[var(--text-muted)]">
                    No subscriptions yet — tenants will appear here once they subscribe.
                  </td>
                </tr>
              )}
              {loading &&
                Array.from({ length: 6 }).map((_, idx) => (
                  <tr key={`sk-${idx}`} className="border-t border-[var(--border-subtle)]">
                    <td colSpan={8} className="px-4 py-4">
                      <div className="h-8 animate-pulse rounded bg-[var(--surface-muted)]" />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-xl border border-[var(--border-subtle)] px-3 py-1 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-xl border border-[var(--border-subtle)] px-3 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <button
          className="flex w-full items-center justify-between"
          onClick={() => setFailedOpen((v) => !v)}
        >
          <span className={`section-title ${failedPayments.length > 0 ? 'text-red-400' : ''}`}>
            ⚠ Failed Payments ({failedPayments.length})
          </span>
          <span className="text-sm text-[var(--text-muted)]">{failedOpen ? 'Hide' : 'Show'}</span>
        </button>
        {failedOpen && (
          <div className="mt-4 space-y-3">
            {failedLoading && (
              <div className="text-sm text-[var(--text-muted)]">Loading failed payments...</div>
            )}
            {!failedLoading && failedPayments.length === 0 && (
              <div className="text-sm text-[var(--text-muted)]">No failed payments.</div>
            )}
            {!failedLoading &&
              failedPayments.map((item) => (
                <div
                  key={item.tenantId}
                  className="rounded-xl border border-[var(--border-subtle)] p-3 text-sm"
                >
                  <div className="font-semibold">{item.tenantName}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                    <span className={`rounded-full px-2 py-1 ${badgeClassForPlan(item.plan)}`}>
                      {item.plan}
                    </span>
                    <span
                      className={`rounded-full px-2 py-1 ${badgeClassForStatus(item.subscriptionState)}`}
                    >
                      {item.subscriptionState}
                    </span>
                    <span>Last attempted: {formatDate(item.lastPaymentAt)}</span>
                    <Link
                      href={`/super_admin/tenants/${item.tenantId}`}
                      className="font-semibold text-[var(--erp-blue)]"
                    >
                      View Tenant
                    </Link>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="card p-5">
        <div className="section-title">Recent Transactions</div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Tax</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {!txLoading &&
                transactions.map((txn) => (
                  <tr key={txn.id} className="border-t border-[var(--border-subtle)]">
                    <td className="px-4 py-3">{formatDateTime(txn.createdAt)}</td>
                    <td className="px-4 py-3">{txn.tenantId || txn.customerEmail || '—'}</td>
                    <td className="px-4 py-3">{formatUsd(txn.amount)}</td>
                    <td className="px-4 py-3">
                      {formatUsd(Math.max(0, txn.amount - (txn.amountRefunded || 0)))}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${txn.status === 'succeeded' ? 'bg-green-500/15 text-green-300' : txn.status === 'failed' ? 'bg-red-500/15 text-red-300' : 'bg-amber-500/15 text-amber-300'}`}
                      >
                        {txn.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {txn.receiptUrl ? (
                        <a
                          className="text-[var(--erp-blue)]"
                          href={txn.receiptUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              {!txLoading && transactions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-sm text-[var(--text-muted)]">
                    No transactions found yet.
                  </td>
                </tr>
              )}
              {txLoading &&
                Array.from({ length: 4 }).map((_, idx) => (
                  <tr key={`tx-sk-${idx}`} className="border-t border-[var(--border-subtle)]">
                    <td colSpan={6} className="px-4 py-4">
                      <div className="h-8 animate-pulse rounded bg-[var(--surface-muted)]" />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {txMore && (
          <div className="mt-4 flex justify-center">
            <button
              disabled={txLoadingMore}
              onClick={() => loadTransactions(txCursor)}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2 text-sm font-medium hover:border-[var(--erp-blue)]"
            >
              {txLoadingMore ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
