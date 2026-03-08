'use client';

import Script from 'next/script';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import { plans, type BillingPlanKey } from '@/lib/billing/plans';

type StripeCardElement = {
  mount: (selector: string | HTMLElement) => void;
  destroy: () => void;
};

type StripeElements = {
  create: (type: 'card', options?: Record<string, unknown>) => StripeCardElement;
};

type StripeSetupResult = {
  setupIntent?: {
    payment_method?: string | null;
  };
  error?: {
    message?: string;
  };
};

type StripeClient = {
  elements: () => StripeElements;
  confirmCardSetup: (
    clientSecret: string,
    data: { payment_method: { card: StripeCardElement } },
  ) => Promise<StripeSetupResult>;
};

declare global {
  interface Window {
    Stripe?: (publishableKey: string) => StripeClient;
  }
}

type SubscriptionResponse = {
  plan?: BillingPlanKey;
  status?: string;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  trialEndsAt?: string | null;
  hasPaymentMethod?: boolean;
  taxAmount?: number;
  subtotalAmount?: number;
  totalAmount?: number;
  billingAddress?: {
    country?: string;
    state?: string;
    city?: string;
    postalCode?: string;
  };
};

type InvoiceRecord = {
  id: string;
  amount?: number;
  currency?: string;
  status?: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  pdfUrl?: string | null;
};

type UsageRecord = {
  api_calls: number;
  storage: number;
  users: number;
};

const ALL_ROLES = [
  'admin',
  'super_admin',
  'finance',
  'sales',
  'sales_manager',
  'am',
  'am_manager',
  'production',
  'production_manager',
  'hr',
  'client',
];
const PLAN_OPTIONS: Array<'starter' | 'pro' | 'enterprise'> = ['starter', 'pro', 'enterprise'];
const countries = [
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'United Arab Emirates',
  'Saudi Arabia',
  'Pakistan',
  'India',
  'Germany',
  'France',
  'Spain',
  'Netherlands',
  'Singapore',
  'South Africa',
  'Nigeria',
  'Kenya',
  'Brazil',
  'Mexico',
  'Japan',
  'Other',
];

