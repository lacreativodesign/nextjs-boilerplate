'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { plans, type BillingPlanKey } from '@/lib/billing/plans';

type SubscriptionState = 'trial' | 'active' | 'past_due' | 'canceled' | string;

type SubscriptionStatusResponse = {
  plan: string;
  subscriptionState: SubscriptionState;
  billingStatus: string;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
};

const formatDate = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const getBadgeConfig = (subscriptionState: SubscriptionState): { label: string; className: string } => {
  switch (subscriptionState) {
    case 'trial':
      return { label: 'Trial', className: 'bg-amber-100 text-amber-800' };
    case 'active':
      return { label: 'Active', className: 'bg-green-100 text-green-800' };
    case 'past_due':
      return { label: 'Past Due', className: 'bg-red-100 text-red-800' };
    case 'canceled':
      return { label: 'Cancelled', className: 'bg-[var(--surface-muted)] text-[var(--text-muted)]' };
    default:
      return { label: subscriptionState, className: 'bg-[var(--surface-muted)] text-[var(--text-muted)]' };
  }
};

export default function BillingOverviewPage() {
  const [data, setData] = useState<SubscriptionStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState<boolean>(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    try {
      const res = await fetch('/api/subscription/status', {
        method: 'GET',
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Failed to load billing info');
      }

      const body = (await res.json()) as SubscriptionStatusResponse;

      setData({
        plan: body.plan,
        subscriptionState: body.subscriptionState,
        billingStatus: body.billingStatus,
        currentPeriodEnd: body.currentPeriodEnd,
        trialEndsAt: body.trialEndsAt,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load billing info';
      setFetchError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleManageBilling = useCallback(async () => {
    setPortalLoading(true);
    setPortalError(null);

    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        credentials: 'include',
      });

      const body = (await res.json()) as { ok?: boolean; url?: string; error?: string };

      if (!res.ok || !body.url) {
        throw new Error(body.error ?? 'Failed to open billing portal');
      }

      window.location.href = body.url;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to open billing portal';
      setPortalError(message);
    } finally {
      setPortalLoading(false);
    }
  }, []);

  const badgeConfig = useMemo(() => {
    return getBadgeConfig(data?.subscriptionState ?? '');
  }, [data?.subscriptionState]);

  const planConfig = useMemo(() => {
    if (!data?.plan) {
      return null;
    }

    return plans[data.plan as BillingPlanKey] ?? null;
  }, [data?.plan]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 text-[var(--text-primary)]">
      <div className="tabs-bar">
        <Link href="/billing" className="tab-pill active">Subscription</Link>
        <Link href="/billing/invoices" className="tab-pill">Invoice History</Link>
        <Link href="/billing/terminal" className="tab-pill">Payment Terminal</Link>
      </div>
      <div className="mb-6">
        <h1 className="page-title">Billing</h1>
        <p className="page-subtitle">Manage your subscription plan and billing details.</p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6 text-[var(--text-muted)]">
          Loading billing info...
        </div>
      ) : fetchError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <p className="text-sm text-red-700">{fetchError}</p>
          <button
            type="button"
            onClick={() => {
              void loadStatus();
            }}
            className="mt-4 rounded-md bg-[var(--erp-blue)] px-4 py-2 text-sm font-medium text-white"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm text-[var(--text-muted)]">Current Plan</p>
                <h2 className="text-2xl font-bold capitalize">{data?.plan ?? 'Unknown'}</h2>
              </div>
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${badgeConfig.className}`}>
                {badgeConfig.label}
              </span>
            </div>

            {data?.trialEndsAt && data.subscriptionState === 'trial' ? (
              <p className="mt-4 text-sm text-[var(--text-muted)]">Trial ends: {formatDate(data.trialEndsAt)}</p>
            ) : null}

            {data?.currentPeriodEnd && data.subscriptionState === 'active' ? (
              <p className="mt-4 text-sm text-[var(--text-muted)]">Next billing date: {formatDate(data.currentPeriodEnd)}</p>
            ) : null}
          </section>

          <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6">
            <h3 className="mb-4 text-lg font-semibold">Actions</h3>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  void handleManageBilling();
                }}
                disabled={portalLoading}
                className="rounded-md bg-[var(--erp-blue)] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {portalLoading ? 'Opening...' : 'Manage Billing'}
              </button>

              <Link
                href="/pricing"
                className="rounded-md border border-[var(--border-subtle)] px-4 py-2 text-sm font-medium text-[var(--text-primary)]"
              >
                View Plans
              </Link>
            </div>

            {portalError ? <p className="mt-3 text-sm text-red-600">{portalError}</p> : null}
          </section>

          <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6">
            <h3 className="mb-4 text-lg font-semibold">Plan Features</h3>
            {planConfig ? (
              <ul className="space-y-2 text-sm text-[var(--text-primary)]">
                {planConfig.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <span className="text-green-600">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                You are on a free trial. Upgrade to access all features.
              </p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
