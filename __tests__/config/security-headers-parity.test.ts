import * as fs from 'fs';
import * as path from 'path';

/**
 * P3-4: the STATIC (non-CSP) security headers are defined in two places that must agree:
 *   1. lib/security/headers.ts `getSecurityHeaders` — set by the middleware on every response
 *      whose path matches the middleware `config.matcher` (app pages + /api/*).
 *   2. next.config.js `headers()` `/(.*)` block — the ONLY security headers on responses the
 *      matcher does not run on: static assets under /_next/*, and public pages/files outside
 *      the matcher.
 *
 * If these drift, some responses (notably static assets) silently lose headers like HSTS. This
 * test keeps them in parity. The per-request nonce CSP is deliberately NOT covered here — it is
 * middleware-only because it needs a per-request nonce.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

// The static header set that must appear in BOTH sources.
const STATIC_SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com"), usb=(), fullscreen=(self)',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-DNS-Prefetch-Control': 'off',
};

describe('P3-4: security-header parity between middleware and next.config', () => {
  it('lib/security/headers.ts declares each static header with the agreed value', () => {
    const src = read('lib/security/headers.ts');
    for (const [key, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
      expect(src).toContain(`'${key}'`);
      expect(src).toContain(value);
    }
  });

  it('next.config.js global (.*) block carries every static header with the same value', () => {
    const src = read('next.config.js');
    const start = src.indexOf("source: '/(.*)'");
    expect(start).toBeGreaterThan(-1);
    // The block ends at the `];` that closes this route's `headers` array.
    const end = src.indexOf('];', start);
    expect(end).toBeGreaterThan(start);
    const block = src.slice(start, end);
    for (const [key, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
      expect(block).toContain(`'${key}'`);
      expect(block).toContain(`'${value}'`);
    }
  });

  it('does not reintroduce the deprecated X-XSS-Protection header', () => {
    expect(read('next.config.js')).not.toContain('X-XSS-Protection');
  });
});