export default function BillingPage() {
  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null);
  const [usage, setUsage] = useState<UsageRecord>({ api_calls: 0, storage: 0, users: 0 });
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'pro' | 'enterprise' | null>(null);
  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null);
  const [stripeReady, setStripeReady] = useState(false);
  const [showChangePlanModal, setShowChangePlanModal] = useState(false);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [billingAddress, setBillingAddress] = useState({
    country: 'US',
    state: '',
    city: '',
    postalCode: '',
  });
  const stripeRef = useRef<StripeClient | null>(null);
  const cardRef = useRef<StripeCardElement | null>(null);

  const activePlan: BillingPlanKey = (subscription?.plan || 'starter') as BillingPlanKey;
  const showTrialPlanChooser = subscription?.plan === 'trial' && !subscription?.hasPaymentMethod;

  const usageView = useMemo(() => {
    const limit = plans[activePlan].limits;
    return [
      { key: 'users', label: 'Users', used: usage.users, limit: limit.users },
      { key: 'storage', label: 'Storage (bytes)', used: usage.storage, limit: limit.storage },
      { key: 'api_calls', label: 'API Calls', used: usage.api_calls, limit: limit.api_calls },
    ];
  }, [activePlan, usage]);

  const load = async () => {
    const [subRes, usageRes, invoicesRes] = await Promise.all([
      fetch('/api/billing/subscription', { cache: 'no-store' }),
      fetch('/api/billing/usage', { cache: 'no-store' }),
      fetch('/api/billing/invoices', { cache: 'no-store' }),
    ]);

    const subJson = await subRes.json();
    const usageJson = await usageRes.json();
    const invoicesJson = await invoicesRes.json();

    if (subJson.ok) {
      const nextSubscription = (subJson.subscription || null) as SubscriptionResponse | null;
      setSubscription(nextSubscription);
      if (nextSubscription?.billingAddress) {
        setBillingAddress({
          country: String(nextSubscription.billingAddress.country || 'US'),
          state: String(nextSubscription.billingAddress.state || ''),
          city: String(nextSubscription.billingAddress.city || ''),
          postalCode: String(nextSubscription.billingAddress.postalCode || ''),
        });
      }
    }
    if (usageJson.ok) setUsage(usageJson.usage || { api_calls: 0, storage: 0, users: 0 });
    if (invoicesJson.ok) setInvoices(invoicesJson.invoices || []);
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!setupClientSecret || !stripeReady) {
      return;
    }

    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey || !window.Stripe) {
      setError('Stripe is not configured for client payments');
      return;
    }

    const stripe = window.Stripe(publishableKey);
    const elements = stripe.elements();
    const card = elements.create('card');

    stripeRef.current = stripe;
    cardRef.current = card;

    const timeout = window.setTimeout(() => {
      card.mount('#trial-card-element');
    }, 0);

    return () => {
      window.clearTimeout(timeout);
      card.destroy();
      cardRef.current = null;
    };
  }, [setupClientSecret, stripeReady]);

  async function changePlan(plan: 'starter' | 'pro' | 'enterprise') {
    setBusy(true);
    setError('');
    setSuccess('');
    const res = await fetch('/api/billing/subscription/change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    });
    const json = await res.json();
    setBusy(false);
    if (!json.ok) return setError(json.error || 'Plan change failed');
    setSuccess(`Plan changed to ${plans[plan].name}`);
    setShowChangePlanModal(false);
    void load();
  }

  async function cancelSubscription() {
    if (!window.confirm('Cancel subscription at the end of your current billing period?')) return;

    setBusy(true);
    setError('');
    setSuccess('');

    const res = await fetch('/api/billing/subscription/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const json = await res.json();
    setBusy(false);
    if (!json.ok) return setError(json.error || 'Cancel failed');
    setSuccess(json.message || 'Subscription will cancel at period end');
    void load();
  }

  async function updatePaymentMethod() {
    setBusy(true);
    setError('');
    setSuccess('');

    const res = await fetch('/api/billing/payment-method', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentMethodId }),
    });

    const json = await res.json();
    setBusy(false);
    if (!json.ok) return setError(json.error || 'Payment method update failed');
    setSuccess('Payment method updated');
    setPaymentMethodId('');
  }

  async function startSubscriptionFlow(plan: 'starter' | 'pro' | 'enterprise') {
    setBusy(true);
    setError('');
    setSuccess('');
    setSelectedPlan(plan);

    const res = await fetch('/api/billing/setup-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const json = await res.json();

    setBusy(false);
    if (!json.ok || !json.clientSecret) {
      setSelectedPlan(null);
      return setError(json.error || 'Unable to initialize card setup');
    }

    setSetupClientSecret(json.clientSecret);
  }

  async function confirmCardAndSubscribe() {
    if (!selectedPlan || !setupClientSecret || !stripeRef.current || !cardRef.current) return;

    setBusy(true);
    setError('');

    const result = await stripeRef.current.confirmCardSetup(setupClientSecret, {
      payment_method: { card: cardRef.current },
    });

    if (result.error?.message) {
      setBusy(false);
      return setError(result.error.message);
    }

    const paymentMethodFromSetup = String(result.setupIntent?.payment_method || '').trim();
    if (!paymentMethodFromSetup) {
      setBusy(false);
      return setError('Card setup did not return a payment method');
    }

    const subscribeRes = await fetch('/api/billing/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: selectedPlan, paymentMethodId: paymentMethodFromSetup }),
    });

    const subscribeJson = await subscribeRes.json();
    setBusy(false);

    if (!subscribeJson.ok) {
      return setError(subscribeJson.error || 'Subscription activation failed');
    }

    setSuccess(`Subscription activated! Welcome to Bizosto ${plans[selectedPlan].name}.`);
    setSetupClientSecret(null);
    setSelectedPlan(null);
    window.location.reload();
  }

  const subtotal = Number(subscription?.subtotalAmount || plans[activePlan].price * 100);
  const taxAmount = Number(subscription?.taxAmount || 0);
  const totalAmount = Number(subscription?.totalAmount || subtotal + taxAmount);
  const taxRate = subtotal > 0 ? (taxAmount / subtotal) * 100 : 0;

  async function saveBillingAddress() {
    if (!billingAddress.country.trim()) {
      setError('Country is required');
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');

    const res = await fetch('/api/billing/address', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(billingAddress),
    });
    const json = await res.json();
    setBusy(false);

    if (!json.ok) {
      setError(json.error || 'Unable to update billing address');
      return;
    }

    setSuccess(json.message || 'Billing address updated');
    setShowAddressForm(false);
    void load();
  }

  return (
    <RequireAuth allowed={ALL_ROLES}>
      <Script
        src="https://js.stripe.com/v3/"
        strategy="afterInteractive"
        onLoad={() => setStripeReady(true)}
      />
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-8">
        <div className="flex gap-2 border-b border-[var(--border-subtle)] pb-3 text-sm font-medium">
          <Link href="/billing" className="rounded-md bg-[var(--erp-blue)] px-3 py-2 text-white">
            Subscription
          </Link>
          <Link href="/billing/terminal" className="rounded-md px-3 py-2 text-[var(--text-muted)] hover:bg-[var(--surface-muted)]">
            Payment Terminal
          </Link>
        </div>

        <header>
          <h1 className="text-2xl font-semibold">Billing & Subscription</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Manage subscription, payment methods, invoices, and usage metering.
          </p>
        </header>

        {error ? (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {success}
          </div>
        ) : null}

        {showTrialPlanChooser ? (
          <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
            <h2 className="text-lg font-semibold">Start Your Subscription</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Your 14-day free trial ends on{' '}
              {subscription?.trialEndsAt
                ? new Date(subscription.trialEndsAt).toLocaleDateString()
                : '-'}
              . Choose a plan to continue.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {PLAN_OPTIONS.map((key) => {
                const plan = plans[key];
                const isPro = key === 'pro';
                const isSelected = selectedPlan === key;
                return (
                  <div
                    key={key}
                    className={`relative rounded border p-4 ${isSelected ? 'border-[var(--erp-blue)]' : 'border-[var(--border-subtle)]'}`}
                  >
                    {isPro ? (
                      <span className="absolute right-3 top-3 rounded-full bg-[var(--erp-blue)] px-2 py-0.5 text-xs font-semibold text-white">
                        Most Popular
                      </span>
                    ) : null}
                    <div className="text-lg font-semibold">{plan.name}</div>
                    <div className="mt-1 text-2xl font-bold">${plan.price}/month + applicable tax</div>
                    <ul className="mt-3 list-disc pl-5 text-sm text-[var(--text-muted)]">
                      {plan.features.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                    <button
                      disabled={busy || !stripeReady}
                      onClick={() => startSubscriptionFlow(key)}
                      className="mt-4 rounded bg-[var(--erp-blue)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                      Select Plan
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              Tax is calculated automatically based on your billing location. The exact tax amount
              will appear on your invoice.
            </p>
            {setupClientSecret ? (
              <div className="mt-4 rounded border border-[var(--border-subtle)] p-4">
                <div className="mb-2 text-sm font-medium">
                  Enter card details to activate {selectedPlan ? plans[selectedPlan].name : 'your'}{' '}
                  plan
                </div>
                <div
                  id="trial-card-element"
                  className="rounded border border-[var(--border-subtle)] p-3"
                />
                <button
                  disabled={busy}
                  onClick={confirmCardAndSubscribe}
                  className="mt-3 rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  Confirm and Activate Subscription
                </button>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
          <h2 className="mb-4 text-lg font-semibold">Current Plan</h2>
          <div className="grid gap-2 text-sm md:grid-cols-3">
            <div>
              <div className="text-[var(--text-muted)]">Plan</div>
              <div className="font-medium">
                {plans[activePlan].name} (${plans[activePlan].price}/month)
              </div>
            </div>
            <div>
              <div className="text-[var(--text-muted)]">Status</div>
              <div className="font-medium">{subscription?.status || 'Not subscribed'}</div>
            </div>
            <div>
              <div className="text-[var(--text-muted)]">Next billing date</div>
              <div className="font-medium">
                {subscription?.currentPeriodEnd
                  ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                  : '-'}
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-2 text-sm md:grid-cols-3">
            <div>
              <div className="text-[var(--text-muted)]">Base price</div>
              <div className="font-medium">${(subtotal / 100).toFixed(2)}</div>
            </div>
            {taxAmount > 0 ? (
              <div>
                <div className="text-[var(--text-muted)]">Tax</div>
                <div className="font-medium">
                  ${(taxAmount / 100).toFixed(2)} ({taxRate.toFixed(2)}%)
                </div>
              </div>
            ) : null}
            <div>
              <div className="text-[var(--text-muted)]">Total</div>
              <div className="font-medium">${(totalAmount / 100).toFixed(2)}</div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              disabled={busy}
              onClick={cancelSubscription}
              className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              Cancel Subscription
            </button>
            <button
              disabled={busy}
              onClick={() => setShowChangePlanModal(true)}
              className="rounded bg-[var(--erp-blue)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              Change Plan
            </button>
          </div>
        </section>

        {showChangePlanModal ? (
          <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">Change Plan</h3>
              <button
                onClick={() => setShowChangePlanModal(false)}
                className="text-sm text-[var(--text-muted)]"
              >
                Close
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {PLAN_OPTIONS.map((key) => (
                <button
                  key={key}
                  disabled={busy || key === activePlan}
                  onClick={() => changePlan(key)}
                  className="rounded border border-[var(--border-subtle)] p-4 text-left disabled:opacity-60"
                >
                  <div className="text-lg font-semibold">{plans[key].name}</div>
                  <div className="text-sm text-[var(--text-muted)]">
                    ${plans[key].price}/month + applicable tax
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
          <h2 className="mb-4 text-lg font-semibold">Pricing & Plan Comparison</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {PLAN_OPTIONS.map((key) => {
              const plan = plans[key];
              const isCurrent = activePlan === key;
              return (
                <div
                  key={key}
                  className={`rounded border p-4 ${isCurrent ? 'border-[var(--erp-blue)]' : 'border-[var(--border-subtle)]'}`}
                >
                  <div className="text-lg font-semibold">{plan.name}</div>
                  <div className="mt-1 text-2xl font-bold">${plan.price}/month + applicable tax</div>
                  <ul className="mt-3 list-disc pl-5 text-sm text-[var(--text-muted)]">
                    {plan.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                  <div className="mt-4 flex gap-2">
                    <button
                      disabled
                      className="rounded bg-[var(--erp-blue)] px-3 py-2 text-sm font-medium text-white opacity-60"
                    >
                      {isCurrent ? 'Current' : 'Manage from Current Plan section'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
          <h2 className="mb-4 text-lg font-semibold">Billing Address</h2>
          <p className="mb-3 text-sm text-[var(--text-muted)]">
            Your billing address determines the tax rate applied to your subscription.
          </p>
          <div className="grid gap-2 text-sm md:grid-cols-2">
            <div>
              <div className="text-[var(--text-muted)]">Country</div>
              <div className="font-medium">{billingAddress.country || '-'}</div>
            </div>
            <div>
              <div className="text-[var(--text-muted)]">State</div>
              <div className="font-medium">{billingAddress.state || '-'}</div>
            </div>
          </div>
          <button
            onClick={() => setShowAddressForm((prev) => !prev)}
            className="mt-4 rounded bg-[var(--erp-blue)] px-4 py-2 text-sm font-medium text-white"
          >
            Update Billing Address
          </button>
          {showAddressForm ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <select
                value={billingAddress.country}
                onChange={(e) => setBillingAddress((prev) => ({ ...prev, country: e.target.value }))}
                className="rounded border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm"
              >
                {countries.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
              {billingAddress.country === 'US' || billingAddress.country === 'United States' ? (
                <input
                  value={billingAddress.state}
                  onChange={(e) => setBillingAddress((prev) => ({ ...prev, state: e.target.value }))}
                  placeholder="State"
                  className="rounded border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm"
                />
              ) : null}
              <input
                value={billingAddress.city}
                onChange={(e) => setBillingAddress((prev) => ({ ...prev, city: e.target.value }))}
                placeholder="City (optional)"
                className="rounded border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm"
              />
              <input
                value={billingAddress.postalCode}
                onChange={(e) => setBillingAddress((prev) => ({ ...prev, postalCode: e.target.value }))}
                placeholder="Postal Code (optional)"
                className="rounded border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm"
              />
              <button
                disabled={busy}
                onClick={saveBillingAddress}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                Save Address
              </button>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
          <h2 className="mb-4 text-lg font-semibold">Payment Method</h2>
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
              placeholder="Stripe payment method id (pm_...)"
              className="w-full rounded border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm"
            />
            <button
              disabled={busy || !paymentMethodId.trim()}
              onClick={updatePaymentMethod}
              className="rounded bg-[var(--erp-blue)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              Update payment method
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
          <h2 className="mb-4 text-lg font-semibold">Usage Dashboard</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {usageView.map((row) => {
              const pct = row.limit < 0 ? 0 : Math.round((row.used / row.limit) * 100);
              const warn = row.limit > 0 && pct >= 80;
              const blocked = row.limit > 0 && row.used >= row.limit;
              return (
                <div
                  key={row.key}
                  className={`rounded border p-3 ${blocked ? 'border-red-300 bg-red-50' : warn ? 'border-amber-300 bg-amber-50' : 'border-[var(--border-subtle)]'}`}
                >
                  <div className="text-sm text-[var(--text-muted)]">{row.label}</div>
                  <div className="mt-1 text-lg font-semibold">
                    {row.used} / {row.limit < 0 ? 'Unlimited' : row.limit}
                  </div>
                  {warn ? (
                    <div className="mt-1 text-xs font-medium text-amber-700">
                      Usage warning: above 80%
                    </div>
                  ) : null}
                  {blocked ? (
                    <div className="mt-1 text-xs font-medium text-red-700">
                      Limit reached. Upgrade required.
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
          <h2 className="mb-4 text-lg font-semibold">Billing History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                  <th className="py-2">Invoice</th>
                  <th className="py-2">Amount</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Period</th>
                  <th className="py-2">PDF</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-[var(--border-subtle)]">
                    <td className="py-2">{invoice.id}</td>
                    <td className="py-2">
                      {invoice.amount || 0} {invoice.currency || 'USD'}
                    </td>
                    <td className="py-2">{invoice.status || 'unknown'}</td>
                    <td className="py-2">
                      {invoice.periodStart || '-'} → {invoice.periodEnd || '-'}
                    </td>
                    <td className="py-2">
                      {invoice.pdfUrl ? (
                        <a
                          href={invoice.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--erp-blue)] underline"
                        >
                          Download
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-[var(--text-muted)]">
                      No invoices yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </RequireAuth>
  );
}
