import fs from 'fs';
import path from 'path';
import { plans, PURCHASABLE_PLAN_KEYS, ANNUAL_FREE_MONTHS } from '@/lib/billing/plans';
import { PLAN_DETAILS, PLAN_MODULES } from '@/app/config/plans';

/**
 * S9 — pricing parity.
 *
 * The price of a Bizosto plan is written down in three independent places, none of which
 * imports the others:
 *
 *   1. lib/billing/plans.ts        PLAN_CATALOG — drives /signup and /billing/upgrade
 *   2. components/pricing/PricingPageClient.tsx — the public /pricing table
 *   3. app/api/stripe/checkout/route.ts — PLAN_CONFIGS amounts, in cents
 *
 * Nothing has ever tied them together, so editing one leaves the other two saying
 * something different. The failure is commercial rather than technical and would ship
 * green: a customer reads $149 on the pricing page, sees $149 at signup, and is billed
 * against a Stripe price the app believes is something else. This suite is the tie.
 *
 * It also pins the two structural rules the packages are built on — annual billing is
 * twelve months minus ANNUAL_FREE_MONTHS, and the tiers that can be bought are exactly
 * the tiers that have an entitlement row.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

/** Monthly and annual list prices in whole USD, parsed out of the /pricing table. */
function pricingPageTable(): Record<string, { monthly: number; annual: number }> {
  const src = read('components/pricing/PricingPageClient.tsx');
  const rows = src.matchAll(
    /name:\s*'([^']+)',\s*\n\s*price:\s*\{\s*monthly:\s*(\d+),\s*annual:\s*(\d+)\s*\}/g,
  );
  return Object.fromEntries(
    [...rows].map(([, name, monthly, annual]) => [
      name.toLowerCase(),
      { monthly: Number(monthly), annual: Number(annual) },
    ]),
  );
}

/** Checkout amounts in cents, keyed `${plan}_${cycle}`. */
function checkoutAmounts(): Record<string, number> {
  const src = read('app/api/stripe/checkout/route.ts');
  const rows = src.matchAll(
    /(\w+):\s*\{\s*\n\s*plan:\s*'(\w+)',\s*\n\s*billingCycle:\s*'(\w+)',\s*\n\s*amount:\s*(\d+),/g,
  );
  return Object.fromEntries([...rows].map(([, key, , , amount]) => [key, Number(amount)]));
}

describe('S9: the three price tables agree', () => {
  const pricingPage = pricingPageTable();
  const checkout = checkoutAmounts();

  it('parses all three sources, so a rename cannot silently empty this suite', () => {
    expect(Object.keys(pricingPage).sort()).toEqual(['enterprise', 'pro', 'starter']);
    expect(Object.keys(checkout).sort()).toEqual([
      'enterprise_annual',
      'enterprise_monthly',
      'pro_annual',
      'pro_monthly',
      'starter_annual',
      'starter_monthly',
    ]);
  });

  it.each(PURCHASABLE_PLAN_KEYS)('%s costs the same everywhere', (plan) => {
    const catalog = plans[plan];
    const page = pricingPage[plan];

    expect(page).toBeDefined();
    expect(page.monthly).toBe(catalog.price);
    expect(page.annual).toBe(catalog.annualPrice);

    // Checkout is the money that actually moves; it is quoted in cents.
    expect(checkout[`${plan}_monthly`]).toBe(catalog.price * 100);
    expect(checkout[`${plan}_annual`]).toBe(catalog.annualPrice * 100);
  });

  it.each(PURCHASABLE_PLAN_KEYS)('%s annual is twelve months minus the free months', (plan) => {
    const catalog = plans[plan];
    expect(catalog.annualPrice).toBe(catalog.price * (12 - ANNUAL_FREE_MONTHS));
  });

  it('names the plans identically in the catalog, the pricing page and the details table', () => {
    for (const plan of PURCHASABLE_PLAN_KEYS) {
      expect(plans[plan].name.toLowerCase()).toBe(plan);
      expect(PLAN_DETAILS[plan].label.toLowerCase()).toBe(plan);
    }
  });
});

describe('S9: every purchasable plan is a real, sellable tier', () => {
  it('has an entitlement row in PLAN_MODULES', () => {
    for (const plan of PURCHASABLE_PLAN_KEYS) {
      expect(PLAN_MODULES[plan]).toBeDefined();
    }
  });

  it('has a monthly and an annual Stripe price env declared', () => {
    for (const plan of PURCHASABLE_PLAN_KEYS) {
      expect(plans[plan].stripePriceIdEnv).toBe(`STRIPE_PRICE_${plan.toUpperCase()}_MONTHLY`);
      expect(plans[plan].annualStripePriceIdEnv).toBe(`STRIPE_PRICE_${plan.toUpperCase()}_ANNUAL`);
    }
  });

  it('resolves every plan and cycle to a distinct Stripe price env', () => {
    const src = read('lib/billing/stripe-prices.ts');
    for (const plan of PURCHASABLE_PLAN_KEYS) {
      for (const cycle of ['monthly', 'annual'] as const) {
        expect(src).toContain(`${plan}_${cycle}: 'STRIPE_PRICE_`);
      }
    }
  });

  it('never sells the trial: it is a state of a purchased plan, not a tier', () => {
    expect(PURCHASABLE_PLAN_KEYS).not.toContain('trial' as never);
    expect(plans.trial.price).toBe(0);
    expect(plans.trial.stripePriceIdEnv).toBe('');
  });

  it('charges more for each step up the ladder', () => {
    const ladder = PURCHASABLE_PLAN_KEYS.map((plan) => plans[plan].price);
    expect(ladder).toEqual([...ladder].sort((a, b) => a - b));
    expect(new Set(ladder).size).toBe(ladder.length);
  });
});

describe('S9: what is charged for matches what is unlocked', () => {
  it('gives each paid step at least one module the step below does not have', () => {
    const tiers = PURCHASABLE_PLAN_KEYS;
    for (let i = 1; i < tiers.length; i++) {
      const lower = PLAN_MODULES[tiers[i - 1]];
      const higher = PLAN_MODULES[tiers[i]];
      const added = Object.keys(higher).filter(
        (key) =>
          higher[key as keyof typeof higher] === true && lower[key as keyof typeof lower] !== true,
      );
      expect(added.length).toBeGreaterThan(0);
    }
  });

  it('never removes a module when a customer pays more', () => {
    const tiers = PURCHASABLE_PLAN_KEYS;
    for (let i = 1; i < tiers.length; i++) {
      const lower = PLAN_MODULES[tiers[i - 1]];
      const higher = PLAN_MODULES[tiers[i]];
      const lost = Object.keys(lower).filter(
        (key) =>
          lower[key as keyof typeof lower] === true && higher[key as keyof typeof higher] !== true,
      );
      expect(lost).toEqual([]);
    }
  });
});
