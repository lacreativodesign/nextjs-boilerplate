/**
 * NOT-08 / NOT-09 — Webhook SSRF guard + notification email HTML escaping.
 *
 * NOT-08: `sendWebhooks` (lib/notifications/notification-service.ts) used to fetch a
 * tenant-supplied URL with no scheme/host validation and no timeout, so a tenant could
 * point delivery at loopback/private ranges or the cloud-metadata endpoint (SSRF) and a
 * slow endpoint could hang delivery. It now refuses non-https and private/loopback/
 * link-local/metadata hosts, refuses redirects, and aborts after 5s.
 *
 * NOT-09: `buildEmailHtml` interpolated title/message/actionUrl/actionLabel straight into
 * HTML, so a crafted notification could inject markup/scripts or a `javascript:` href. It
 * now HTML-escapes all text and sanitizes the action URL to http(s) only.
 *
 * These assertions pin both controls, and that the raw interpolations are gone.
 */

import fs from 'fs';
import path from 'path';

const mockWebhookGet = jest.fn();

jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return {
      collection: (name: string) => {
        if (name === 'notification_webhooks') {
          return {
            where: () => ({
              where: () => ({ get: mockWebhookGet }),
            }),
          };
        }
        // notifications collection: swallow the delivery-status update.
        return { doc: () => ({ update: jest.fn(async () => {}) }) };
      },
    };
  },
}));

jest.mock('@/lib/email/email-service', () => ({
  sendEmail: jest.fn(async () => {}),
}));

jest.mock('@/lib/sms/sms-service', () => ({
  sendSMS: jest.fn(async () => {}),
}));

import { NotificationService } from '@/lib/notifications/notification-service';

// Reach the private static helpers under test without widening the public API.
const svc = NotificationService as unknown as {
  isSafeWebhookUrl: (raw: string) => boolean;
  sanitizeActionUrl: (value: unknown) => string | null;
  buildEmailHtml: (notification: Record<string, unknown>) => string;
  sendWebhooks: (id: string, notification: Record<string, unknown>) => Promise<void>;
};

const baseNotification = {
  tenantId: 'tenant_a',
  userId: 'u1',
  userEmail: 'u1@example.com',
  type: 'info',
  category: 'system',
  priority: 'medium',
  title: 'Hello',
  message: 'World',
  actionUrl: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockWebhookGet.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('NOT-08: webhook SSRF guard', () => {
  it('allows only public https targets and rejects loopback/private/link-local/metadata hosts', () => {
    // Safe: public https.
    expect(svc.isSafeWebhookUrl('https://hooks.example.com/endpoint')).toBe(true);
    expect(svc.isSafeWebhookUrl('https://8.8.8.8/hook')).toBe(true);

    // Wrong scheme.
    expect(svc.isSafeWebhookUrl('http://hooks.example.com/endpoint')).toBe(false);
    expect(svc.isSafeWebhookUrl('ftp://hooks.example.com/endpoint')).toBe(false);
    expect(svc.isSafeWebhookUrl('not a url')).toBe(false);

    // Loopback / internal names.
    expect(svc.isSafeWebhookUrl('https://localhost/hook')).toBe(false);
    expect(svc.isSafeWebhookUrl('https://foo.localhost/hook')).toBe(false);
    expect(svc.isSafeWebhookUrl('https://db.internal/hook')).toBe(false);

    // Cloud metadata endpoints.
    expect(svc.isSafeWebhookUrl('https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(svc.isSafeWebhookUrl('https://metadata.google.internal/computeMetadata')).toBe(false);

    // Private / loopback / link-local IPv4.
    expect(svc.isSafeWebhookUrl('https://127.0.0.1/hook')).toBe(false);
    expect(svc.isSafeWebhookUrl('https://10.0.0.5/hook')).toBe(false);
    expect(svc.isSafeWebhookUrl('https://172.16.4.4/hook')).toBe(false);
    expect(svc.isSafeWebhookUrl('https://192.168.1.10/hook')).toBe(false);
    expect(svc.isSafeWebhookUrl('https://0.0.0.0/hook')).toBe(false);

    // IPv6 loopback / link-local / unique-local.
    expect(svc.isSafeWebhookUrl('https://[::1]/hook')).toBe(false);
  });

  it('refuses unsafe targets before fetch, and calls safe targets with redirect refusal + abort signal', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, text: async () => '' }));
    // @ts-expect-error - override the global for the duration of the test.
    global.fetch = fetchMock;

    // Unsafe target: sendWebhooks must throw and never fetch.
    mockWebhookGet.mockResolvedValueOnce({
      empty: false,
      docs: [{ data: () => ({ url: 'http://169.254.169.254/', enabled: true }) }],
    });
    await expect(svc.sendWebhooks('n1', { ...baseNotification })).rejects.toThrow(/unsafe URL/i);
    expect(fetchMock).not.toHaveBeenCalled();

    // Safe target: fetch is called with redirect: 'error' and an AbortSignal.
    mockWebhookGet.mockResolvedValueOnce({
      empty: false,
      docs: [{ data: () => ({ url: 'https://hooks.example.com/x', enabled: true }) }],
    });
    await svc.sendWebhooks('n2', { ...baseNotification });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toBe('https://hooks.example.com/x');
    expect(options.redirect).toBe('error');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('NOT-09: notification email HTML escaping', () => {
  it('HTML-escapes title/message/label and drops the raw source interpolations', () => {
    const html = svc.buildEmailHtml({
      ...baseNotification,
      title: '<script>alert(1)</script>',
      message: 'a & b < c > d "e" \'f\'',
      actionUrl: 'https://app.example.com/view',
      actionLabel: '<b>Click</b>',
    });

    // No raw script markup survives.
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('a &amp; b &lt; c &gt; d &quot;e&quot; &#39;f&#39;');
    expect(html).toContain('&lt;b&gt;Click&lt;/b&gt;');

    // The source template must interpolate the sanitized locals, not the raw fields.
    const source = fs.readFileSync(
      path.join(process.cwd(), 'lib/notifications/notification-service.ts'),
      'utf8',
    );
    expect(source).toContain('<h2>${safeTitle}</h2>');
    expect(source).toContain('<p>${safeMessage}</p>');
    expect(source).not.toContain('<h2>${notification.title}</h2>');
    expect(source).not.toContain('<p>${notification.message}</p>');
    expect(source).not.toContain('href="${notification.actionUrl}"');
  });

  it('sanitizes the action URL to http(s) only, dropping javascript:/data: hrefs', () => {
    expect(svc.sanitizeActionUrl('javascript:alert(1)')).toBeNull();
    expect(svc.sanitizeActionUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(svc.sanitizeActionUrl('')).toBeNull();
    expect(svc.sanitizeActionUrl('   ')).toBeNull();
    expect(svc.sanitizeActionUrl('https://app.example.com/view')).toBe(
      'https://app.example.com/view',
    );

    // A javascript: actionUrl must not produce an href in the rendered email.
    const evil = svc.buildEmailHtml({
      ...baseNotification,
      actionUrl: 'javascript:alert(document.cookie)',
      actionLabel: 'Go',
    });
    expect(evil).not.toContain('javascript:');
    expect(evil).not.toContain('<a href');

    // A valid https actionUrl renders as a button href.
    const ok = svc.buildEmailHtml({
      ...baseNotification,
      actionUrl: 'https://app.example.com/view',
      actionLabel: 'Go',
    });
    expect(ok).toContain('href="https://app.example.com/view"');
  });
});
