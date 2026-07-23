'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { Check, Minus } from 'lucide-react';
import { PricingCard } from '@/components/pricing/PricingCard';
import type {
  BillingCycle,
  CurrencyCode,
  CurrencyConfig,
  PricingPlan,
} from '@/components/pricing/types';

const plans: PricingPlan[] = [
  {
    name: 'Starter',
    price: { monthly: 79, annual: 790 },
    description: 'CRM, sales pipeline and project management for small teams.',
    features: [
      'Up to 10 users',
      '20GB storage',
      'CRM, Sales & Projects',
      '10 client portal seats',
      'Notifications included',
      'Email support (48h)',
    ],
    limits: '10 users max',
    cta: 'Start Free Trial',
  },
  {
    name: 'Pro',
    price: { monthly: 149, annual: 1490 },
    description: 'Full operations suite with finance, production and reporting.',
    popular: true,
    features: [
      'Up to 20 users',
      '75GB storage',
      'Finance & Production suite',
      'Unlimited client portal seats',
      'Approvals & full Reports',
      'Priority support + live chat',
    ],
    limits: '20 users max',
    cta: 'Start Free Trial',
  },
  {
    name: 'Enterprise',
    price: { monthly: 299, annual: 2990 },
    description: 'Everything including HR, client payments and white-label.',
    features: [
      'Unlimited users',
      '250GB storage',
      'All modules including HR',
      'Client Stripe Connect payments',
      'White-label options',
      'Dedicated same-day support',
      'Free onboarding session',
    ],
    limits: 'No limits',
    cta: 'Contact Sales',
  },
];

const currencies: Record<CurrencyCode, CurrencyConfig> = {
  USD: { symbol: '$', rateFromUSD: 1 },
  EUR: { symbol: '€', rateFromUSD: 0.92 },
  GBP: { symbol: '£', rateFromUSD: 0.79 },
};

const comparisonFeatures = [
  {
    label: 'User seats',
    tooltip: 'Maximum active user accounts included in the base subscription.',
  },
  {
    label: 'Storage',
    tooltip: 'Secure cloud storage available for files, attachments, and backups.',
  },
  { label: 'CRM & invoicing', tooltip: 'Customer management and invoice lifecycle features.' },
  {
    label: 'Advanced finance & HR',
    tooltip: 'Extended ERP modules for payroll, compliance, and forecasting.',
  },
  { label: 'API access', tooltip: 'Programmatic access for secure integrations and automations.' },
  { label: 'SSO / SAML', tooltip: 'Enterprise identity federation for secure single sign-on.' },
  { label: 'Priority support', tooltip: 'Faster SLA response times for support tickets.' },
  {
    label: 'Dedicated account manager',
    tooltip: 'Named advisor for onboarding and quarterly planning.',
  },
  {
    label: 'White-label branding',
    tooltip: 'Apply company branding to the platform and shared portals.',
  },
  { label: 'AI forecasting', tooltip: 'Machine-learning demand and cashflow forecasts.' },
] as const;

const comparisonMatrix = {
  Starter: {
    'User seats': '10',
    Storage: '20GB',
    'CRM & invoicing': true,
    'Advanced finance & HR': false,
    'API access': false,
    'SSO / SAML': false,
    'Priority support': false,
    'Dedicated account manager': false,
    'White-label branding': false,
    'AI forecasting': 'coming-soon',
  },
  Pro: {
    'User seats': '20',
    Storage: '75GB',
    'CRM & invoicing': true,
    'Advanced finance & HR': true,
    'API access': true,
    'SSO / SAML': 'coming-soon',
    'Priority support': true,
    'Dedicated account manager': false,
    'White-label branding': false,
    'AI forecasting': 'coming-soon',
  },
  Enterprise: {
    'User seats': 'Unlimited',
    Storage: '250GB',
    'CRM & invoicing': true,
    'Advanced finance & HR': true,
    'API access': true,
    'SSO / SAML': true,
    'Priority support': true,
    'Dedicated account manager': true,
    'White-label branding': true,
    'AI forecasting': true,
  },
} as const;

