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

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getBadgeConfig(state: SubscriptionState) {
  switch (state) {
    case 'trial':
      return { label: 'Free Trial', cls: 'bg-amber-500/10 text-amber-600' };
    case 'active':
      return { label: 'Active', cls: 'bg-green-500/10 text-green-600' };
    case 'past_due':
      return { label: 'Past Due', cls: 'bg-[var(--danger-soft)] text-[var(--danger)]' };
    case 'grace':
      return { label: 'Grace Period', cls: 'bg-amber-500/10 text-amber-600' };
    case 'soft_locked':
      return { label: 'Paused', cls: 'bg-[var(--danger-soft)] text-[var(--danger)]' };
    case 'hard_locked':
      return { label: 'Locked', cls: 'bg-[var(--surface-muted)] text-[var(--text-muted)]' };
    case 'canceled':
      return { label: 'Cancelled', cls: 'bg-[var(--surface-muted)] text-[var(--text-muted)]' };
    default:
      return { label: state, cls: 'bg-[var(--surface-muted)] text-[var(--text-muted)]' };
  }
}

export default function BillingOverviewPage() {
  const [data, setData] = useState<SubscriptionStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/subscription/status', {
        method: 'GET',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load billing info');
      const body = (await res.json()) as SubscriptionStatusResponse;
      setData({
        plan: body.plan,
        subscriptionState: body.subscriptionState,
        billingStatus: body.billingStatus,
        currentPeriodEnd: body.currentPeriodEnd,
        trialEndsAt: body.trialEndsAt,
      });
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load billing info');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const openPortal = useCallback(async () => {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        credentials: 'include',
      });
      const body = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? 'Failed to open billing portal');
      window.location.href = body.url;
    } catch (err: unknown) {
      setPortalError(err instanceof Error ? err.message : 'Failed to open billing portal');
    } finally {
      setPortalLoading(false);
    }
  }, []);

  const openCardManager = useCallback(async () => {
    setCardsLoading(true);
    setPortalError(null);
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        credentials: 'include',
      });
      const body = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? 'Failed to open card manager');
      window.location.href = body.url;
    } catch (err: unknown) {
      setPortalError(err instanceof Error ? err.message : 'Failed to open card manager');
    } finally {
      setCardsLoading(false);
    }
  }, []);

  const badge = useMemo(() => getBadgeConfig(data?.subscriptionState ?? ''), [data?.subscriptionState]);
  const planConfig = useMemo(() => {
    if (!data?.plan) return null;
    return plans[data.plan as BillingPlanKey] ?? null;
  }, [data?.plan]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 text-[var(--text-primary)]">
      <div className="tabs-bar">
        <Link href="/billing" className="tab-pill active">
          Subscription
        </Link>
        <Link href="/billing/invoices" className="tab-pill">
          Invoice History
        </Link>
        <Link href="/billing/terminal" className="tab-pill">
          Payment Terminal
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="page-title">Billing</h1>
        <p className="page-subtitle">Manage your Bizosto subscription, payment methods, and billing history.</p>
      </div>

      {loading && <div className="card p-6 text-sm text-[var(--text-muted)]">Loading billing info…</div>}

      {fetchError && (
        <div className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-6">
          <p className="text-sm text-[var(--danger)]">{fetchError}</p>
          <button type="button" onClick={() => void loadStatus()} className="btn mt-4">
            Retry
          </button>
        </div>
      )}

      {!loading && !fetchError && (
        <div className="space-y-5">
          {data?.subscriptionState === 'trial' && data?.trialEndsAt && (() => {
            const daysLeft = Math.ceil((new Date(data.trialEndsAt!).getTime() - Date.now()) / 86400000);
            if (daysLeft > 5) return null;
            return (
              <div className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[var(--danger)]">
                  ⚠ Your trial ends in {daysLeft} day{daysLeft !== 1 ? 's' : ''}. Upgrade now to keep your data and access.
                </p>
                <a href="https://www.bizosto.com/pricing" className="btn" style={{ borderRadius: 999, fontSize: 13 }}>
                  Upgrade Now
                </a>
              </div>
            );
          })()}
          {/* Current Plan */}
          <section className="card p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="helper-text mb-1">Current Plan</p>
                <h2 className="text-2xl font-bold capitalize">{data?.plan ?? 'Unknown'}</h2>
                {data?.trialEndsAt && data.subscriptionState === 'trial' && (
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
                    Trial ends: <strong>{formatDate(data.trialEndsAt)}</strong>
                  </p>
                )}
                {data?.currentPeriodEnd && data.subscriptionState === 'active' && (
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
                    Next billing date: <strong>{formatDate(data.currentPeriodEnd)}</strong>
                  </p>
                )}
              </div>
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${badge.cls}`}>
                {badge.label}
              </span>
            </div>

            {planConfig && (
              <ul className="mt-5 grid gap-1.5 text-sm text-[var(--text-primary)] sm:grid-cols-2">
                {planConfig.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <span className="text-green-600 font-bold">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            )}

            {!planConfig && (
              <p className="mt-4 text-sm text-[var(--text-muted)]">
                You are on a free trial. Upgrade to unlock all features after your trial ends.
              </p>
            )}
          </section>

          {/* Payment Methods */}
          <section className="card p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h3 className="section-title">Payment Methods</h3>
                <p className="helper-text mt-1">
                  Add, remove, or update the cards used for your Bizosto subscription.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void openCardManager()}
                disabled={cardsLoading}
                className="btn"
              >
                {cardsLoading ? 'Opening…' : '💳 Manage Payment Methods'}
              </button>
              <p className="text-xs text-[var(--text-muted)]">
                Secured by Stripe · Your card details are never stored on our servers.
              </p>
            </div>

            {portalError && <p className="mt-3 text-sm text-red-600">{portalError}</p>}
          </section>

          {/* Upgrade Your Plan */}
          {(data?.plan === 'trial' || data?.plan === 'starter') && (
            <section className="card p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="section-title">Upgrade Your Plan</h3>
                  <p className="helper-text mt-1">Switch plans anytime. Cancel anytime. Your data is always safe.</p>
                </div>
                <div className="flex overflow-hidden rounded-xl border border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => setBillingCycle('monthly')}
                    className={billingCycle === 'monthly' ? 'btn' : 'btn subtle'}
                    style={{ borderRadius: 0, fontSize: 13, padding: '8px 16px' }}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingCycle('annual')}
                    className={billingCycle === 'annual' ? 'btn' : 'btn subtle'}
                    style={{ borderRadius: 0, fontSize: 13, padding: '8px 16px' }}
                  >
                    Annual{' '}
                    <span style={{ fontSize: 11, fontWeight: 700, marginLeft: 4, color: '#16a34a' }}>
                      SAVE 2 MONTHS
                    </span>
                  </button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {([
                  {
                    key: 'starter',
                    name: 'Starter',
                    monthly: 79,
                    annual: 790,
                    perMonth: 65.83,
                    users: '10 users',
                    storage: '20GB',
                    features: ['CRM, Sales & Projects', '10 client portal seats', 'Notifications & Reports', 'Email support (48h)'],
                  },
                  {
                    key: 'pro',
                    name: 'Pro',
                    monthly: 149,
                    annual: 1490,
                    perMonth: 124.17,
                    users: '20 users',
                    storage: '75GB',
                    features: ['Finance & Production suite', 'Unlimited client portal seats', 'Approvals & full Reports', 'AI Workforce agents (COO, Finance, Sales)', 'Natural language AI reports', 'Priority support + chat'],
                  },
                  {
                    key: 'enterprise',
                    name: 'Enterprise',
                    monthly: 299,
                    annual: 2990,
                    perMonth: 249.17,
                    users: 'Unlimited users',
                    storage: '250GB',
                    features: ['HR module included', 'Client Stripe Connect', 'AI Workforce — all 4 agents + AI Reports', 'Website embed integration', 'White-label options', 'Dedicated same-day support'],
                  },
                ] as const).map((plan) => {
                  const isCurrent = data?.plan === plan.key;
                  const currentOrder = ['trial', 'starter', 'pro', 'enterprise'].indexOf(data?.plan ?? 'trial');
                  const planOrder = ['trial', 'starter', 'pro', 'enterprise'].indexOf(plan.key);
                  const isUpgrade = planOrder > currentOrder;

                  return (
                    <div
                      key={plan.key}
                      className="card p-5"
                      style={isCurrent ? { border: '2px solid var(--erp-blue)' } : {}}
                    >
                      {isCurrent && (
                        <div className="mb-3 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-[var(--erp-blue-soft)] text-[var(--erp-blue)]">
                          Current Plan
                        </div>
                      )}
                      <div className="font-black text-base">{plan.name}</div>
                      <div className="mt-2">
                        <span className="text-2xl font-black">
                          ${billingCycle === 'monthly' ? plan.monthly : plan.perMonth.toFixed(2)}
                        </span>
                        <span className="text-xs text-[var(--text-muted)]">/mo</span>
                      </div>
                      {billingCycle === 'annual' && (
                        <div className="text-xs font-semibold text-green-600 mb-1">
                          ${plan.annual}/yr — save ${plan.monthly * 12 - plan.annual}
                        </div>
                      )}
                      <div className="text-xs text-[var(--text-muted)] mt-1 mb-3">
                        {plan.users} · {plan.storage}
                      </div>
                      <ul className="space-y-1 mb-4">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-center gap-2 text-xs">
                            <span className="font-bold text-green-600">✓</span>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                      {isCurrent ? (
                        <div
                          className="btn subtle w-full text-center"
                          style={{ borderRadius: 999, fontSize: 13, cursor: 'default' }}
                        >
                          Your Plan
                        </div>
                      ) : isUpgrade ? (
                        <a
                          href="https://www.bizosto.com/pricing"
                          className="btn w-full text-center"
                          style={{ borderRadius: 999, fontSize: 13 }}
                        >
                          Upgrade
                        </a>
                      ) : (
                        <a
                          href="https://www.bizosto.com/pricing"
                          className="btn ghost w-full text-center"
                          style={{ borderRadius: 999, fontSize: 13 }}
                        >
                          Downgrade
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Manage Subscription */}
          <section className="card p-6">
            <h3 className="section-title mb-4">Manage Subscription</h3>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void openPortal()}
                disabled={portalLoading}
                className="btn ghost"
              >
                {portalLoading ? 'Opening…' : 'Open Billing Portal'}
              </button>
              <a href="https://www.bizosto.com/pricing" className="btn ghost">
                View Plans
              </a>
            </div>
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              The billing portal lets you upgrade, downgrade, or cancel your plan, view past invoices, and update your
              billing address.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}
