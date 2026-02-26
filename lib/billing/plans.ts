export type BillingPlanKey = 'trial' | 'starter' | 'pro' | 'enterprise';

export type BillingPlanDefinition = {
  name: string;
  price: number;
  currency: 'USD';
  interval: 'month';
  features: string[];
  limits: {
    users: number;
    storage: number;
    api_calls: number;
  };
  stripePriceIdEnv: string;
};

export const plans: Record<BillingPlanKey, BillingPlanDefinition> = {
  trial: {
    name: 'Free Trial',
    price: 0,
    currency: 'USD',
    interval: 'month',
    features: [
      '14-day free trial',
      'Full access to all selected modules',
      'No credit card required',
    ],
    limits: { users: 10, storage: 5368709120, api_calls: 10000 },
    stripePriceIdEnv: '',
  },
  starter: {
    name: 'Starter',
    price: 99,
    currency: 'USD',
    interval: 'month',
    features: ['10 users', '5GB storage', 'Basic support'],
    limits: { users: 10, storage: 5368709120, api_calls: 10000 },
    stripePriceIdEnv: 'STRIPE_PRICE_STARTER_MONTHLY',
  },
  pro: {
    name: 'Pro',
    price: 299,
    currency: 'USD',
    interval: 'month',
    features: ['50 users', '50GB storage', 'Priority support', 'Advanced reports'],
    limits: { users: 50, storage: 53687091200, api_calls: 100000 },
    stripePriceIdEnv: 'STRIPE_PRICE_PRO_MONTHLY',
  },
  enterprise: {
    name: 'Enterprise',
    price: 799,
    currency: 'USD',
    interval: 'month',
    features: ['Unlimited users', 'Unlimited storage', 'Dedicated support', 'Custom integrations'],
    limits: { users: -1, storage: -1, api_calls: -1 },
    stripePriceIdEnv: 'STRIPE_PRICE_ENTERPRISE_MONTHLY',
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

export function getStripePriceId(plan: BillingPlanKey): string {
  const envKey = plans[plan].stripePriceIdEnv;
  if (!envKey) {
    throw new Error(`Plan ${plan} does not map to a Stripe price id.`);
  }

  const priceId = process.env[envKey];
  if (!priceId) {
    throw new Error(`Missing Stripe price id env: ${envKey}`);
  }
  return priceId;
}
