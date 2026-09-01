import crypto from 'crypto';

/**
 * Derives a stable, Firestore-safe idempotency key for webhook providers that do
 * not send a first-class event id the way Stripe does.
 *
 * Stripe hands us `event.id`, so its three routes claim on that directly. Calendly,
 * DocuSign and Twilio do not, so the key has to be derived from the delivery itself.
 * The rule is that a redelivery of the SAME event must produce the SAME key, while
 * two genuinely different events must not collide.
 *
 * `parts` carries provider-native identifiers when they exist and are known to be
 * stable across retries — a Twilio MessageSid plus its MessageStatus, a DocuSign
 * envelope id plus its status. When no such identifier is available the raw request
 * body is hashed instead: an identical redelivery is byte-identical, and distinct
 * events differ because their payloads carry their own ids and timestamps.
 *
 * The result is always hashed. Provider identifiers are frequently URIs — Calendly's
 * are — and a Firestore document id may not contain a forward slash.
 */
export function webhookEventKey(
  provider: string,
  parts: Array<string | null | undefined>,
  rawFallback: string,
): string {
  const provided = parts.map((part) => String(part ?? '').trim()).filter(Boolean);
  const basis = provided.length ? provided.join('|') : rawFallback;
  const digest = crypto.createHash('sha256').update(basis).digest('hex');
  return `${provider}_${digest}`;
}
