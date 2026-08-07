// Canonical Stripe price IDs, sourced from env only. Prices are created once in the Stripe
// dashboard and referenced here — never created at runtime. getStripePriceId throws (fail closed)
// if the required price id is not configured, so checkout cannot silently fabricate pricing.
//
// This is the SINGLE source of truth for plan → Stripe price resolution. Keys are
// `${plan}_${cycle}` so both monthly and annual prices are addressable. The former
// monthly-only resolver in lib/billing/plans.ts was removed because it silently billed
// every annual subscriber at the monthly price on any plan change.
import type Stripe from 'stripe';

export type BillingCycle = 'monthly' | 'annual';
export type PaidPlanTier = 'starter' | 'pro' | 'enterprise';

const STRIPE_PRICE_ENV: Record<string, string> = {
  starter_monthly: 'STRIPE_PRICE_STARTER_MONTHLY',
  starter_annual: 'STRIPE_PRICE_STARTER_ANNUAL',
  pro_monthly: 'STRIPE_PRICE_PRO_MONTHLY',
  pro_annual: 'STRIPE_PRICE_PRO_ANNUAL',
  enterprise_monthly: 'STRIPE_PRICE_ENTERPRISE_MONTHLY',
  enterprise_annual: 'STRIPE_PRICE_ENTERPRISE_ANNUAL',
};

export function getStripePriceId(planKey: string): string {
  const envVar = STRIPE_PRICE_ENV[planKey];
  if (!envVar) {
    throw new Error(`Unknown plan key for Stripe pricing: ${planKey}`);
  }
  const priceId = (process.env[envVar] || '').trim();
  if (!priceId) {
    throw new Error(`Missing Stripe price id — set ${envVar} in the environment.`);
  }
  return priceId;
}

// Resolve the price id for a plan tier + explicit billing cycle.
export function getStripePriceIdForCycle(plan: PaidPlanTier, cycle: BillingCycle): string {
  return getStripePriceId(`${plan}_${cycle}`);
}

// Determine the billing cycle of a LIVE Stripe subscription from its first item's
// recurring interval. This is the authoritative source when changing an existing
// subscription's plan: it guarantees an annual subscriber stays annual (and a monthly
// one stays monthly) regardless of what — if anything — is cached on the tenant doc.
// Falls back to 'monthly' only when the interval is genuinely absent.
export function getSubscriptionBillingCycle(subscription: Stripe.Subscription): BillingCycle {
  const interval = subscription.items?.data?.[0]?.price?.recurring?.interval;
  return interval === 'year' ? 'annual' : 'monthly';
}
