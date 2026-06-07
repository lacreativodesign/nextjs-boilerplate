'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTenantContext } from '@/lib/tenant/useTenantContext';

const PLANS = [
  {
    key: 'starter',
    name: 'Starter',
    price: '$79',
    period: '/month',
    tagline: 'Perfect for small teams getting started',
    color: '#6366f1',
    badge: undefined as string | undefined,
    features: [
      'Up to 10 users',
      'Core CRM & Projects',
      'Finance & Invoicing',
      '5GB storage',
      'Email support',
    ],
    cta: 'Get Started',
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '$149',
    period: '/month',
    tagline: 'For growing businesses that need more power',
    color: '#8b5cf6',
    badge: 'Most Popular',
    features: [
      'Up to 50 users',
      'All Starter features',
      'HR Module',
      'AI Workforce (BYOK)',
      'Website embed',
      '25GB storage',
      'Priority support',
      'Advanced reports',
    ],
    cta: 'Upgrade to Pro',
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    price: '$299',
    period: '/month',
    tagline: 'For established teams that need everything',
    color: '#f59e0b',
    badge: 'Best Value',
    features: [
      'Unlimited users',
      'All Pro features',
      'White-label branding',
      'Custom domain',
      'Client Stripe Connect',
      '250GB storage',
      'Dedicated support',
      'AI Workforce — 4 agents + AI Reports',
      'Free onboarding session',
    ],
    cta: 'Upgrade to Enterprise',
  },
] as const;

const ADD_ONS = [
  {
    key: 'extra_storage',
    name: 'Extra Storage (50GB)',
    price: '$19/month',
    description: 'Add 50GB of document and file storage to any plan.',
  },
  {
    key: 'extra_users',
    name: 'Additional Users (10-pack)',
    price: '$29/month',
    description: 'Add 10 more user seats to your current plan.',
  },
  {
    key: 'onboarding',
    name: 'Professional Onboarding',
    price: '$299 once',
    description: '3 live sessions with a Bizosto expert to set up your workspace.',
  },
  {
    key: 'ai_workforce_extra',
    name: 'Extra AI Agents',
    price: '$49/month',
    description: 'Add 2 more AI agents to your AI Workforce.',
  },
] as const;

type PlanKey = (typeof PLANS)[number]['key'];

type SubscriptionResponse = {
  ok?: boolean;
  error?: string;
  subscription?: {
    plan?: string | null;
    status?: string | null;
  } | null;
};

type CheckoutResponse = {
  ok?: boolean;
  url?: string | null;
  error?: string;
};

const PLAN_ORDER: PlanKey[] = ['starter', 'pro', 'enterprise'];

function normalizePlanKey(value: unknown): PlanKey | null {
  const normalized = String(value || '')
    .toLowerCase()
    .trim();
  return PLAN_ORDER.includes(normalized as PlanKey) ? (normalized as PlanKey) : null;
}

function getRecommendedPlan(currentPlan: PlanKey | null): PlanKey {
  if (!currentPlan) return 'pro';
  const currentIndex = PLAN_ORDER.indexOf(currentPlan);
  return PLAN_ORDER[Math.min(currentIndex + 1, PLAN_ORDER.length - 1)];
}

