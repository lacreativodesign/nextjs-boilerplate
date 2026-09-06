import crypto from 'crypto';
import { USER_NOTIFICATION_EVENT_TYPES } from '@/lib/notifications/preferences-config';
import type { UserNotificationEventType } from '@/types/notifications';

const TOKEN_VERSION = 1;
const SIGNING_CONTEXT = 'bizosto:notification-unsubscribe:v1';

type UnsubscribeTokenPayload = {
  v: 1;
  tenantId: string;
  userId: string;
  eventType: UserNotificationEventType;
};

/**
 * The unsubscribe signing key.
 *
 * INTERNAL_REQUEST_SIGNING_SECRET is the root secret: lib/auth/otp.ts keys signup-OTP
 * hashing with it and lib/api/internal-secret.ts authenticates server-to-server callers
 * with it. Keying unsubscribe links with that root directly would put the same value
 * behind an unauthenticated, publicly-reachable, email-delivered endpoint. Instead the key
 * is DERIVED from the root with a labelled HMAC, exactly as getAiToolBusSecret() derives
 * the AI tool bus secret: the derivation is one-way, so this key cannot be walked back to
 * the root, and OTP hashing and internal-secret verification are unaffected.
 *
 * Set NOTIFICATION_UNSUBSCRIBE_SIGNING_SECRET to replace the derivation with a fully
 * independent value. Until then callers and verifier derive the same key from config that
 * is already deployed, so this requires no new production secret to ship.
 *
 * Fails closed: a missing root, or the shipped placeholder, throws rather than signing with
 * a guessable key.
 */
function signingSecret(): string {
  const dedicated = String(process.env.NOTIFICATION_UNSUBSCRIBE_SIGNING_SECRET || '').trim();
  if (dedicated && dedicated !== 'change-me-in-production') return dedicated;

  const root = String(process.env.INTERNAL_REQUEST_SIGNING_SECRET || '').trim();
  if (!root || root === 'change-me-in-production') {
    throw new Error('INTERNAL_REQUEST_SIGNING_SECRET is not configured securely.');
  }
  return crypto.createHmac('sha256', root).update(SIGNING_CONTEXT).digest('hex');
}

function sign(encodedPayload: string): Buffer {
  return crypto
    .createHmac('sha256', signingSecret())
    .update(`${SIGNING_CONTEXT}.${encodedPayload}`)
    .digest();
}

function isValidEventType(value: string): value is UserNotificationEventType {
  return USER_NOTIFICATION_EVENT_TYPES.includes(value as UserNotificationEventType);
}

/**
 * Builds a tamper-evident unsubscribe token.
 *
 * The previous token was only base64url-encoded text (`tenant:user:event`). Anyone who
 * knew or guessed another user's ids could forge a token and silently disable that user's
 * notifications. HMAC signing keeps the link usable without authentication while making
 * every tenant/user/event tuple unforgeable without the server-side signing secret.
 */
export function buildNotificationUnsubscribeToken(params: {
  userId: string;
  tenantId: string;
  eventType: UserNotificationEventType;
}): string {
  const tenantId = String(params.tenantId || '').trim();
  const userId = String(params.userId || '').trim();
  const eventType = String(params.eventType || '').trim();

  if (!tenantId || !userId || !isValidEventType(eventType)) {
    throw new Error('Invalid notification unsubscribe token payload.');
  }

  const payload: UnsubscribeTokenPayload = {
    v: TOKEN_VERSION,
    tenantId,
    userId,
    eventType,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = sign(encodedPayload).toString('base64url');
  return `${encodedPayload}.${signature}`;
}

/**
 * Verifies and decodes a signed unsubscribe token in constant time.
 *
 * Tokens intentionally do not expire. An unsubscribe link is a preference-control link,
 * not an authentication credential, and should continue to honour the recipient's choice
 * even when an old email is opened later. The signature prevents changing who/what the
 * link controls.
 */
export function parseNotificationUnsubscribeToken(
  token: string,
): { userId: string; tenantId: string; eventType: UserNotificationEventType } | null {
  try {
    // Exactly two non-empty segments. Checking the segment COUNT rather than probing a
    // third destructured element keeps the guard honest: `split` is typed `string[]`, so
    // `extra !== undefined` reads as always-true and only worked because destructuring
    // happens to yield undefined at runtime. A token with an extra delimiter is rejected
    // either way; this states that intent in a form the type system agrees with.
    const segments = String(token || '').split('.');
    if (segments.length !== 2) return null;

    const [encodedPayload, encodedSignature] = segments;
    if (!encodedPayload || !encodedSignature) return null;

    const supplied = Buffer.from(encodedSignature, 'base64url');
    const expected = sign(encodedPayload);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
      return null;
    }

    const parsed = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as Partial<UnsubscribeTokenPayload>;
    const tenantId = String(parsed.tenantId || '').trim();
    const userId = String(parsed.userId || '').trim();
    const eventType = String(parsed.eventType || '').trim();

    if (parsed.v !== TOKEN_VERSION || !tenantId || !userId || !isValidEventType(eventType)) {
      return null;
    }

    return { tenantId, userId, eventType };
  } catch {
    return null;
  }
}
