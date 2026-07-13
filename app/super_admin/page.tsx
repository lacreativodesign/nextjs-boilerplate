'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';

type PaymentsMetrics = {
  mrr: number;
  platformFeeRevenue?: number;
  taxCollectedThisMonth: number;
  totalActiveTenants: number;
  totalTrialTenants: number;
  totalLockedTenants: number;
};

type PaymentsBreakdown = {
  byPlan: Record<string, number>;
  byState: Record<string, number>;
};

type PaymentsData = {
  metrics: PaymentsMetrics;
  breakdown: PaymentsBreakdown;
};

type SystemHealthData = {
  notifications: { total: number; unread: number };
  emails: { total: number; statusCounts: Record<string, number> };
};

// Subtle status color cues (also available as CSS vars in the theme, but
// StatCard already takes inline color props, so we keep them inline here).
const COLOR_ACTIVE = '#10b981'; // green-ish
const COLOR_TRIAL = '#f59e0b'; // amber
const COLOR_LOCKED = '#ef4444'; // red

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
      <p className="text-sm text-[var(--text-muted)]">{label}</p>
      <p className="mt-2 text-3xl font-bold" style={{ color: color || 'var(--text-primary)' }}>
        {value}
      </p>
      <p className="mt-1 text-xs text-[var(--text-soft)]">{sub}</p>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>;
}

function SkeletonGrid({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5"
        >
          <div className="h-3 w-24 animate-pulse rounded bg-[var(--border-subtle)]" />
          <div className="mt-3 h-8 w-20 animate-pulse rounded bg-[var(--border-subtle)]" />
          <div className="mt-2 h-2 w-28 animate-pulse rounded bg-[var(--border-subtle)]" />
        </div>
      ))}
    </div>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
      <p className="text-sm" style={{ color: COLOR_LOCKED }}>
        {message}
      </p>
    </div>
  );
}

