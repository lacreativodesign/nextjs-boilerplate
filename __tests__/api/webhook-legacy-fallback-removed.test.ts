import * as fs from 'fs';
import * as path from 'path';

/**
 * Checkout webhook single-provisioning invariant (S39, audit P0-2).
 *
 * /api/signup is the ONLY code path that creates a tenant, admin user, claims,
 * plan, and modules — always before Stripe Checkout. The signed checkout webhook
 * may only reconcile and LINK an already-existing tenant; it must never create a
 * tenant from Stripe metadata or customer email.
 */

const read = (relative: string): string =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('checkout webhook — legacy tenant-creation fallback removed (S39)', () => {
  const webhook = read('app/api/stripe/webhook/route.ts');

  it('no longer defines or calls the create-by-email fallback helpers', () => {
    expect(webhook).not.toMatch(/function\s+ensureTenantForCheckout/);
    expect(webhook).not.toMatch(/function\s+ensureAdminUser/);
    expect(webhook).not.toMatch(/function\s+resolveCheckoutPlan/);
    expect(webhook).not.toMatch(/function\s+deriveTenantName/);
    expect(webhook).not.toMatch(/ensureTenantForCheckout\s*\(/);
    expect(webhook).not.toMatch(/ensureAdminUser\s*\(/);
  });

  it('never creates a tenant from checkout — no tenant-doc creation primitives remain in the checkout path', () => {
    expect(webhook).not.toContain('createPasswordSetupToken');
    expect(webhook).not.toContain('sendSetPasswordEmail');
    expect(webhook).not.toContain('runTransaction');
    expect(webhook).not.toContain('tenantsRef.doc()');
  });

  it('links exclusively via the canonical billing service', () => {
    expect(webhook).toContain('applySubscriptionState');
    expect(webhook).toContain("source: 'checkout.linked'");
    expect(webhook).toContain('linkExistingTenant');
  });

  it('fails closed when canonical checkout metadata is incomplete', () => {
    expect(webhook).toContain('checkout session missing canonical metadata');
    const idx = webhook.indexOf('checkout session missing canonical metadata');
    const block = webhook.slice(idx, idx + 900);
    expect(block).toContain('linked: false');
    expect(block).toContain('finalizeWebhookEvent');
  });

  it('fails closed when tenantId does not match any tenant — never falls through to create', () => {
    const idx = webhook.indexOf('if (!tenantSnap.exists)');
    expect(idx).toBeGreaterThan(-1);
    const block = webhook.slice(idx, idx + 1100);
    expect(block).toContain('linked: false');
    expect(block).not.toMatch(/ensureTenantForCheckout\s*\(/);
    expect(webhook).not.toContain('fall through to legacy create-by-email');
  });

  it('restricts trusted sources and requires server-reconciled Stripe identifiers and metadata', () => {
    expect(webhook).toContain('TRUSTED_CHECKOUT_SOURCES');
    expect(webhook).toContain('stripeCustomerId');
    expect(webhook).toContain('stripeSubscriptionId');
    expect(webhook).toContain('metadataTenantId');
    expect(webhook).toContain('metadataPlan');
    expect(webhook).toContain('stripe.subscriptions.retrieve');
  });
});
