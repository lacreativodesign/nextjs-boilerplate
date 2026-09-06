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

function signingSecret(): string {
  const secret = String(process.env.INTERNAL_REQUEST_SIGNING_SECRET || '').trim();
  if (!secret || secret === 'change-me-in-production') {
    throw new Error('INTERNAL_REQUEST_SIGNING_SECRET is not configured securely.');
  }
  return secret;
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
    const [encodedPayload, encodedSignature, extra] = String(token || '').split('.');
    if (!encodedPayload || !encodedSignature || extra !== undefined) return null;

    const supplied = Buffer.from(encodedSignature, 'base64url');
    const expected = sign(encodedPayload);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
      return null;
    }

    const parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Partial<
      UnsubscribeTokenPayload
    >;
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
