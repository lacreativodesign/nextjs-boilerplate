import * as fs from 'fs';
import * as path from 'path';
import {
  ANNUAL_FREE_MONTHS,
  PURCHASABLE_PLAN_KEYS,
  plans,
  toCheckoutPlanKey,
} from '@/lib/billing/plans';

/**
 * S7 — Plan copy truth + annual billing.
 *
 * The billing upgrade page hardcoded plan copy that contradicted the locked packages:
 * it overstated Pro's seat count and storage, sold HR (Enterprise-only) as a Pro
 * feature, sold Finance (a Pro module) as a Starter feature, understated Starter's
 * storage, and advertised four paid add-ons that do not exist and cannot be purchased.
 *
 * Separately, annual pricing and annual Stripe price-id envs existed and the checkout
 * route already understood `${plan}_annual` keys — but no UI ever produced one, so
 * annual billing was defined in code yet impossible to buy.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('S7: canonical catalog matches the locked packages', () => {
  it('prices are $79 / $149 / $299 monthly', () => {
    expect(plans.starter.price).toBe(79);
    expect(plans.pro.price).toBe(149);
    expect(plans.enterprise.price).toBe(299);
  });

  it('annual is two months free: $790 / $1,490 / $2,990', () => {
    expect(ANNUAL_FREE_MONTHS).toBe(2);
    expect(plans.starter.annualPrice).toBe(790);
    expect(plans.pro.annualPrice).toBe(1490);
    expect(plans.enterprise.annualPrice).toBe(2990);
  });

  it('annual price equals ten months of the monthly price', () => {
    PURCHASABLE_PLAN_KEYS.forEach((key) => {
      expect(plans[key].annualPrice).toBe(plans[key].price * (12 - ANNUAL_FREE_MONTHS));
    });
  });

  it('seat limits are 10 / 20 / unlimited', () => {
    expect(plans.starter.limits.users).toBe(10);
    expect(plans.pro.limits.users).toBe(20);
    expect(plans.enterprise.limits.users).toBe(-1);
  });

  it('every purchasable plan maps to a monthly AND an annual price-id env', () => {
    PURCHASABLE_PLAN_KEYS.forEach((key) => {
      expect(plans[key].stripePriceIdEnv).toBeTruthy();
      expect(plans[key].annualStripePriceIdEnv).toBeTruthy();
    });
  });
});

describe('S7: annual is actually purchasable', () => {
  it('builds the checkout key the Stripe route expects', () => {
    expect(toCheckoutPlanKey('pro', 'annual')).toBe('pro_annual');
    expect(toCheckoutPlanKey('starter', 'monthly')).toBe('starter_monthly');
  });

  it('the checkout route understands every annual key', () => {
    const src = read('app/api/stripe/checkout/route.ts');
    PURCHASABLE_PLAN_KEYS.forEach((key) => {
      expect(src).toContain(`${key}_annual`);
    });
  });

  it('both purchase surfaces send a cycle-qualified plan key', () => {
    expect(read('app/billing/upgrade/page.tsx')).toContain('toCheckoutPlanKey(');
    expect(read('app/signup/page.tsx')).toContain('toCheckoutPlanKey(');
  });
});

describe('S7: the upgrade page no longer mis-sells the product', () => {
  const src = read('app/billing/upgrade/page.tsx');

  it('does not repeat the false Pro claims', () => {
    expect(src).not.toContain('Up to 50 users');
    expect(src).not.toContain('25GB storage');
    expect(src).not.toContain('HR Module');
  });

  it('does not repeat the false Starter claims', () => {
    expect(src).not.toContain('Finance & Invoicing');
    expect(src).not.toContain('5GB storage');
  });

  it('advertises no unpurchasable add-ons', () => {
    expect(src).not.toContain('ADD_ONS');
    expect(src).not.toContain('Extra Storage');
    expect(src).not.toContain('Additional Users');
  });

  it('reads its features from the canonical catalog', () => {
    expect(src).toContain("from '@/lib/billing/plans'");
    expect(src).toContain('PLAN_CATALOG');
  });
});

describe('S7: HR remains Enterprise-only in the copy customers see', () => {
  it('the catalog only mentions HR on enterprise', () => {
    const mentionsHr = (features: string[]) => features.some((f) => /\bHR\b/i.test(f));
    expect(mentionsHr(plans.starter.features)).toBe(false);
    expect(mentionsHr(plans.pro.features)).toBe(false);
    expect(mentionsHr(plans.enterprise.features)).toBe(true);
  });
});
