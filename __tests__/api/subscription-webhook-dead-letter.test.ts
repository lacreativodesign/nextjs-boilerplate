import * as fs from 'fs';
import * as path from 'path';

/**
 * Subscription webhook tenant resolution + dead-letter gate (E3, audit P0-3).
 *
 * Baseline finding: a subscription/payment event whose tenant could not be
 * resolved did `break`, then the route unconditionally finalized the event and
 * returned 200 — Stripe considered it delivered and stopped retrying, silently
 * losing the lifecycle event.
 *
 * This gate proves, by static analysis of the route source, that:
 *  - subscription events resolve the tenant with a customer/subscription-id
 *    fallback (not metadata-only);
 *  - unresolvable subscription and payment events are dead-lettered and alert
 *    the super admin;
 *  - a dead-lettered event releases its idempotency claim and returns non-2xx
 *    so Stripe retries, instead of silently finalizing.
 */

const ROUTE = 'app/api/stripe/subscription-webhook/route.ts';

const read = (relative: string): string =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('subscription webhook dead-letters unmappable events (E3)', () => {
  const source = read(ROUTE);

  it('resolves subscription tenants with a subscription/customer-id fallback', () => {
    expect(source).toContain('resolveTenantIdFromSubscription');
    expect(source).toContain("where('stripeSubscriptionId', '==', subscription.id)");
    expect(source).toContain("where('stripeCustomerId', '==', customerId)");
  });

  it('has a dead-letter helper that records the event and alerts the super admin', () => {
    expect(source).toContain('deadLetterWebhookEvent');
    expect(source).toContain("collection('dead_letter_webhooks')");
    expect(source).toContain("to: 'admin@bizosto.com'");
  });

  it('every money/lifecycle case dead-letters instead of silently breaking', () => {
    const deadLetterCount = (source.match(/deadLettered = true;/g) || []).length;
    expect(deadLetterCount).toBeGreaterThanOrEqual(4);
    expect(source).toContain('await deadLetterWebhookEvent(event,');
  });

  it('a dead-lettered event releases the claim and returns non-2xx for retry', () => {
    expect(source).toContain('if (deadLettered) {');
    expect(source).toContain('await releaseWebhookEvent(event.id);');
    const deadLetterReturn = source.slice(source.indexOf('if (deadLettered) {')).slice(0, 400);
    expect(deadLetterReturn).toContain('status: 500');
  });

  it('still finalizes and 200s the normal (resolved) path', () => {
    expect(source).toContain('await finalizeWebhookEvent(event.id, event.type);');
    expect(source).toContain('{ ok: true, received: true }');
  });
});
