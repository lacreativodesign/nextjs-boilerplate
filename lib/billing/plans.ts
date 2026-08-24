export type BillingPlanKey = 'trial' | 'starter' | 'pro' | 'enterprise';

export type BillingPlanDefinition = {
  name: string;
  /** Monthly list price in USD. */
  price: number;
  /** Annual list price in USD. Annual billing equals two months free. */
  annualPrice: number;
  currency: 'USD';
  interval: 'month';
  features: string[];
  limits: {
    users: number;
    clientPortalUsers: number;
    storage: number;
    api_calls: number;
  };
  stripePriceIdEnv: string;
  annualStripePriceIdEnv: string;
  taxBehavior: 'exclusive' | 'inclusive';
};

/** The plans a customer can actually buy. `trial` is a state, not a purchasable plan. */
export const PURCHASABLE_PLAN_KEYS = ['starter', 'pro', 'enterprise'] as const;
export type PurchasablePlanKey = (typeof PURCHASABLE_PLAN_KEYS)[number];

export type BillingCycle = 'monthly' | 'annual';

/** Annual billing equals two months free. */
export const ANNUAL_FREE_MONTHS = 2;

/**
 * S7: the Stripe checkout route keys prices as `${plan}_${cycle}`. Annual prices and
 * price-id envs existed but no UI ever produced an annual key, so annual billing —
 * part of the locked packages — was defined in code yet impossible to buy.
 */
export function toCheckoutPlanKey(plan: PurchasablePlanKey, cycle: BillingCycle): string {
  return `${plan}_${cycle}`;
}

export const plans: Record<BillingPlanKey, BillingPlanDefinition> = {
  trial: {
    name: 'Free Trial',
    price: 0,
    annualPrice: 0,
    currency: 'USD',
    interval: 'month',
    features: [
      '14-day free trial',
      'Modules included with your selected plan',
      'Card required at signup',
      "You won't be charged until day 15",
    ],
    limits: { users: 10, clientPortalUsers: 10, storage: 21474836480, api_calls: 15000 },
    stripePriceIdEnv: '',
    annualStripePriceIdEnv: '',
    taxBehavior: 'exclusive',
  },
  starter: {
    name: 'Starter',
    price: 79,
    annualPrice: 790,
    currency: 'USD',
    interval: 'month',
    features: [
      'Up to 10 users',
      '20GB storage',
      'CRM, Sales & Project management',
      '10 client portal seats',
      'Email support (48h)',
    ],
    limits: { users: 10, clientPortalUsers: 10, storage: 21474836480, api_calls: 15000 },
    stripePriceIdEnv: 'STRIPE_PRICE_STARTER_MONTHLY',
    annualStripePriceIdEnv: 'STRIPE_PRICE_STARTER_ANNUAL',
    taxBehavior: 'exclusive',
  },
  pro: {
    name: 'Pro',
    price: 149,
    annualPrice: 1490,
    currency: 'USD',
    interval: 'month',
    features: [
      'Up to 20 users',
      '75GB storage',
      'Full Finance & Production suite',
      'Unlimited client portal seats',
      'Approvals & full Reports',
      'AI Workforce — COO, Finance & Sales agents',
      'Natural language AI reports',
      'Website embed integration',
      'Priority support + live chat',
    ],
    limits: { users: 20, clientPortalUsers: -1, storage: 80530636800, api_calls: 100000 },
    stripePriceIdEnv: 'STRIPE_PRICE_PRO_MONTHLY',
    annualStripePriceIdEnv: 'STRIPE_PRICE_PRO_ANNUAL',
    taxBehavior: 'exclusive',
  },
  enterprise: {
    name: 'Enterprise',
    price: 299,
    annualPrice: 2990,
    currency: 'USD',
    interval: 'month',
    features: [
      'Unlimited users',
      '250GB storage',
      'All modules including HR',
      'Client Stripe Connect payments',
      'White-label options',
      'Dedicated same-day support',
      'Free onboarding session',
      'AI Workforce — all 4 agents + AI Reports',
      'Website embed integration',
    ],
    limits: { users: -1, clientPortalUsers: -1, storage: 268435456000, api_calls: -1 },
    stripePriceIdEnv: 'STRIPE_PRICE_ENTERPRISE_MONTHLY',
    annualStripePriceIdEnv: 'STRIPE_PRICE_ENTERPRISE_ANNUAL',
    taxBehavior: 'exclusive',
  },
};

export function normalizePlanKey(value: unknown): BillingPlanKey {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (
    normalized === 'trial' ||
    normalized === 'starter' ||
    normalized === 'pro' ||
    normalized === 'enterprise'
  ) {
    return normalized;
  }
  return 'starter';
}

// NOTE: plan → Stripe price resolution now lives solely in lib/billing/stripe-prices.ts,
// which is billing-cycle aware. The former monthly-only getStripePriceId that lived here
// silently billed annual subscribers at the monthly price on every plan change and has
// been removed. The stripePriceIdEnv / annualStripePriceIdEnv fields below are retained as
// human-readable documentation of which env var backs each plan+cycle.
