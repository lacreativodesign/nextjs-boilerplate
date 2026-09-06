import fs from 'fs';
import path from 'path';
import {
  buildNotificationUnsubscribeToken,
  parseNotificationUnsubscribeToken,
} from '@/lib/notifications/unsubscribe-token';

const OLD_SECRET = process.env.INTERNAL_REQUEST_SIGNING_SECRET;

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
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    );
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
