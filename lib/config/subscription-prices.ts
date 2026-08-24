import { z } from 'zod';

export const SUBSCRIPTION_PRICE_ENV_KEYS = [
  'STRIPE_PRICE_STARTER_MONTHLY',
  'STRIPE_PRICE_STARTER_ANNUAL',
  'STRIPE_PRICE_PRO_MONTHLY',
  'STRIPE_PRICE_PRO_ANNUAL',
  'STRIPE_PRICE_ENTERPRISE_MONTHLY',
  'STRIPE_PRICE_ENTERPRISE_ANNUAL',
] as const;

export type SubscriptionPriceEnvKey = (typeof SUBSCRIPTION_PRICE_ENV_KEYS)[number];
type EnvironmentMap = Readonly<Record<string, string | undefined>>;

const optionalPriceId = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
);

export const subscriptionPriceEnvSchema = z.object({
  STRIPE_PRICE_STARTER_MONTHLY: optionalPriceId,
  STRIPE_PRICE_STARTER_ANNUAL: optionalPriceId,
  STRIPE_PRICE_PRO_MONTHLY: optionalPriceId,
  STRIPE_PRICE_PRO_ANNUAL: optionalPriceId,
  STRIPE_PRICE_ENTERPRISE_MONTHLY: optionalPriceId,
  STRIPE_PRICE_ENTERPRISE_ANNUAL: optionalPriceId,
});

export type SubscriptionPriceDiagnostics = {
  state: 'not_configured' | 'partial' | 'complete';
  configured: SubscriptionPriceEnvKey[];
  missing: SubscriptionPriceEnvKey[];
};

/** Returns variable names and completeness only; price IDs are never returned. */
export function inspectSubscriptionPriceConfig(
  env: EnvironmentMap = process.env,
): SubscriptionPriceDiagnostics {
  const parsed = subscriptionPriceEnvSchema.parse(env);
  const configured = SUBSCRIPTION_PRICE_ENV_KEYS.filter((key) => Boolean(parsed[key]));
  const missing = SUBSCRIPTION_PRICE_ENV_KEYS.filter((key) => !parsed[key]);

  return {
    state:
      configured.length === 0 ? 'not_configured' : missing.length === 0 ? 'complete' : 'partial',
    configured,
    missing,
  };
}