const faqs = [
  {
    question: 'What is included in the 14-day free trial?',
    answer:
      "You get full access to your selected plan's features, guided onboarding, and data import support. A card is required at signup, but you won't be charged until day 15 — cancel anytime before then and pay nothing.",
  },
  {
    question: 'Can I upgrade or downgrade at any time?',
    answer:
      'Yes. Plan changes take effect immediately, and billing is prorated automatically to avoid overcharging.',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      'We accept major credit cards, ACH for eligible regions, and annual invoice payments for Enterprise contracts.',
  },
  {
    question: 'Is there a setup fee?',
    answer:
      'There is no mandatory setup fee. Optional paid onboarding is available for data migration and process design.',
  },
  {
    question: 'What happens when the free trial ends?',
    answer:
      'You can choose a paid plan to continue immediately. If you do not subscribe, your workspace is paused and retained for 30 days.',
  },
  {
    question: 'Do you offer refunds?',
    answer:
      'Yes. Monthly subscriptions are covered by a 30-day money-back guarantee for first-time customers.',
  },
  {
    question: 'Can I cancel anytime?',
    answer:
      'Yes. You can cancel directly in billing settings. Access continues through the paid period with no cancellation penalties.',
  },
  {
    question: 'Is my data secure?',
    answer:
      'Bizosto uses encryption in transit and at rest, role-based access controls, audit trails, and continuous monitoring.',
  },
];

/**
 * P0-3b: four invented testimonials and a four-name logo wall were removed. Bizosto is
 * pre-revenue; none of those companies are customers, and one quote carried an unsourced
 * "42%" outcome metric. They are replaced with controls that are verifiable in this
 * repository. Nothing here is a claim we cannot point at code for.
 *
 *   - Tenant isolation: lib/tenant/ownership.ts + the CI guards in __tests__/api/
 *   - RBAC: 11 roles enforced at every API route
 *   - Audit trail: lib/audit.ts, written on privileged mutations
 *   - Encryption: TLS in transit, Google Cloud encryption at rest
 */
const verifiedControls = [
  {
    title: 'Tenant-isolated by default',
    detail:
      'Every record carries a tenant, and cross-tenant access is blocked at the API layer with automated tests that fail the build on regression.',
  },
  {
    title: 'Role-based access control',
    detail: '11 roles, enforced on every route rather than hidden in the interface.',
  },
  {
    title: 'Audit trail on privileged actions',
    detail: 'Who changed what, when, and from where — retained and exportable.',
  },
  {
    title: 'Encrypted in transit and at rest',
    detail: 'TLS everywhere, Google Cloud encryption at rest, no shared database credentials.',
  },
];

function renderComparisonValue(value: boolean | string) {
  if (value === 'coming-soon') {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
        Coming soon
      </span>
    );
  }

  if (typeof value === 'boolean') {
    return value ? (
      <Check className="mx-auto h-5 w-5 text-green-600" aria-label="Included" />
    ) : (
      <Minus className="mx-auto h-5 w-5 text-gray-400" aria-label="Not included" />
    );
  }

  return <span className="text-sm font-medium text-gray-800">{value}</span>;
}

