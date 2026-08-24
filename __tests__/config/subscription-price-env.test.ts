import {
  inspectSubscriptionPriceConfig,
  SUBSCRIPTION_PRICE_ENV_KEYS,
} from '@/lib/config/subscription-prices';

describe('six-plan-price environment contract', () => {
  it('locks all three monthly and three annual variable names', () => {
    expect(SUBSCRIPTION_PRICE_ENV_KEYS).toEqual([
      'STRIPE_PRICE_STARTER_MONTHLY',
      'STRIPE_PRICE_STARTER_ANNUAL',
      'STRIPE_PRICE_PRO_MONTHLY',
      'STRIPE_PRICE_PRO_ANNUAL',
      'STRIPE_PRICE_ENTERPRISE_MONTHLY',
      'STRIPE_PRICE_ENTERPRISE_ANNUAL',
    ]);
  });

  it('reports names and completeness without returning price values', () => {
    const env = Object.fromEntries(
      SUBSCRIPTION_PRICE_ENV_KEYS.map((key) => [key, `price_secret_${key}`]),
    );
    const diagnostics = inspectSubscriptionPriceConfig(env);
    expect(diagnostics.state).toBe('complete');
    expect(diagnostics.missing).toEqual([]);
    expect(JSON.stringify(diagnostics)).not.toContain('price_secret_');
  });

  it('distinguishes partial from intentionally unconfigured', () => {
    expect(inspectSubscriptionPriceConfig({}).state).toBe('not_configured');
    expect(
      inspectSubscriptionPriceConfig({
        STRIPE_PRICE_STARTER_MONTHLY: 'price_one',
      }).state,
    ).toBe('partial');
  });
});
