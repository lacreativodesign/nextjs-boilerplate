/**
 * P0-07 — support screenshots and tenant branding no longer mint permanent bearer URLs.
 *
 *   Support screenshots: stored with no token, persisted as a path, never sent to a
 *   browser as a path or URL, and served only through the super_admin route (covered in
 *   __tests__/api/p0-07-protected-downloads.test.ts).
 *
 *   Branding: the deliberate public exception. Stored with no token in the CANONICAL
 *   bucket, persisted as a path plus a stable Bizosto URL, served by a public endpoint
 *   that can only ever return that tenant's logo object.
 */

import { FakeDb } from './test-utils/firestore-quota-double';

let db: FakeDb;
const save = jest.fn();
const getMetadata = jest.fn();
const download = jest.fn();
const bucketCalls = jest.fn();
const bucketName = jest.fn(() => 'la-creativo-erp.firebasestorage.app');

jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return db;
  },
  adminStorage: {
    bucket: (name?: string) => {
      bucketCalls(name);
      return {
        name,
        file: (path: string) => ({
          save: (...args: unknown[]) => save(path, ...args),
          getMetadata: () => getMetadata(path),
          download: () => download(path),
        }),
      };
    },
  },
}));
jest.mock('@/lib/storage/bucket', () => ({ getStorageBucketName: () => bucketName() }));

const getCurrentUser = jest.fn();
jest.mock('@/app/api/admin/_utils', () => ({
  ...jest.requireActual('@/app/api/admin/_utils'),
  getCurrentUser: () => getCurrentUser(),
}));
jest.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: jest.fn(async () => undefined) }));
jest.mock('@/app/lib/notifications', () => ({
  createRoleNotifications: jest.fn(async () => undefined),
}));
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: jest.fn(async () => ({})) } })),
}));
const requireSuperAdmin = jest.fn();
jest.mock('@/app/api/super_admin/_utils', () => ({
  requireSuperAdmin: (req: unknown) => requireSuperAdmin(req),
}));
jest.mock('@/lib/tenant/audit', () => ({ writeAuditLog: jest.fn(async () => undefined) }));

import {
  resolveTicketScreenshotPath,
  ticketScreenshotPath,
  uploadTicketScreenshot,
} from '@/lib/support/storage';
import { superAdminTicketView, withoutScreenshotLocators } from '@/lib/support/ticket-view';
import { GET as ticketsGet, POST as ticketsPost } from '@/app/api/support/tickets/route';
import { updateTenantBranding, uploadTenantLogo } from '@/lib/white-label/branding';
import {
  absoluteLogoUrl,
  isFirebaseTokenUrl,
  isPublicLogoPath,
  normalizeLogoUrl,
  publicLogoHref,
  UnsupportedLogoUrlError,
} from '@/lib/white-label/public-logo';
import { GET as publicLogo } from '@/app/api/public/branding/[tenantId]/logo/route';
import { POST as superAdminLogo } from '@/app/api/super_admin/tenants/[tenantId]/branding/logo/route';
import { POST as superAdminBranding } from '@/app/api/super_admin/tenants/[tenantId]/branding/route';

const T = 'tenant_a';
const PNG_1x1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const firebaseUrl = (path: string, token = 'LEGACY-TOKEN') =>
  `https://firebasestorage.googleapis.com/v0/b/la-creativo-erp.firebasestorage.app/o/${encodeURIComponent(path)}?alt=media&token=${token}`;

beforeEach(() => {
  jest.clearAllMocks();
  db = new FakeDb();
  bucketName.mockReturnValue('la-creativo-erp.firebasestorage.app');
  save.mockResolvedValue(undefined);
  getMetadata.mockResolvedValue([{ generation: '1700000000000123', size: 68 }]);
  download.mockResolvedValue([Buffer.from(PNG_1x1, 'base64')]);
});

// ---------------------------------------------------------------------------------------
// Support screenshots
// ---------------------------------------------------------------------------------------