export function PricingPageClient() {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const selectedCurrency = useMemo(() => currencies[currency], [currency]);

  return (
    <div className="bg-gray-50 text-gray-900">
      <header
        className={`sticky top-0 z-30 border-b bg-white/95 backdrop-blur transition-shadow ${
          isScrolled ? 'shadow-sm' : 'shadow-none'
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold text-gray-700">Bizosto Pricing</p>
          <div className="flex items-center gap-2">
            <Link
              href="/signup?trial=14"
              className="inline-flex h-10 items-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Start 14-Day Free Trial
            </Link>
            <Link
              href="/signup?demo=1"
              className="hidden h-10 items-center rounded-md border border-gray-300 px-4 text-sm font-semibold text-gray-900 hover:bg-gray-50 sm:inline-flex"
            >
              Schedule Demo
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-7xl px-4 pb-10 pt-14 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
              Flexible pricing for every growth stage
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-gray-600 sm:text-lg">
              Choose the plan that matches your operating model. Start with a 14-day trial and scale
              as your team grows.
            </p>
          </div>

          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setBillingCycle('monthly')}
                className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                  billingCycle === 'monthly' ? 'bg-blue-600 text-white' : 'text-gray-700'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle('annual')}
                className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                  billingCycle === 'annual' ? 'bg-blue-600 text-white' : 'text-gray-700'
                }`}
              >
                Annual <span className="text-xs">(Save 20%)</span>
              </button>
            </div>

            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              Currency
              <select
                value={currency}
                onChange={(event) => setCurrency(event.target.value as CurrencyCode)}
                className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-blue-600 focus:outline-none"
                aria-label="Select currency"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </label>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {plans.map((plan) => (
              <PricingCard
                key={plan.name}
                plan={plan}
                billingCycle={billingCycle}
                currency={currency}
                symbol={selectedCurrency.symbol}
                convertedMonthlyPrice={Math.round(
                  plan.price.monthly * selectedCurrency.rateFromUSD,
                )}
                convertedAnnualPrice={Math.round(plan.price.annual * selectedCurrency.rateFromUSD)}
              />
            ))}
          </div>
        </section>

        <section className="border-y border-gray-200 bg-white py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-gray-900">Feature comparison</h2>
            <p className="mt-3 text-gray-600">Compare exactly what is included in each plan.</p>

            <div className="mt-8 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Feature
                    </th>
                    {plans.map((plan) => (
                      <th
                        key={plan.name}
                        className={`px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide ${
                          plan.popular ? 'text-blue-700' : 'text-gray-500'
                        }`}
                      >
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {comparisonFeatures.map((feature) => (
                    <tr key={feature.label}>
                      <td className="px-4 py-3 text-sm text-gray-700" title={feature.tooltip}>
                        <span className="cursor-help border-b border-dotted border-gray-400">
                          {feature.label}
                        </span>
                      </td>
                      {plans.map((plan) => (
                        <td key={`${plan.name}-${feature.label}`} className="px-4 py-3 text-center">
                          {renderComparisonValue(
                            comparisonMatrix[plan.name][
                              feature.label as keyof (typeof comparisonMatrix)[typeof plan.name]
                            ],
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900">Built for operations you can audit</h2>
          <p className="mt-3 max-w-2xl text-sm text-gray-600">
            Bizosto is in founder-led beta. Rather than quote customers we do not yet have, here
            is what the platform enforces today — each of these is verifiable in the product.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {verifiedControls.map((item) => (
              <div key={item.title} className="rounded-xl border border-gray-200 bg-white p-6">
                <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
                <p className="mt-2 text-sm text-gray-700">{item.detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              'TLS in transit, encrypted at rest',
              'Role-based access control',
              'Audit trail on privileged actions',
            ].map((badge) => (
              <div
                key={badge}
                className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800"
              >
                {badge}
              </div>
            ))}
          </div>

          <p className="mt-6 text-xs text-gray-500">
            Bizosto is not SOC 2 certified and does not currently hold a third-party compliance
            attestation. Our{' '}
            <Link href="/security" className="font-medium text-blue-600 hover:underline">
              security practices
            </Link>{' '}
            page describes the controls that are in place today.
          </p>
        </section>

        <section className="border-t border-gray-200 bg-white py-14">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-gray-900">Frequently asked questions</h2>
            <div className="mt-8 space-y-4">
              {faqs.map((item) => (
                <details
                  key={item.question}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-5"
                >
                  <summary className="cursor-pointer text-sm font-semibold text-gray-900">
                    {item.question}
                  </summary>
                  <p className="mt-3 text-sm text-gray-600">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