export default function BillingUpgradePage() {
  const { data: tenantContext, loading: tenantLoading } = useTenantContext();
  const [currentPlan, setCurrentPlan] = useState<PlanKey | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<PlanKey | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const loadSubscription = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/billing/subscription', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
      });
      const body = (await response.json().catch(() => null)) as SubscriptionResponse | null;

      if (!response.ok || !body?.ok) {
        throw new Error(body?.error || 'Unable to load subscription.');
      }

      setCurrentPlan(normalizePlanKey(body.subscription?.plan));
      setSubscriptionStatus(body.subscription?.status || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load subscription.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSubscription();
  }, [loadSubscription]);

  const recommendedPlan = useMemo(() => getRecommendedPlan(currentPlan), [currentPlan]);

  const startCheckout = useCallback(
    async (planKey: PlanKey) => {
      setCheckoutPlan(planKey);
      setCheckoutError(null);

      try {
        const response = await fetch('/api/stripe/checkout', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan: planKey,
            tenantId: tenantContext?.tenant?.id || undefined,
          }),
        });
        const body = (await response.json().catch(() => null)) as CheckoutResponse | null;

        if (!response.ok || !body?.url) {
          throw new Error(body?.error || 'Unable to start checkout.');
        }

        window.location.assign(body.url);
      } catch (err) {
        setCheckoutError(err instanceof Error ? err.message : 'Unable to start checkout.');
        setCheckoutPlan(null);
      }
    },
    [tenantContext?.tenant?.id],
  );

  return (
    <main className="page-frame py-8 text-[var(--text-primary)]">
      <div className="mb-6">
        <Link
          href="/billing"
          className="text-sm font-semibold text-[var(--erp-blue)] hover:underline"
        >
          ← Back to billing
        </Link>
      </div>
      <div className="mb-6">
        <h1 className="page-title">Premium Upgrade</h1>
        <p className="page-subtitle">Choose the right plan for your team.</p>
      </div>

      <section className="relative overflow-hidden rounded-[2rem] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-8 shadow-[var(--shadow-md)] sm:p-10">
        <div className="absolute inset-0 opacity-70 [background:radial-gradient(circle_at_top_left,_rgba(99,102,241,0.24),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.18),_transparent_30%)]" />
        <div className="relative max-w-3xl">
          <p className="helper-text mb-3 uppercase tracking-[0.24em]">Premium upgrade</p>
          <h1 className="page-title">Choose Your Plan</h1>
          <p className="page-subtitle mt-3">Upgrade anytime, cancel anytime.</p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm text-[var(--text-muted)]">
            <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-2">
              Workspace: {tenantLoading ? 'Loading…' : tenantContext?.tenant?.name || 'Bizosto'}
            </span>
            <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-2">
              Current plan:{' '}
              {loading
                ? 'Loading…'
                : currentPlan
                  ? PLANS.find((plan) => plan.key === currentPlan)?.name
                  : 'Trial'}
            </span>
            {subscriptionStatus && (
              <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-2">
                Status: {subscriptionStatus}
              </span>
            )}
          </div>
        </div>
      </section>

      {error && (
        <div className="mt-6 rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] p-5 text-sm text-[var(--danger)]">
          <div className="font-semibold">{error}</div>
          <button type="button" onClick={() => void loadSubscription()} className="btn mt-4">
            Retry
          </button>
        </div>
      )}

      {checkoutError && (
        <div className="mt-6 rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] p-5 text-sm font-semibold text-[var(--danger)]">
          {checkoutError}
        </div>
      )}

      <section className="mt-8 grid gap-5 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.key;
          const isRecommended = recommendedPlan === plan.key && !isCurrent;
          const isCheckoutLoading = checkoutPlan === plan.key;

          return (
            <article
              key={plan.key}
              className="relative flex min-h-full flex-col overflow-hidden rounded-[1.75rem] border bg-[var(--surface-card)] p-6 shadow-[var(--shadow-sm)] transition-all duration-200"
              style={{
                borderColor: isCurrent || isRecommended ? plan.color : 'var(--border-subtle)',
                boxShadow: isRecommended
                  ? `0 0 0 1px ${plan.color}, 0 22px 60px color-mix(in srgb, ${plan.color} 30%, transparent)`
                  : 'var(--shadow-sm)',
              }}
            >
              <div
                className="absolute inset-x-0 top-0 h-32 opacity-20"
                style={{ background: `linear-gradient(135deg, ${plan.color}, transparent)` }}
              />
              <div className="relative flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black">{plan.name}</h2>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">{plan.tagline}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {isCurrent && (
                    <span className="rounded-full bg-[var(--erp-blue-soft)] px-3 py-1 text-xs font-black text-[var(--erp-blue)]">
                      Current Plan
                    </span>
                  )}
                  {!isCurrent && isRecommended && (
                    <span
                      className="rounded-full px-3 py-1 text-xs font-black text-white"
                      style={{ backgroundColor: plan.color }}
                    >
                      Recommended
                    </span>
                  )}
                  {plan.badge && (
                    <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-1 text-xs font-bold text-[var(--text-primary)]">
                      {plan.badge}
                    </span>
                  )}
                </div>
              </div>

              <div className="relative mt-7 flex items-end gap-1">
                <span className="text-5xl font-black tracking-tight">{plan.price}</span>
                <span className="pb-2 text-sm font-semibold text-[var(--text-muted)]">
                  {plan.period}
                </span>
              </div>

              <ul className="relative mt-7 flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex gap-3 text-sm leading-6 text-[var(--text-primary)]"
                  >
                    <span
                      className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-black text-white"
                      style={{ backgroundColor: plan.color }}
                    >
                      ✓
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                disabled={isCurrent || loading || isCheckoutLoading}
                onClick={() => void startCheckout(plan.key)}
                className={
                  isCurrent
                    ? 'btn ghost mt-8 w-full justify-center'
                    : 'btn mt-8 w-full justify-center'
                }
                style={{
                  borderRadius: 999,
                  background: isCurrent
                    ? undefined
                    : `linear-gradient(135deg, ${plan.color}, color-mix(in srgb, ${plan.color} 68%, #111827))`,
                  borderColor: isCurrent ? undefined : plan.color,
                  opacity: isCurrent ? 0.65 : undefined,
                }}
              >
                {isCurrent ? 'Current Plan' : isCheckoutLoading ? 'Opening checkout…' : plan.cta}
              </button>
            </article>
          );
        })}
      </section>

      <section className="mt-10 rounded-[1.75rem] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6 shadow-[var(--shadow-sm)] sm:p-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="helper-text mb-2 uppercase tracking-[0.2em]">Add-ons</p>
            <h2 className="section-title">Extend your workspace</h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Add capacity and expert support without changing plans.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {ADD_ONS.map((addOn) => (
            <div
              key={addOn.key}
              className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-5 transition-colors hover:border-[var(--erp-blue)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-black text-[var(--text-primary)]">{addOn.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                    {addOn.description}
                  </p>
                </div>
                <div className="shrink-0 rounded-full bg-[var(--surface-card)] px-3 py-1 text-sm font-black text-[var(--text-primary)] shadow-[var(--shadow-sm)]">
                  {addOn.price}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