describe('uploadTicketScreenshot', () => {
  it('writes to the canonical bucket with no download token and returns only the path', async () => {
    const result = await uploadTicketScreenshot({
      tenantId: T,
      ticketId: 'ticket_1',
      screenshot: { buffer: Buffer.from('x'), contentType: 'image/png', ext: 'png' },
    });

    expect(result).toEqual({ storagePath: `tenants/${T}/support/ticket_1.png` });
    expect(bucketCalls).toHaveBeenCalledWith('la-creativo-erp.firebasestorage.app');
    const [, , options] = save.mock.calls[0];
    expect(options.metadata.metadata).toEqual({ tenantId: T, ticketId: 'ticket_1' });
    expect(JSON.stringify(options)).not.toContain('firebaseStorageDownloadTokens');
    expect(options.metadata.cacheControl).toContain('private');
  });

  it('refuses to write anywhere when no bucket is configured', async () => {
    bucketName.mockReturnValue(undefined as unknown as string);
    await expect(
      uploadTicketScreenshot({
        tenantId: T,
        ticketId: 'ticket_1',
        screenshot: { buffer: Buffer.from('x'), contentType: 'image/png', ext: 'png' },
      }),
    ).rejects.toThrow(/not configured/);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('resolveTicketScreenshotPath', () => {
  it('accepts only the ticket’s own object', () => {
    const own = ticketScreenshotPath(T, 'ticket_1', 'webp');
    expect(resolveTicketScreenshotPath({ id: 'ticket_1', tenantId: T, screenshotPath: own })).toBe(
      own,
    );
    expect(
      resolveTicketScreenshotPath({
        id: 'ticket_1',
        tenantId: T,
        screenshotPath: `tenants/${T}/support/ticket_2.png`,
      }),
    ).toBeNull();
    expect(
      resolveTicketScreenshotPath({
        id: 'ticket_1',
        tenantId: T,
        screenshotPath: `tenants/${T}/projects/p/secret.pdf`,
      }),
    ).toBeNull();
    expect(
      resolveTicketScreenshotPath({
        id: 'ticket_1',
        tenantId: 'tenant_b',
        screenshotPath: own,
      }),
    ).toBeNull();
  });

  it('recovers a legacy path from its tokenized URL and drops the token', () => {
    const path = `tenants/${T}/support/ticket_1.jpg`;
    const resolved = resolveTicketScreenshotPath({
      id: 'ticket_1',
      tenantId: T,
      screenshotUrl: firebaseUrl(path),
    });
    expect(resolved).toBe(path);
    expect(resolved).not.toContain('LEGACY-TOKEN');
  });

  it('refuses a legacy URL on another host, or for another ticket', () => {
    expect(
      resolveTicketScreenshotPath({
        id: 'ticket_1',
        tenantId: T,
        screenshotUrl: `https://evil.example/v0/b/x/o/${encodeURIComponent(`tenants/${T}/support/ticket_1.png`)}`,
      }),
    ).toBeNull();
    expect(
      resolveTicketScreenshotPath({
        id: 'ticket_1',
        tenantId: T,
        screenshotUrl: firebaseUrl(`tenants/${T}/support/ticket_9.png`),
      }),
    ).toBeNull();
  });
});

describe('ticket views never carry a screenshot locator', () => {
  const legacy = {
    title: 't',
    screenshotUrl: firebaseUrl(`tenants/${T}/support/x.png`),
    screenshotPath: `tenants/${T}/support/x.png`,
    hasScreenshot: true,
  };

  it('tenant view: hasScreenshot only', () => {
    const view = withoutScreenshotLocators(legacy);
    expect(view).toEqual({ title: 't', hasScreenshot: true });
  });

  it('super_admin view: a same-origin route instead of the URL or path', () => {
    const view = superAdminTicketView('x', legacy);
    expect(view).toMatchObject({
      hasScreenshot: true,
      screenshotHref: '/api/super_admin/tickets/x/screenshot',
    });
    expect(JSON.stringify(view)).not.toContain('LEGACY-TOKEN');
    expect(JSON.stringify(view)).not.toContain('tenants/');
  });

  it('super_admin view: no link when there is no screenshot', () => {
    expect(superAdminTicketView('x', { hasScreenshot: false })).toMatchObject({
      hasScreenshot: false,
      screenshotHref: null,
    });
  });
});

describe('POST /api/support/tickets — persisted shape', () => {
  const post = (body: Record<string, unknown>) =>
    ticketsPost(
      new Request('https://app.local/api/support/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );

  it('stores the screenshot PATH, an explicit null URL, and returns neither', async () => {
    getCurrentUser.mockResolvedValue({ uid: 'u1', role: 'admin', tenantId: T });
    const res = await post({
      title: 'Broken chart',
      description: 'The revenue chart is empty on reload.',
      screenshot: `data:image/png;base64,${PNG_1x1}`,
    });
    expect(res.status).toBe(200);

    const [ticket] = Array.from(db.bucket('platform_tickets').values());
    expect(ticket.screenshotPath).toMatch(new RegExp(`^tenants/${T}/support/[^/]+\\.png$`));
    expect(ticket.screenshotUrl).toBeNull();
    expect(ticket.hasScreenshot).toBe(true);

    const body = await res.json();
    expect(body.hasScreenshot).toBe(true);
    expect(body).not.toHaveProperty('screenshotPath');
    expect(body).not.toHaveProperty('screenshotUrl');
  });

  it('keeps the 3MB ceiling', async () => {
    getCurrentUser.mockResolvedValue({ uid: 'u1', role: 'admin', tenantId: T });
    const res = await post({
      title: 'Huge',
      description: 'An oversized screenshot payload.',
      screenshot: `data:image/png;base64,${'A'.repeat(4.2 * 1024 * 1024)}`,
    });
    expect(res.status).toBe(413);
    expect(save).not.toHaveBeenCalled();
  });

  it('GET: a tenant admin never receives a legacy tokenized screenshot URL', async () => {
    db.seed('platform_tickets', [
      [
        'legacy',
        { tenantId: T, title: 'old', screenshotUrl: firebaseUrl('x'), hasScreenshot: true },
      ],
    ]);
    getCurrentUser.mockResolvedValue({ uid: 'u1', role: 'admin', tenantId: T });
    const res = await ticketsGet();
    const text = await res.text();
    expect(text).not.toContain('LEGACY-TOKEN');
    expect(text).not.toContain('screenshotUrl');
    expect(JSON.parse(text).tickets[0].hasScreenshot).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------
// Branding — the deliberate public exception
// ---------------------------------------------------------------------------------------

describe('uploadTenantLogo', () => {
  it('stores in the canonical bucket with no token and persists path + public href', async () => {
    db.seed('tenants', [[T, { name: 'Acme' }]]);
    const result = await uploadTenantLogo(T, { dataUrl: `data:image/png;base64,${PNG_1x1}` });

    expect(bucketCalls).toHaveBeenCalledWith('la-creativo-erp.firebasestorage.app');
    expect(bucketCalls).not.toHaveBeenCalledWith(undefined);
    expect(result).toEqual({
      logoUrl: `/api/public/branding/${T}/logo?v=1700000000000123`,
      storagePath: `tenants/${T}/branding/logo.png`,
    });
    const [, , options] = save.mock.calls[0];
    expect(JSON.stringify(options)).not.toContain('firebaseStorageDownloadTokens');

    const tenant = db.bucket('tenants').get(T)!;
    expect(tenant.whiteLabel).toMatchObject({
      logoUrl: result.logoUrl,
      logoStoragePath: result.storagePath,
    });
    expect(tenant.brand).toMatchObject({ logoUrl: result.logoUrl });
    expect(JSON.stringify(tenant)).not.toContain('token=');
  });

  it('keeps the 2MB ceiling and the image-type allow-list', async () => {
    const big = Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64');
    await expect(uploadTenantLogo(T, { dataUrl: `data:image/png;base64,${big}` })).rejects.toThrow(
      /2MB/,
    );
    await expect(
      uploadTenantLogo(T, { dataUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }),
    ).rejects.toThrow(/Unsupported/);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('normalizeLogoUrl — no bearer URL is ever stored again', () => {
  it('migrates this tenant’s own legacy logo URL to the public endpoint, dropping the token', () => {
    const out = normalizeLogoUrl(firebaseUrl(`tenants/${T}/brand/logo.webp`), T);
    expect(out).toEqual({
      logoUrl: publicLogoHref(T),
      logoStoragePath: `tenants/${T}/brand/logo.webp`,
    });
  });

  it.each([
    ['another tenant’s logo', firebaseUrl('tenants/tenant_b/branding/logo.png')],
    ['a protected object', firebaseUrl(`tenants/${T}/projects/p/brief.pdf`)],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a data: URL', 'data:image/png;base64,AAAA'],
    ['plain http', 'http://cdn.example/logo.png'],
    ['a relative path that is not the endpoint', '/uploads/logo.png'],
    ['another tenant’s endpoint', publicLogoHref('tenant_b')],
  ])('refuses %s', (_label, value) => {
    expect(() => normalizeLogoUrl(value, T)).toThrow(UnsupportedLogoUrlError);
  });

  it('keeps an external https logo and this tenant’s own endpoint', () => {
    expect(normalizeLogoUrl('https://cdn.example/logo.png', T)).toEqual({
      logoUrl: 'https://cdn.example/logo.png',
    });
    expect(normalizeLogoUrl(publicLogoHref(T, 42), T)).toEqual({ logoUrl: publicLogoHref(T, 42) });
    expect(normalizeLogoUrl(null, T)).toEqual({ logoUrl: null });
  });

  it('recognises tokenized Firebase URLs and resolves the endpoint for react-pdf', () => {
    expect(isFirebaseTokenUrl(firebaseUrl('x'))).toBe(true);
    expect(isFirebaseTokenUrl('https://firebasestorage.googleapis.com/v0/b/x/o/y')).toBe(false);
    expect(absoluteLogoUrl(publicLogoHref(T), 'https://app.bizosto.com')).toBe(
      `https://app.bizosto.com/api/public/branding/${T}/logo`,
    );
  });

  it('allows exactly the tenant logo objects to be served publicly', () => {
    expect(isPublicLogoPath(`tenants/${T}/branding/logo.svg`, T)).toBe(true);
    expect(isPublicLogoPath(`tenants/${T}/brand/logo.webp`, T)).toBe(true);
    expect(isPublicLogoPath(`tenants/${T}/branding/logo.pdf`, T)).toBe(false);
    expect(isPublicLogoPath(`tenants/${T}/projects/p/logo.png`, T)).toBe(false);
    expect(isPublicLogoPath(`tenants/tenant_b/branding/logo.png`, T)).toBe(false);
  });
});

describe('updateTenantBranding', () => {
  const base = {
    primaryColor: '#2563eb',
    secondaryColor: '#1d4ed8',
    accentColor: '#0f766e',
    fontFamily: 'Inter',
    themeMode: 'system' as const,
  };

  it('refuses a foreign tokenized URL', async () => {
    db.seed('tenants', [[T, {}]]);
    await expect(
      updateTenantBranding(
        T,
        { ...base, logoUrl: firebaseUrl('tenants/tenant_b/branding/logo.png') },
        'u1',
      ),
    ).rejects.toThrow(UnsupportedLogoUrlError);
  });

  it('re-saving a legacy logo migrates it instead of storing the token again', async () => {
    db.seed('tenants', [[T, {}]]);
    const next = await updateTenantBranding(
      T,
      { ...base, logoUrl: firebaseUrl(`tenants/${T}/branding/logo.png`) },
      'u1',
    );
    expect(next.logoUrl).toBe(publicLogoHref(T));
    expect(next.logoStoragePath).toBe(`tenants/${T}/branding/logo.png`);
    expect(JSON.stringify(db.bucket('tenants').get(T))).not.toContain('token=');
  });
});

describe('GET /api/public/branding/[tenantId]/logo', () => {
  const call = (tenantId: string) =>
    publicLogo(new Request(`https://app.local/api/public/branding/${tenantId}/logo`), {
      params: Promise.resolve({ tenantId }),
    });

  it('serves the recorded logo bytes with nosniff and a script-free CSP, no token, no path', async () => {
    db.seed('tenants', [
      [T, { whiteLabel: { logoStoragePath: `tenants/${T}/branding/logo.png` } }],
    ]);
    const res = await call(T);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(res.headers.get('content-security-policy')).toContain('sandbox');
    expect(bucketCalls).toHaveBeenCalledWith('la-creativo-erp.firebasestorage.app');
    expect(download).toHaveBeenCalledWith(`tenants/${T}/branding/logo.png`);
  });

  it('serves a pre-P0-07 tenant from the path inside its legacy URL, without the token', async () => {
    db.seed('tenants', [[T, { brand: { logoUrl: firebaseUrl(`tenants/${T}/brand/logo.webp`) } }]]);
    const res = await call(T);
    expect(res.status).toBe(200);
    expect(download).toHaveBeenCalledWith(`tenants/${T}/brand/logo.webp`);
  });

  it.each([
    [
      'a tenant document pointing at a protected object',
      { whiteLabel: { logoStoragePath: `tenants/${T}/projects/p/brief.pdf` } },
    ],
    [
      'a tenant document pointing at another tenant',
      { whiteLabel: { logoStoragePath: 'tenants/tenant_b/branding/logo.png' } },
    ],
    ['a tenant with no logo', {}],
  ])('404s for %s and reads nothing', async (_label, doc) => {
    db.seed('tenants', [[T, doc]]);
    const res = await call(T);
    expect(res.status).toBe(404);
    expect(download).not.toHaveBeenCalled();
  });

  it('404s for an unknown or malformed tenant id', async () => {
    expect((await call('missing')).status).toBe(404);
    expect((await call('../etc')).status).toBe(404);
    expect(download).not.toHaveBeenCalled();
  });

  it('refuses an object larger than a logo', async () => {
    db.seed('tenants', [
      [T, { whiteLabel: { logoStoragePath: `tenants/${T}/branding/logo.png` } }],
    ]);
    getMetadata.mockResolvedValue([{ size: 3 * 1024 * 1024 }]);
    expect((await call(T)).status).toBe(404);
    expect(download).not.toHaveBeenCalled();
  });
});

describe('POST /api/super_admin/tenants/[tenantId]/branding/logo', () => {
  const call = (tenantId: string, body: unknown) =>
    superAdminLogo(
      new Request('https://app.local', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }) as never,
      { params: Promise.resolve({ tenantId }) },
    );

  it('refuses a non-super_admin before touching storage', async () => {
    requireSuperAdmin.mockRejectedValue(new Error('Forbidden'));
    expect((await call(T, { dataUrl: `data:image/png;base64,${PNG_1x1}` })).status).toBe(403);
    expect(save).not.toHaveBeenCalled();
  });

  it('refuses a tenant that does not exist (no phantom tenant)', async () => {
    requireSuperAdmin.mockResolvedValue({ uid: 'op' });
    expect((await call('ghost', { dataUrl: `data:image/png;base64,${PNG_1x1}` })).status).toBe(404);
    expect(save).not.toHaveBeenCalled();
  });

  it('uploads through the server and returns the public endpoint, never a token URL', async () => {
    requireSuperAdmin.mockResolvedValue({ uid: 'op' });
    db.seed('tenants', [[T, {}]]);
    const res = await call(T, { dataUrl: `data:image/webp;base64,${PNG_1x1}` });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logoUrl).toMatch(new RegExp(`^/api/public/branding/${T}/logo\\?v=\\d+$`));
  });
});

describe('branding edge cases (P0-07)', () => {
  it('public-logo helpers reject malformed input', () => {
    expect(publicLogoHref(T, 'not-a-number')).toBe(`/api/public/branding/${T}/logo`);
    expect(absoluteLogoUrl(null, 'https://app.bizosto.com')).toBeNull();
    expect(absoluteLogoUrl('https://cdn.example/l.png', 'x')).toBe('https://cdn.example/l.png');
    expect(absoluteLogoUrl(publicLogoHref(T), 'not a url')).toBeNull();
    expect(isPublicLogoPath(`tenants/${T}/branding/logo.png`, '../x')).toBe(false);
    expect(isFirebaseTokenUrl('not a url')).toBe(false);
    expect(() => normalizeLogoUrl('https://' + 'a'.repeat(2100) + '.com/l.png', T)).toThrow(
      UnsupportedLogoUrlError,
    );
    expect(() => normalizeLogoUrl('not a url at all', T)).toThrow(UnsupportedLogoUrlError);
    // A tokenized URL whose path cannot be decoded is refused, not trusted.
    expect(() =>
      normalizeLogoUrl('https://firebasestorage.googleapis.com/v0/b/x/o/%E0%A4%A?token=a', T),
    ).toThrow(UnsupportedLogoUrlError);
  });

  it('clearing a logo also clears its stored path', async () => {
    db.seed('tenants', [
      [
        T,
        {
          whiteLabel: {
            logoUrl: publicLogoHref(T),
            logoStoragePath: `tenants/${T}/branding/logo.png`,
          },
        },
      ],
    ]);
    const next = await updateTenantBranding(
      T,
      {
        primaryColor: '#2563eb',
        secondaryColor: '#1d4ed8',
        accentColor: '#0f766e',
        fontFamily: 'Inter',
        themeMode: 'system',
        logoUrl: null,
      },
      'u1',
    );
    expect(next.logoUrl).toBeNull();
    expect(next.logoStoragePath).toBeNull();
  });

  it('public endpoint: a storage failure is a 502 that caches nothing', async () => {
    db.seed('tenants', [
      [T, { whiteLabel: { logoStoragePath: `tenants/${T}/branding/logo.png` } }],
    ]);
    getMetadata.mockRejectedValue(Object.assign(new Error('backend'), { code: 503 }));
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await publicLogo(new Request('https://app.local/x'), {
      params: Promise.resolve({ tenantId: T }),
    });
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toBe('no-store');
    log.mockRestore();
  });

  it('public endpoint: a vanished object is a 404', async () => {
    db.seed('tenants', [
      [T, { whiteLabel: { logoStoragePath: `tenants/${T}/branding/logo.png` } }],
    ]);
    getMetadata.mockRejectedValue(Object.assign(new Error('gone'), { code: 404 }));
    const res = await publicLogo(new Request('https://app.local/x'), {
      params: Promise.resolve({ tenantId: T }),
    });
    expect(res.status).toBe(404);
  });

  describe('super_admin logo upload refusals', () => {
    const call = (tenantId: string, body: unknown) =>
      superAdminLogo(
        new Request('https://app.local', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }) as never,
        { params: Promise.resolve({ tenantId }) },
      );

    beforeEach(() => requireSuperAdmin.mockResolvedValue({ uid: 'op' }));

    it('rejects an unsafe tenant id and a malformed body', async () => {
      expect((await call('../x', { dataUrl: 'data:image/png;base64,AAAA' })).status).toBe(404);
      db.seed('tenants', [[T, {}]]);
      expect((await call(T, { nope: true })).status).toBe(400);
      expect(save).not.toHaveBeenCalled();
    });

    it('rejects an unsupported image with 400', async () => {
      db.seed('tenants', [[T, {}]]);
      const res = await call(T, { dataUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' });
      expect(res.status).toBe(400);
      expect(save).not.toHaveBeenCalled();
    });

    it('maps an unauthenticated caller to 401 and an internal failure to 500', async () => {
      requireSuperAdmin.mockRejectedValue(new Error('Unauthorized'));
      expect((await call(T, { dataUrl: 'data:image/png;base64,AAAA' })).status).toBe(401);
      requireSuperAdmin.mockRejectedValue(new Error('boom'));
      const res = await call(T, { dataUrl: 'data:image/png;base64,AAAA' });
      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toMatchObject({ error: 'Server error' });
    });
  });
});

describe('POST /api/super_admin/tenants/[tenantId]/branding — logo URL normalisation', () => {
  const call = (tenantId: string, body: unknown) =>
    superAdminBranding(
      new Request('https://app.local', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }) as never,
      { params: Promise.resolve({ tenantId }) },
    );

  beforeEach(() => {
    requireSuperAdmin.mockResolvedValue({ uid: 'op' });
    db.seed('tenants', [[T, {}]]);
  });

  it('refuses another tenant’s tokenized URL', async () => {
    const res = await call(T, {
      name: 'Acme',
      logoUrl: firebaseUrl('tenants/tenant_b/branding/logo.png'),
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(db.bucket('tenants').get(T))).not.toContain('token=');
  });

  it('migrates this tenant’s own legacy logo to the public endpoint and records its path', async () => {
    const res = await call(T, {
      name: 'Acme',
      logoUrl: firebaseUrl(`tenants/${T}/brand/logo.webp`),
    });
    expect(res.status).toBe(200);
    const tenant = db.bucket('tenants').get(T)!;
    expect(tenant.brand).toMatchObject({ logoUrl: publicLogoHref(T) });
    expect(tenant.whiteLabel).toMatchObject({ logoStoragePath: `tenants/${T}/brand/logo.webp` });
    expect(JSON.stringify(tenant)).not.toContain('token=');
  });

  it('accepts the tenant’s own endpoint as re-submitted by the Super Admin screen', async () => {
    const res = await call(T, { name: 'Acme', logoUrl: publicLogoHref(T, 17) });
    expect(res.status).toBe(200);
    expect(db.bucket('tenants').get(T)!.brand).toMatchObject({ logoUrl: publicLogoHref(T, 17) });
  });
});
