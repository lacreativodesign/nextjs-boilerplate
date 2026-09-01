import fs from 'fs';
import path from 'path';
import { webhookEventKey } from '@/lib/webhooks/event-key';

/**
 * SOC2 F-10 regression suite.
 *
 * The three Stripe webhook routes claim `event.id` through
 * `claimWebhookEvent` before doing any work, so a redelivery is discarded. The
 * Calendly, DocuSign and Twilio receivers had no such check: every retry
 * re-processed, re-writing envelope status, re-recording message state and
 * re-running Calendly's booking handler.
 *
 * None of those three providers sends a first-class event id, so the key is
 * derived. Two properties matter and are asserted below: a redelivery of the same
 * event must yield the SAME key, and two different events must not collide.
 *
 * Claim placement is asserted at source level because it is a security property
 * rather than a behavioural one — claiming BEFORE signature verification would let
 * an unauthenticated caller pre-register a key and cause the genuine provider
 * delivery to be dropped as a duplicate.
 */

describe('webhookEventKey', () => {
  it('is stable across an identical redelivery', () => {
    const body = '{"event":"invitee.created","payload":{"uri":"https://api.calendly.com/x/1"}}';
    expect(webhookEventKey('calendly', [], body)).toBe(webhookEventKey('calendly', [], body));
  });

  it('distinguishes two different events from the same provider', () => {
    const first = webhookEventKey('docusign', ['env_1', 'sent'], 'raw');
    const second = webhookEventKey('docusign', ['env_1', 'completed'], 'raw');
    expect(first).not.toBe(second);
  });

  it('does not collide across providers using the same identifiers', () => {
    expect(webhookEventKey('twilio', ['id_1', 'delivered'], 'raw')).not.toBe(
      webhookEventKey('docusign', ['id_1', 'delivered'], 'raw'),
    );
  });

  it('falls back to the raw body when no provider identifier is present', () => {
    const a = webhookEventKey('twilio', [null, undefined], '{"MessageStatus":"queued"}');
    const b = webhookEventKey('twilio', [], '{"MessageStatus":"sent"}');
    expect(a).not.toBe(b);
    expect(a).toBe(webhookEventKey('twilio', [''], '{"MessageStatus":"queued"}'));
  });

  it('produces a Firestore-safe document id from identifiers containing slashes', () => {
    // Calendly identifiers are URIs; a Firestore document id may not contain '/'.
    const key = webhookEventKey('calendly', ['https://api.calendly.com/scheduled_events/x'], 'raw');
    expect(key).not.toContain('/');
    expect(key.startsWith('calendly_')).toBe(true);
  });
});

const ROUTES = [
  ['calendly', 'app/api/integrations/calendly/webhook/route.ts'],
  ['docusign', 'app/api/integrations/docusign/webhook/route.ts'],
  ['twilio', 'app/api/integrations/twilio/webhook/route.ts'],
] as const;

describe('integration webhook receivers', () => {
  it.each(ROUTES)('%s claims, finalizes and releases its event', (_provider, file) => {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    expect(source).toContain('claimWebhookEvent(');
    expect(source).toContain('finalizeWebhookEvent(');
    // Without a release, a failed run leaves the claim behind and the provider's
    // retry is silently discarded as a duplicate.
    expect(source).toContain('releaseWebhookEvent(');
  });

  it.each(ROUTES)('%s claims only after verifying the signature', (_provider, file) => {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    const verifyAt = source.search(/verify\w*WebhookSignature|verifyTwilioWebhookSignature/);
    const claimAt = source.indexOf('await claimWebhookEvent(');

    expect(verifyAt).toBeGreaterThan(-1);
    expect(claimAt).toBeGreaterThan(-1);
    expect(claimAt).toBeGreaterThan(verifyAt);
  });
});
