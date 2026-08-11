import fs from 'fs';
import path from 'path';

/**
 * MRR-1 — reported revenue means money that actually changes hands.
 *
 * /api/super_admin/payments added a plan's full list price to MRR for every tenant whose
 * `subscriptionState` was 'active', with no check that a subscription exists. That state
 * only means the workspace is unlocked, so the headline figure on the Super Admin
 * dashboard was really "list price × number of unlocked workspaces". Counted as paying
 * customers: Bizosto's own workspace, any tenant a Super Admin activated by hand, every
 * internally comped account, and every demo tenant.
 *
 * A Stripe subscription id is the evidence of an external paying relationship — it is
 * written only by applySubscriptionState in response to a Stripe webhook. Active
 * workspaces without one are now counted as `unbilledActiveTenants` rather than dropped,
 * so the number stays visible on screen instead of silently disappearing from the totals.
 *
 * This matters beyond tidiness: MRR is the number a founder reports to a bank, an
 * accountant or an investor, and it was inflated by construction.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Source with comments stripped, so prose describing the old rule is not the rule. */
const active = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

const PAYMENTS_ROUTE = 'app/api/super_admin/payments/route.ts';
const PAYMENTS_PAGE = 'app/super_admin/payments/page.tsx';
const DASHBOARD = 'app/super_admin/page.tsx';

describe('MRR-1: revenue requires a billed subscription', () => {
  const src = active(PAYMENTS_ROUTE);

  it('never adds list price on subscription state alone', () => {
    // The defect in one line: `if (subscriptionState === 'active') { mrr += ... }`.
    expect(src).not.toMatch(/subscriptionState === 'active'\)\s*\{\s*mrr \+=/);
  });

  it('gates the accumulation on a Stripe subscription', () => {
    expect(src).toContain('hasStripeSubscription');
    const accrual = src.slice(src.indexOf('mrr += plans[plan].price'));
    expect(accrual).toBeTruthy();

    // The accrual must sit INSIDE the hasStripeSubscription branch.
    const branchAt = src.indexOf('if (hasStripeSubscription)');
    const accrualAt = src.indexOf('mrr += plans[plan].price');
    expect(branchAt).toBeGreaterThan(-1);
    expect(accrualAt).toBeGreaterThan(branchAt);
  });

  it('derives that flag from the tenant document, not from a request', () => {
    expect(src).toMatch(/hasStripeSubscription = Boolean\(String\(data\.stripeSubscriptionId/);
  });

  it('reports unbilled active workspaces rather than hiding them', () => {
    expect(src).toContain('unbilledActiveTenants');
    expect(src).toContain('totalPayingTenants');
    // Both must reach the response, or the correction is invisible to the operator.
    const metricsBlock = src.slice(src.indexOf('metrics: {'), src.indexOf('breakdown: {'));
    expect(metricsBlock).toContain('totalPayingTenants');
    expect(metricsBlock).toContain('unbilledActiveTenants');
  });

  it('still counts every active workspace, billed or not', () => {
    // Usage and revenue are different questions; the correction must not conflate them.
    const activeBlock = src.slice(src.indexOf("if (subscriptionState === 'active')"));
    expect(activeBlock.slice(0, 400)).toContain('totalActiveTenants += 1');
  });

  it('zeroes the per-row figure for an unbilled tenant, so the column sums to the total', () => {
    expect(src).toMatch(
      /mrr: hasStripeSubscription && subscriptionState === 'active' \? plans\[plan\]\.price : 0/,
    );
  });
});

describe('MRR-1: the screens do not overstate what the number means', () => {
  it('the payments page labels MRR as billed-only', () => {
    const src = read(PAYMENTS_PAGE);
    expect(src).toContain('Billed subscriptions only');
    expect(src).not.toContain("sub: 'Active subscriptions'");
  });

  it('the payments page surfaces the unbilled count', () => {
    const src = read(PAYMENTS_PAGE);
    expect(src).toContain('Unbilled Active');
    expect(src).toContain('metrics.unbilledActiveTenants');
  });

  it('stops calling every active tenant a paying subscriber', () => {
    const src = read(PAYMENTS_PAGE);
    expect(src).not.toContain("sub: 'Paying subscribers'");
    expect(src).toContain('metrics.totalPayingTenants');
  });

  it('the dashboard card says the same thing', () => {
    const src = read(DASHBOARD);
    expect(src).toContain('Billed Stripe subscriptions only');
    expect(src).not.toContain('MRR from active subscriptions');
  });
});
