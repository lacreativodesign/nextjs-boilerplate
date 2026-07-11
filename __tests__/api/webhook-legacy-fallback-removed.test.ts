import * as fs from 'fs';
import * as path from 'path';

/**
 * Checkout webhook single-provisioning invariant (S39, audit P0-2).
 *
 * /api/signup is the ONLY code path that creates a tenant, admin user, claims,
 * plan, and modules — always before Stripe Checkout, always stamping
 * metadata.tenantId. The checkout.session.completed webhook must therefore only
 * LINK an existing tenant to its subscription. The former create-by-email
 * fallback (ensureTenantForCheckout / ensureAdminUser) was dead code: no path
 * originates a tenant-less checkout, and every marketing-site pricing CTA routes
 * through /signup. Left in place it could only misfire — duplicate tenant,
 * email-domain-guessed company name, or a plan granted from unauthenticated
 * metadata. These assertions keep the fallback from returning and keep the
 * missing/unknown-tenantId branches failing closed (link:false, never create).
 */

const read = (relative: string): string =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('checkout webhook — legacy tenant-creation fallback removed (S39)', () => {
  const webhook = read('app/api/stripe/webhook/route.ts');

  it('no longer defines or calls the create-by-email fallback helpers', () => {
    // Names may survive in an explanatory comment; what matters is that the
    // functions are neither declared nor invoked.
    expect(webhook).not.toMatch(/function\s+ensureTenantForCheckout/);
    expect(webhook).not.toMatch(/function\s+ensureAdminUser/);
    expect(webhook).not.toMatch(/function\s+resolveCheckoutPlan/);
    expect(webhook).not.toMatch(/function\s+deriveTenantName/);
    expect(webhook).not.toMatch(/ensureTenantForCheckout\s*\(/);
    expect(webhook).not.toMatch(/ensureAdminUser\s*\(/);
  });

  it('never creates a tenant from checkout — no tenant-doc creation primitives remain in the checkout path', () => {
    // The link path uses applySubscriptionState; it must not create tenants,
    // password-setup tokens, or admin-invite users off a checkout event.
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

  it('fails closed when metadata.tenantId is missing — acks without creating', () => {
    const idx = webhook.indexOf('if (!metadataTenantId)');
    expect(idx).toBeGreaterThan(-1);
    const block = webhook.slice(idx, idx + 900);
    expect(block).toContain('linked: false');
    // Ack (finalize) so Stripe stops retrying an unlinkable event.
    expect(block).toContain('finalizeWebhookEvent');
  });

  it('fails closed when tenantId does not match any tenant — never falls through to create', () => {
    const idx = webhook.indexOf('if (!linked)');
    expect(idx).toBeGreaterThan(-1);
    const block = webhook.slice(idx, idx + 900);
    expect(block).toContain('linked: false');
    expect(block).not.toMatch(/ensureTenantForCheckout\s*\(/);
    // The dead fall-through comment must be gone.
    expect(webhook).not.toContain('fall through to legacy create-by-email');
  });

  it('still restricts to trusted checkout sources and requires Stripe ids', () => {
    expect(webhook).toContain('TRUSTED_CHECKOUT_SOURCES');
    expect(webhook).toContain('Missing checkout details.');
  });
});