const ACTION_LINKS = [
  {
    title: 'Tenant Management',
    href: '/super_admin/tenants',
    desc: 'View, create, and manage tenant workspaces.',
  },
  { title: 'All Users', href: '/super_admin/users', desc: 'View every user across all tenants.' },
  {
    title: 'System Health',
    href: '/super_admin/system-health/full',
    desc: 'Monitor Firebase, API, and service status.',
  },
  {
    title: 'Error Monitoring',
    href: '/super_admin/monitoring',
    desc: 'Sentry integration status and error tracking dashboard.',
  },
  {
    title: 'Audit Logs',
    href: '/super_admin/audit',
    desc: 'Review all platform activity and changes.',
  },
  {
    title: 'Maintenance',
    href: '/super_admin/maintenance',
    desc: 'Run one-off data repairs. Dry run first, then apply.',
  },
  {
    title: 'Payment Terminal',
    href: '/super_admin/payments',
    desc: 'Subscription revenue, billing status, and transaction history.',
  },
  {
    title: 'Tax Filing',
    href: '/super_admin/tax',
    desc: 'Platform tax collected, quarterly breakdown, and CSV export for LA CREATIVO GROUP LLC.',
  },
  {
    title: 'Activity Feed',
    href: '/super_admin/activity',
    desc: 'Live stream of platform-wide events.',
  },
  {
    title: 'Backups',
    href: '/super_admin/backups',
    desc: 'Manage data exports and backup schedules.',
  },
  {
    title: 'Demo Environment',
    href: '/super_admin/demo',
    desc: 'Manage demo tenant and reset sample data for sales demos.',
  },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function planSummary(byPlan: Record<string, number>): string {
  return ['trial', 'starter', 'pro', 'enterprise']
    .map((plan) => `${plan} ${byPlan?.[plan] ?? 0}`)
    .join(' · ');
}

export default function SuperAdminPage() {
  const [payments, setPayments] = useState<PaymentsData | null>(null);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [health, setHealth] = useState<SystemHealthData | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadPayments() {
      try {
        const res = await apiFetch('/api/super_admin/payments', { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.metrics) {
          throw new Error(json?.error || 'Unable to load revenue data.');
        }
        if (active) {
          setPayments({
            metrics: json.metrics,
            breakdown: json.breakdown || { byPlan: {}, byState: {} },
          });
        }
      } catch (err) {
        if (active) {
          setPaymentsError(err instanceof Error ? err.message : 'Unable to load revenue data.');
        }
      }
    }

    async function loadHealth() {
      try {
        const res = await apiFetch('/api/super_admin/system-health', { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.notifications || !json?.emails) {
          throw new Error(json?.error || 'Unable to load system status.');
        }
        if (active) {
          setHealth({
            notifications: json.notifications,
            emails: json.emails,
          });
        }
      } catch (err) {
        if (active) {
          setHealthError(err instanceof Error ? err.message : 'Unable to load system status.');
        }
      }
    }

    Promise.all([loadPayments(), loadHealth()]).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const metrics = payments?.metrics;
  const breakdown = payments?.breakdown;
  const statusCounts = health?.emails?.statusCounts || {};
  const delivered = statusCounts.delivered ?? 0;
  const failed = (statusCounts.failed ?? 0) + (statusCounts.bounced ?? 0);

  return (
    <div className="space-y-8">
      {/* SECTION 1 — Revenue */}
      <section className="space-y-3">
        <SectionHeader title="Revenue" />
        {loading ? (
          <SkeletonGrid />
        ) : paymentsError ? (
          <ErrorLine message={paymentsError} />
        ) : metrics ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Monthly Recurring Revenue"
              value={formatCurrency(metrics.mrr)}
              sub="MRR from active subscriptions"
              color="var(--erp-blue)"
            />
            <StatCard
              label="Tax Collected (This Month)"
              value={formatCurrency(metrics.taxCollectedThisMonth)}
              sub="Sales tax on recent invoices"
            />
            <StatCard
              label="Plan Breakdown"
              value={breakdown ? planSummary(breakdown.byPlan) : '—'}
              sub="Tenants by plan"
            />
          </div>
        ) : (
          <ErrorLine message="No revenue data available." />
        )}
      </section>

      {/* SECTION 2 — Tenant Health */}
      <section className="space-y-3">
        <SectionHeader title="Tenant Health" />
        {loading ? (
          <SkeletonGrid />
        ) : paymentsError ? (
          <ErrorLine message={paymentsError} />
        ) : metrics ? (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                label="Active Tenants"
                value={metrics.totalActiveTenants}
                sub="Paying subscriptions"
                color={COLOR_ACTIVE}
              />
              <StatCard
                label="Trial Tenants"
                value={metrics.totalTrialTenants}
                sub="On a free trial"
                color={COLOR_TRIAL}
              />
              <StatCard
                label="Locked / Churned"
                value={metrics.totalLockedTenants}
                sub="Soft or hard locked"
                color={COLOR_LOCKED}
              />
            </div>
            {breakdown ? (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-soft)]">
                <span style={{ color: COLOR_ACTIVE }}>active {breakdown.byState?.active ?? 0}</span>
                <span>grace {breakdown.byState?.grace ?? 0}</span>
                <span style={{ color: COLOR_TRIAL }}>
                  soft_locked {breakdown.byState?.soft_locked ?? 0}
                </span>
                <span style={{ color: COLOR_LOCKED }}>
                  hard_locked {breakdown.byState?.hard_locked ?? 0}
                </span>
              </div>
            ) : null}
          </>
        ) : (
          <ErrorLine message="No tenant data available." />
        )}
      </section>

      {/* SECTION 3 — System Status */}
      <section className="space-y-3">
        <SectionHeader title="System Status" />
        {loading ? (
          <SkeletonGrid count={2} />
        ) : healthError ? (
          <ErrorLine message={healthError} />
        ) : health ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label="Unread Notifications"
              value={`${health.notifications.unread} / ${health.notifications.total}`}
              sub="Unread of total"
              color={health.notifications.unread > 0 ? COLOR_TRIAL : 'var(--text-primary)'}
            />
            <StatCard
              label="Email Delivery"
              value={health.emails.total}
              sub={`delivered ${delivered} · failed ${failed}`}
              color={failed > 0 ? COLOR_LOCKED : COLOR_ACTIVE}
            />
          </div>
        ) : (
          <ErrorLine message="No system status available." />
        )}
      </section>

      {/* Action links — platform navigation */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ACTION_LINKS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="rounded-xl border border-[var(--border-subtle)]
              bg-[var(--surface-card)] p-5
              hover:border-[var(--erp-blue)] transition-all group"
          >
            <p
              className="font-semibold text-[var(--text-primary)]
              group-hover:text-[var(--erp-blue)]"
            >
              {item.title}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{item.desc}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
