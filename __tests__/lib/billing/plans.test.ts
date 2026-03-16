import { plans, normalizePlanKey, getStripePriceId } from '@/lib/billing/plans';

describe('lib/billing/plans', () => {
  describe('plans object', () => {
    it('trial plan has price of 0', () => {
      expect(plans.trial.price).toBe(0);
    });

    it('starter plan has price of 99', () => {
      expect(plans.starter.price).toBe(99);
    });

    it('pro plan has price of 299', () => {
      expect(plans.pro.price).toBe(299);
    });

    it('enterprise plan has price of 799', () => {
      expect(plans.enterprise.price).toBe(799);
    });

    it('starter plan limits 10 users', () => {
      expect(plans.starter.limits.users).toBe(10);
    });

    it('pro plan limits 50 users', () => {
      expect(plans.pro.limits.users).toBe(50);
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

  describe('getStripePriceId', () => {
    it('throws for trial plan (no price id)', () => {
      expect(() => getStripePriceId('trial')).toThrow();
    });

    it('throws when env var is missing for starter', () => {
      delete process.env.STRIPE_PRICE_STARTER_MONTHLY;
      expect(() => getStripePriceId('starter')).toThrow();
    });

    it('returns env var value for starter when set', () => {
      process.env.STRIPE_PRICE_STARTER_MONTHLY = 'price_test_starter';
      expect(getStripePriceId('starter')).toBe('price_test_starter');
      delete process.env.STRIPE_PRICE_STARTER_MONTHLY;
    });

    it('returns env var value for pro when set', () => {
      process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_test_pro';
      expect(getStripePriceId('pro')).toBe('price_test_pro');
      delete process.env.STRIPE_PRICE_PRO_MONTHLY;
    });

    it('returns env var value for enterprise when set', () => {
      process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY = 'price_test_enterprise';
      expect(getStripePriceId('enterprise')).toBe('price_test_enterprise');
      delete process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY;
    });
  });
});
