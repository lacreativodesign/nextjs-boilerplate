import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  buildNotificationUnsubscribeToken,
  parseNotificationUnsubscribeToken,
} from '@/lib/notifications/unsubscribe-token';

const OLD_SECRET = process.env.INTERNAL_REQUEST_SIGNING_SECRET;
const SIGNING_CONTEXT = 'bizosto:notification-unsubscribe:v1';

/**
 * Recomputes the derived signing key the module builds from the root secret, so the tests
 * can forge a correctly-signed token and check what the parser does with its CONTENTS
 * (unknown event type, wrong version) rather than only with a bad signature.
 */
function signingKeyForTest(): string {
  return crypto
    .createHmac('sha256', process.env.INTERNAL_REQUEST_SIGNING_SECRET as string)
    .update(SIGNING_CONTEXT)
    .digest('hex');
}

describe('PR5 notification unsubscribe token integrity', () => {
  beforeEach(() => {
    process.env.INTERNAL_REQUEST_SIGNING_SECRET = 'pr5-test-signing-secret-32-bytes-minimum';
  });

  afterAll(() => {
    if (OLD_SECRET === undefined) delete process.env.INTERNAL_REQUEST_SIGNING_SECRET;
    else process.env.INTERNAL_REQUEST_SIGNING_SECRET = OLD_SECRET;
  });

  it('round-trips an authentic tenant/user/event tuple', () => {
    const token = buildNotificationUnsubscribeToken({
      tenantId: 'tenant-a',
      userId: 'user-a',
      eventType: 'invoice_overdue',
    });

    expect(parseNotificationUnsubscribeToken(token)).toEqual({
      tenantId: 'tenant-a',
      userId: 'user-a',
      eventType: 'invoice_overdue',
    });
  });

  it('rejects a forged payload even when the attacker preserves the original signature', () => {
    const token = buildNotificationUnsubscribeToken({
      tenantId: 'tenant-a',
      userId: 'user-a',
      eventType: 'invoice_overdue',
    });
    const [encodedPayload, signature] = token.split('.');
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    payload.userId = 'victim-user';
    const forgedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

    expect(parseNotificationUnsubscribeToken(`${forgedPayload}.${signature}`)).toBeNull();
  });

  it('rejects the old unsigned base64url token format', () => {
    const oldToken = Buffer.from('tenant-a:user-a:invoice_overdue').toString('base64url');
    expect(parseNotificationUnsubscribeToken(oldToken)).toBeNull();
  });

  it('rejects a valid token after the signing key changes', () => {
    const token = buildNotificationUnsubscribeToken({
      tenantId: 'tenant-a',
      userId: 'user-a',
      eventType: 'system_updates',
    });
    process.env.INTERNAL_REQUEST_SIGNING_SECRET = 'a-different-pr5-signing-secret';
    expect(parseNotificationUnsubscribeToken(token)).toBeNull();
  });

  it('fails closed when the signing secret is missing or left on the placeholder', () => {
    delete process.env.INTERNAL_REQUEST_SIGNING_SECRET;
    expect(() =>
      buildNotificationUnsubscribeToken({
        tenantId: 'tenant-a',
        userId: 'user-a',
        eventType: 'system_updates',
      }),
    ).toThrow(/not configured securely/i);

    process.env.INTERNAL_REQUEST_SIGNING_SECRET = 'change-me-in-production';
    expect(parseNotificationUnsubscribeToken('payload.signature')).toBeNull();
  });

  it('rejects tampering with the tenant, not just the user', () => {
    const token = buildNotificationUnsubscribeToken({
      tenantId: 'tenant-a',
      userId: 'user-a',
      eventType: 'invoice_overdue',
    });
    const [encodedPayload, signature] = token.split('.');
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    payload.tenantId = 'tenant-victim';
    const forged = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

    expect(parseNotificationUnsubscribeToken(`${forged}.${signature}`)).toBeNull();
  });

  it('rejects tampering with the event type', () => {
    // A link that silences overdue-invoice mail must not be repointable at, say, security
    // notifications for the same user.
    const token = buildNotificationUnsubscribeToken({
      tenantId: 'tenant-a',
      userId: 'user-a',
      eventType: 'invoice_overdue',
    });
    const [encodedPayload, signature] = token.split('.');
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    payload.eventType = 'system_updates';
    const forged = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

    expect(parseNotificationUnsubscribeToken(`${forged}.${signature}`)).toBeNull();
  });

  it('cannot be confused by extra or missing delimiters', () => {
    const token = buildNotificationUnsubscribeToken({
      tenantId: 'tenant-a',
      userId: 'user-a',
      eventType: 'invoice_overdue',
    });
    const [encodedPayload, signature] = token.split('.');

    // A third segment must not be ignored, and neither half is a token on its own.
    expect(parseNotificationUnsubscribeToken(`${token}.extra`)).toBeNull();
    expect(parseNotificationUnsubscribeToken(`${encodedPayload}.${signature}.`)).toBeNull();
    expect(parseNotificationUnsubscribeToken(encodedPayload)).toBeNull();
    expect(parseNotificationUnsubscribeToken(signature)).toBeNull();
    expect(parseNotificationUnsubscribeToken(`.${signature}`)).toBeNull();
    expect(parseNotificationUnsubscribeToken(`${encodedPayload}.`)).toBeNull();
  });

  it('rejects malformed, truncated and empty signatures rather than throwing', () => {
    const token = buildNotificationUnsubscribeToken({
      tenantId: 'tenant-a',
      userId: 'user-a',
      eventType: 'invoice_overdue',
    });
    const [encodedPayload, signature] = token.split('.');

    // Length is compared before timingSafeEqual, which throws on a length mismatch.
    expect(
      parseNotificationUnsubscribeToken(`${encodedPayload}.${signature.slice(0, 8)}`),
    ).toBeNull();
    expect(parseNotificationUnsubscribeToken(`${encodedPayload}.${signature}AAAA`)).toBeNull();
    expect(parseNotificationUnsubscribeToken(`${encodedPayload}.!!!not-base64!!!`)).toBeNull();
    expect(parseNotificationUnsubscribeToken('')).toBeNull();
    expect(parseNotificationUnsubscribeToken(undefined as unknown as string)).toBeNull();
  });

  it('rejects a correctly signed payload that names an event type we do not have', () => {
    // Signature validity is not authorisation to write an arbitrary preference key.
    const payload = {
      v: 1,
      tenantId: 'tenant-a',
      userId: 'user-a',
      eventType: 'all_notifications',
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = crypto
      .createHmac('sha256', signingKeyForTest())
      .update(`bizosto:notification-unsubscribe:v1.${encodedPayload}`)
      .digest('base64url');

    expect(parseNotificationUnsubscribeToken(`${encodedPayload}.${signature}`)).toBeNull();
  });

  it('rejects a correctly signed payload from a different token version', () => {
    const payload = {
      v: 2,
      tenantId: 'tenant-a',
      userId: 'user-a',
      eventType: 'invoice_overdue',
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = crypto
      .createHmac('sha256', signingKeyForTest())
      .update(`bizosto:notification-unsubscribe:v1.${encodedPayload}`)
      .digest('base64url');

    expect(parseNotificationUnsubscribeToken(`${encodedPayload}.${signature}`)).toBeNull();
  });

  it('does not key the signature with the raw root secret', () => {
    // INTERNAL_REQUEST_SIGNING_SECRET also keys signup-OTP hashing and server-to-server
    // authentication. This link is public, unauthenticated and sits in customers' inboxes,
    // so it signs with a key DERIVED from that root (one-way) rather than the root itself —
    // the same shape lib/api/internal-secret.ts uses for the AI tool bus.
    const token = buildNotificationUnsubscribeToken({
      tenantId: 'tenant-a',
      userId: 'user-a',
      eventType: 'invoice_overdue',
    });
    const [encodedPayload, signature] = token.split('.');

    const withRootKey = crypto
      .createHmac('sha256', process.env.INTERNAL_REQUEST_SIGNING_SECRET as string)
      .update(`bizosto:notification-unsubscribe:v1.${encodedPayload}`)
      .digest('base64url');

    expect(signature).not.toBe(withRootKey);
    expect(signature).toBe(
      crypto
        .createHmac('sha256', signingKeyForTest())
        .update(`bizosto:notification-unsubscribe:v1.${encodedPayload}`)
        .digest('base64url'),
    );
  });

  it('honours a dedicated unsubscribe secret when one is provisioned', () => {
    // Deployments that want this key fully independent of the root can set it, and tokens
    // signed under the derivation must then stop verifying.
    const derived = buildNotificationUnsubscribeToken({
      tenantId: 'tenant-a',
      userId: 'user-a',
      eventType: 'invoice_overdue',
    });

    process.env.NOTIFICATION_UNSUBSCRIBE_SIGNING_SECRET = 'an-independent-unsubscribe-secret';
    try {
      expect(parseNotificationUnsubscribeToken(derived)).toBeNull();

      const dedicated = buildNotificationUnsubscribeToken({
        tenantId: 'tenant-a',
        userId: 'user-a',
        eventType: 'invoice_overdue',
      });
      expect(parseNotificationUnsubscribeToken(dedicated)).toEqual({
        tenantId: 'tenant-a',
        userId: 'user-a',
        eventType: 'invoice_overdue',
      });
    } finally {
      delete process.env.NOTIFICATION_UNSUBSCRIBE_SIGNING_SECRET;
    }
  });

  it('fails closed when the dedicated secret is left on the placeholder', () => {
    process.env.NOTIFICATION_UNSUBSCRIBE_SIGNING_SECRET = 'change-me-in-production';
    delete process.env.INTERNAL_REQUEST_SIGNING_SECRET;
    try {
      expect(() =>
        buildNotificationUnsubscribeToken({
          tenantId: 'tenant-a',
          userId: 'user-a',
          eventType: 'system_updates',
        }),
      ).toThrow(/not configured securely/i);
    } finally {
      delete process.env.NOTIFICATION_UNSUBSCRIBE_SIGNING_SECRET;
    }
  });

  it('pins the public unsubscribe route to the signed parser', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'app/api/users/notifications/unsubscribe/route.ts'),
      'utf8',
    );
    expect(source).toContain('parseNotificationUnsubscribeToken(payload.token)');
    expect(source).not.toContain(
      'NotificationPreferenceService.parseUnsubscribeToken(payload.token)',
    );
  });
});
