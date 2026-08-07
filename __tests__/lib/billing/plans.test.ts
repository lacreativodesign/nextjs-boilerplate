import { plans, normalizePlanKey } from '@/lib/billing/plans';
import { getStripePriceId, getStripePriceIdForCycle } from '@/lib/billing/stripe-prices';

describe('lib/billing/plans', () => {
  describe('plans object', () => {
    it('trial plan has price of 0', () => {
      expect(plans.trial.price).toBe(0);
    });

    it('starter plan has price of 79', () => {
      expect(plans.starter.price).toBe(79);
    });

    it('pro plan has price of 149', () => {
      expect(plans.pro.price).toBe(149);
    });

    it('enterprise plan has price of 299', () => {
      expect(plans.enterprise.price).toBe(299);
    });

    it('starter plan limits 10 users', () => {
      expect(plans.starter.limits.users).toBe(10);
    });

    it('pro plan limits 20 users', () => {
      expect(plans.pro.limits.users).toBe(20);
    });

    it('enterprise plan has unlimited users (-1)', () => {
      expect(plans.enterprise.limits.users).toBe(-1);
    });

    it('trial plan has no stripePriceIdEnv', () => {
      expect(plans.trial.stripePriceIdEnv).toBe('');
    });

    it('starter plan maps to correct env var name', () => {
      expect(plans.starter.stripePriceIdEnv).toBe('STRIPE_PRICE_STARTER_MONTHLY');
    });

    it('pro plan maps to correct env var name', () => {
      expect(plans.pro.stripePriceIdEnv).toBe('STRIPE_PRICE_PRO_MONTHLY');
    });

    it('enterprise plan maps to correct env var name', () => {
      expect(plans.enterprise.stripePriceIdEnv).toBe('STRIPE_PRICE_ENTERPRISE_MONTHLY');
    });

    it('all paid plans have exclusive tax behavior', () => {
      expect(plans.starter.taxBehavior).toBe('exclusive');
      expect(plans.pro.taxBehavior).toBe('exclusive');
      expect(plans.enterprise.taxBehavior).toBe('exclusive');
    });

    it('all plans have USD currency', () => {
      (['trial', 'starter', 'pro', 'enterprise'] as const).forEach((key) => {
        expect(plans[key].currency).toBe('USD');
      });
    });

    it('all plans have monthly interval', () => {
      (['trial', 'starter', 'pro', 'enterprise'] as const).forEach((key) => {
        expect(plans[key].interval).toBe('month');
      });
    });
  });

  describe('normalizePlanKey', () => {
    it('returns trial for "trial"', () => {
      expect(normalizePlanKey('trial')).toBe('trial');
    });

    it('returns starter for "starter"', () => {
      expect(normalizePlanKey('starter')).toBe('starter');
    });

    it('returns pro for "pro"', () => {
      expect(normalizePlanKey('pro')).toBe('pro');
    });

    it('returns enterprise for "enterprise"', () => {
      expect(normalizePlanKey('enterprise')).toBe('enterprise');
    });

    it('normalizes uppercase input', () => {
      expect(normalizePlanKey('STARTER')).toBe('starter');
      expect(normalizePlanKey('PRO')).toBe('pro');
    });

    it('trims whitespace', () => {
      expect(normalizePlanKey('  pro  ')).toBe('pro');
    });

    it('returns starter as default for unknown values', () => {
      expect(normalizePlanKey('unknown')).toBe('starter');
      expect(normalizePlanKey('')).toBe('starter');
      expect(normalizePlanKey(null)).toBe('starter');
      expect(normalizePlanKey(undefined)).toBe('starter');
    });
  });

  describe('getStripePriceId (stripe-prices, cycle-keyed)', () => {
    it('throws for an unknown plan key', () => {
      expect(() => getStripePriceId('trial')).toThrow();
      expect(() => getStripePriceId('starter')).toThrow();
    });

    it('throws when the env var is missing for a valid key', () => {
      delete process.env.STRIPE_PRICE_STARTER_MONTHLY;
      expect(() => getStripePriceId('starter_monthly')).toThrow();
    });

    it('returns the env value for the monthly key when set', () => {
      process.env.STRIPE_PRICE_STARTER_MONTHLY = 'price_test_starter_m';
      expect(getStripePriceId('starter_monthly')).toBe('price_test_starter_m');
      delete process.env.STRIPE_PRICE_STARTER_MONTHLY;
    });

    it('returns the env value for the annual key when set', () => {
      process.env.STRIPE_PRICE_PRO_ANNUAL = 'price_test_pro_a';
      expect(getStripePriceId('pro_annual')).toBe('price_test_pro_a');
      delete process.env.STRIPE_PRICE_PRO_ANNUAL;
    });
  });

  describe('getStripePriceIdForCycle', () => {
    it('resolves the monthly price for a plan + monthly cycle', () => {
      process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY = 'price_ent_m';
      expect(getStripePriceIdForCycle('enterprise', 'monthly')).toBe('price_ent_m');
      delete process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY;
    });

    it('resolves the ANNUAL price for a plan + annual cycle (regression: annual must not fall back to monthly)', () => {
      process.env.STRIPE_PRICE_STARTER_MONTHLY = 'price_starter_m';
      process.env.STRIPE_PRICE_STARTER_ANNUAL = 'price_starter_a';
      expect(getStripePriceIdForCycle('starter', 'annual')).toBe('price_starter_a');
      delete process.env.STRIPE_PRICE_STARTER_MONTHLY;
      delete process.env.STRIPE_PRICE_STARTER_ANNUAL;
    });
  });
});
