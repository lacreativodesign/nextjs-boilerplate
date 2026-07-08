import * as fs from 'fs';
import * as path from 'path';

/**
 * Billing dead-code gate (S33b, audit P0-1 remainder).
 *
 * lib/billing/stripe-subscription.ts previously contained a full parallel set
 * of tenant billing-state writers (subscribeTenantToPlan, changeTenantPlan,
 * cancelTenantSubscription, handleBillingWebhook/applyBillingEvent via
 * updateTenantBillingSummary) with ZERO callers. Dead billing writers are a
 * live risk: they used the wrong metadata key (plan instead of bizosto_plan)
 * and bypassed the canonical billing state service. These assertions keep them
 * from coming back, and keep the cancel path on the canonical route.
 */

const read = (relative: string): string =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('billing dead-code gate', () => {
  const stripeSubscription = read('lib/billing/stripe-subscription.ts');
  const customer = read('lib/stripe/customer.ts');
  const legacyCancelRoute = read('app/api/billing/cancel-subscription/route.ts');
  const billingPage = read('app/billing/page.tsx');
  const routeContract = read('lib/api/route-contract.ts');

  it('stripe-subscription.ts contains no tenant billing-state writers', () => {
    expect(stripeSubscription).not.toContain('updateTenantBillingSummary');
    expect(stripeSubscription).not.toContain('modulesForPlan');
    expect(stripeSubscription).not.toContain('PLAN_MODULES');
    expect(stripeSubscription).not.toContain('subscribeTenantToPlan');
    expect(stripeSubscription).not.toContain('changeTenantPlan');
    expect(stripeSubscription).not.toContain('cancelTenantSubscription');
    expect(stripeSubscription).not.toContain('handleBillingWebhook');
    expect(stripeSubscription).not.toContain("collection('tenants')");
  });

  it('stripe-subscription.ts keeps its live read/usage exports', () => {
    expect(stripeSubscription).toContain('export async function ensureStripeCustomer');
    expect(stripeSubscription).toContain('export async function getCurrentSubscription');
    expect(stripeSubscription).toContain('export async function updatePaymentMethod');
    expect(stripeSubscription).toContain('export async function listInvoices');
    expect(stripeSubscription).toContain('export async function recordUsage');
    expect(stripeSubscription).toContain('export async function enforceUsageLimit');
    expect(stripeSubscription).toContain('export async function verifyAndConstructBillingEvent');
  });

  it('cancelStripeSubscription (direct tenant writer) is removed from lib/stripe/customer.ts', () => {
    expect(customer).not.toContain('cancelStripeSubscription');
    // Live helpers stay.
    expect(customer).toContain('getOrCreateStripeCustomer');
    expect(customer).toContain('getStripeSubscription');
  });

  it('legacy cancel-subscription route is a 410 stub with no data access', () => {
    expect(legacyCancelRoute).toContain('status: 410');
    expect(legacyCancelRoute).not.toContain('adminDb');
    expect(legacyCancelRoute).not.toContain('cancelStripeSubscription');
    expect(legacyCancelRoute).toContain('/api/billing/subscription/cancel');
  });

  it('legacy cancel-subscription route is registered as a deprecated 410 stub in route contracts', () => {
    expect(routeContract).toContain("'billing/cancel-subscription': 'Deprecated 410 stub.'");
  });

  it('billing UI cancels through the canonical route only', () => {
    expect(billingPage).toContain("'/api/billing/subscription/cancel'");
    expect(billingPage).not.toContain("'/api/billing/cancel-subscription'");
  });
});
