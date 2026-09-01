import fs from 'fs';
import path from 'path';

/**
 * SOC2 F-07 regression guard.
 *
 * The login page, the signup funnel and /api/session-login are the three
 * highest-value unauthenticated surfaces on the platform: they carry the
 * credential exchange. Two separate defects left them unprotected.
 *
 * 1. The login/signup branch of middleware returned a BARE `NextResponse.next()`
 *    rather than routing through `applyRateHeaders(...)`. Every other branch
 *    applies the security headers; this one applied none — no CSP, no HSTS, no
 *    X-Frame-Options, no Referrer-Policy — and never forwarded the `x-nonce`
 *    request header, so the root layout could not nonce its inline theme script.
 *
 * 2. `/signup` was absent from the matcher entirely, so middleware never even ran
 *    for the signup funnel.
 *
 * Both are source-level properties, so both are asserted here rather than through
 * a request-level harness that would not exercise the real matcher.
 */

const MIDDLEWARE = path.join(process.cwd(), 'middleware.ts');
const source = fs.readFileSync(MIDDLEWARE, 'utf8');

describe('unauthenticated auth surfaces carry security headers', () => {
  it('routes the login/signup/session-login branch through applyRateHeaders', () => {
    const branch = source.slice(
      source.indexOf("pathname.startsWith('/login')"),
      source.indexOf("if (pathname === '/' ||"),
    );

    expect(branch).toContain('applyRateHeaders(');
    expect(branch).toContain('request: { headers: requestHeaders }');
    // The bare return is what shipped the pages with no headers at all.
    expect(branch).not.toMatch(/return\s+NextResponse\.next\(\)\s*;/);
  });

  it('forwards the CSP nonce on that branch so the layout can nonce its inline script', () => {
    // requestHeaders is the only carrier of x-nonce; passing the bare request drops it.
    expect(source).toContain("requestHeaders.set('x-nonce', nonce)");
  });

  it('covers both /login and /signup in the middleware matcher', () => {
    const matcher = source.slice(source.indexOf('export const config'));
    expect(matcher).toContain("'/login/:path*'");
    expect(matcher).toContain("'/signup/:path*'");
  });
});
