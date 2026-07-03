import Link from 'next/link';
import { Check } from 'lucide-react';
import type { BillingCycle, CurrencyCode, PricingPlan } from '@/components/pricing/types';

interface PricingCardProps {
  plan: PricingPlan;
  billingCycle: BillingCycle;
  currency: CurrencyCode;
  symbol: string;
  convertedMonthlyPrice: number;
  convertedAnnualPrice: number;
}

export function PricingCard({
  plan,
  billingCycle,
  currency,
  symbol,
  convertedMonthlyPrice,
  convertedAnnualPrice,
}: PricingCardProps) {
  const isAnnual = billingCycle === 'annual';
  const price = isAnnual ? convertedAnnualPrice : convertedMonthlyPrice;
  const secondaryMonthly = isAnnual ? Math.round(convertedAnnualPrice / 12) : null;

  return (
    <article
      className={`relative flex h-full flex-col rounded-2xl border bg-white p-6 shadow-sm transition hover:shadow-md ${
        plan.popular ? 'border-blue-600 ring-2 ring-blue-100' : 'border-gray-200'
      }`}
      aria-label={`${plan.name} plan`}
    >
      {plan.popular ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
          Most Popular
        </span>
      ) : null}

      <h3 className="text-2xl font-semibold text-gray-900">{plan.name}</h3>
      <p className="mt-2 text-sm text-gray-600">{plan.description}</p>

      <div className="mt-6">
        <p className="text-4xl font-bold text-gray-900">
          {symbol}
          {price.toLocaleString('en-US')}
          <span className="ml-1 text-sm font-medium text-gray-500">
            /{isAnnual ? 'year' : 'month'}
          </span>
        </p>
        {isAnnual ? (
          <>
            <p className="mt-1 text-sm text-gray-600">
              {symbol}
              {secondaryMonthly?.toLocaleString('en-US')}/month billed annually
            </p>
            <p className="mt-1 text-sm font-medium text-green-700">Save 20% with annual billing</p>
          </>
        ) : null}
        <p className="mt-1 text-xs text-gray-500">Currency: {currency}</p>
      </div>

      <ul className="mt-6 space-y-3 text-sm text-gray-700">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 text-green-600" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-sm font-medium text-gray-600">{plan.limits}</p>

      <Link
        href={plan.name === 'Enterprise' ? '/signup?contact=sales' : '/signup'}
        className={`mt-6 inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-semibold transition ${
          plan.popular
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'border border-gray-300 bg-white text-gray-900 hover:bg-gray-50'
        }`}
      >
        {plan.cta}
      </Link>
    </article>
  );
}
