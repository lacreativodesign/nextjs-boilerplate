// Canonical Stripe price IDs, sourced from env only. Prices are created once in the Stripe
// dashboard and referenced here — never created at runtime. getStripePriceId throws (fail closed)
// if the required price id is not configured, so checkout cannot silently fabricate pricing.

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
