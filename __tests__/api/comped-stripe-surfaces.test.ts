import fs from 'fs';
import path from 'path';

/**
 * COMP-3 — the comped promise has to survive a converted customer.
 *
 * COMP-1 states that a comped workspace is never charged, and for a workspace that never
 * had a subscription that was true. Converting an EXISTING paying customer was a different
 * story, and the gap was a money bug rather than a cosmetic one.
 *
 * The plan endpoint set `billingMode: 'comped'` and nothing else. The Stripe subscription
 * stayed live, so the customer's card kept being charged every month while the tenant
 * screen read "Comped — $0". The revenue report then compounded it: MRR-1 counts any
 * tenant holding a subscription id as paying, and that branch is evaluated first, so the
 * workspace did not even appear in the comped column. Three surfaces disagreeing about
 * whether a real customer was being billed.
 *
 * Cancelling the subscription from a plan edit would hide a money-moving action behind an
 * unrelated control, which is worse than refusing. So the endpoint refuses, and says why.
 *
 * Separately, a converted workspace keeps its stripeCustomerId and stripeSubscriptionId
 * forever. Without a guard, its admin can still open the Stripe billing portal, change the
 * card on file, and cancel or change a subscription Bizosto has stopped treating as
 * billable. checkout was guarded in COMP-1; portal, cancel and change were not.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Source with comments stripped, so prose about comping is never read as a guard. */
const active = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

const PLAN_ROUTE = 'app/api/super_admin/tenants/[tenantId]/plan/route.ts';
const CHECKOUT = 'app/api/stripe/checkout/route.ts';

/** Every route that lets a tenant admin reach Stripe about their own billing. */
const BILLING_MUTATIONS = [
  'app/api/stripe/checkout/route.ts',
  'app/api/billing/portal/route.ts',
  'app/api/billing/subscription/cancel/route.ts',
  'app/api/billing/subscription/change/route.ts',
];

describe('COMP-3: a workspace cannot be comped while Stripe is still charging it', () => {
  const src = active(PLAN_ROUTE);

  it('refuses the conversion when a live subscription exists', () => {
    expect(src).toContain('comp_blocked_active_subscription');
    expect(src).toContain("String(data.stripeSubscriptionId || '').trim()");
  });

  it('checks before writing, so no half-converted state is persisted', () => {
    const checkAt = src.indexOf('liveSubscriptionId');
    const writeAt = src.indexOf('tenantRef.set(updates');
    expect(checkAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(checkAt);
  });

  it('never cancels the subscription itself', () => {
    // Moving money as a side effect of a plan edit is worse than refusing outright: the
    // operator would not see it happen and could not have intended it.
    expect(src).not.toContain('subscriptions.update');
    expect(src).not.toContain('subscriptions.cancel');
    expect(src).not.toContain('subscriptions.del');
  });

  it('tells the operator what to do rather than failing blankly', () => {
    expect(src).toContain('Cancel it in Stripe first');
  });

  it('still allows comping a workspace that has never subscribed', () => {
    // The check keys on a subscription id, not on the presence of a Stripe customer: a
    // workspace with a cancelled subscription has no money moving and can be comped.
    expect(src).not.toContain('stripeCustomerId');
  });
});

describe('COMP-3: a comped workspace cannot reach Stripe about billing', () => {
  it.each(BILLING_MUTATIONS)('%s refuses a comped tenant', (rel) => {
    const src = active(rel);
    expect(src).toMatch(/isComped\(/);
    expect(src).toContain('billing_comped');
  });

  it.each(BILLING_MUTATIONS)('%s refuses before calling Stripe', (rel) => {
    const src = active(rel);
    const guardAt = src.search(/isComped\(/);
    const stripeAt = src.search(/stripe\.(billingPortal|subscriptions|checkout)/);
    expect(guardAt).toBeGreaterThan(-1);
    expect(stripeAt).toBeGreaterThan(guardAt);
  });

  it.each(BILLING_MUTATIONS)('%s reads the mode from the tenant, not the request', (rel) => {
    const src = active(rel);
    expect(src).not.toMatch(/body\??\.\s*billingMode/);
  });

  it('covers the portal, which a converted tenant can still reach by customer id', () => {
    // The portal only needs stripeCustomerId, which conversion never clears — so this is
    // the one that stays reachable longest after a workspace stops being billable.
    const src = active('app/api/billing/portal/route.ts');
    const guardAt = src.indexOf('isComped(tenant)');
    const customerCheckAt = src.indexOf('tenant?.stripeCustomerId');
    expect(guardAt).toBeGreaterThan(-1);
    expect(customerCheckAt).toBeGreaterThan(guardAt);
  });

  it('keeps the checkout guard COMP-1 added', () => {
    expect(active(CHECKOUT)).toContain('isComped(tenantData)');
  });
});

describe('COMP-3: the refusal is a business answer, not an error', () => {
  it.each(BILLING_MUTATIONS)('%s answers 409 with a stable code', (rel) => {
    const src = active(rel);
    // 409 rather than 403: the request is well-formed and the caller is authorised — it
    // conflicts with the workspace's billing arrangement. A stable code lets a UI say so.
    const block = src.slice(src.search(/isComped\(/));
    expect(block).toContain('status: 409');
    expect(block).toContain("code: 'billing_comped'");
  });

  it('says who to contact rather than leaving a dead end', () => {
    for (const rel of BILLING_MUTATIONS) {
      expect(active(rel)).toContain('Contact support');
    }
  });
});
