import { NextResponse } from 'next/server';

function buildCsp(nonce?: string) {
  const isProd = process.env.NODE_ENV === 'production';

  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    ...(isProd ? [] : ["'unsafe-eval'"]),
    'https://apis.google.com',
    'https://*.firebaseio.com',
    'https://*.googleapis.com',
  ]
    .filter(Boolean)
    .join(' ');

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.googleapis.com https://*.googleusercontent.com https://firebasestorage.googleapis.com",
    "connect-src 'self' https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.cloudfunctions.net https://api.upstash.com",
    "frame-ancestors 'none'",
    "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

/**
 * Path of the CSP violation report sink (app/api/security/csp-report/route.ts).
 * The Report-Only strict policy points its report-uri / report-to here.
 */
export const CSP_REPORT_URI = '/api/security/csp-report';

/**
 * Strict, nonce-based CSP used ONLY for the Content-Security-Policy-Report-Only
 * header (S31-A). It mirrors buildCsp for every non-script directive, but locks
 * script-src down to the per-request nonce + 'strict-dynamic' (dropping
 * 'unsafe-inline'), and appends report-uri / report-to so violations are sent
 * to the CSP report sink. This is REPORT-ONLY — it never blocks anything. The
 * enforced Content-Security-Policy stays the permissive buildCsp policy, so
 * promoting this to enforcing is a separate, deliberate step (S31-B).
 *
 * S15: this is also set on the REQUEST headers by middleware. Next.js reads the nonce out
 * of a Content-Security-Policy request header in order to stamp `nonce=` onto the script
 * tags IT generates (the bootstrap and hydration scripts). Without that, Next's own
 * scripts carry no nonce, so a strict policy blocks the framework itself — which is why a
 * previous attempt to enforce this produced a blank screen. Emitting it on the request
 * does not block anything: the enforced response policy is still the permissive one.
 */
export function buildStrictCsp(nonce: string, reportUri: string) {
  const isProd = process.env.NODE_ENV === 'production';

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isProd ? [] : ["'unsafe-eval'"]),
    'https://apis.google.com',
    'https://*.firebaseio.com',
    'https://*.googleapis.com',
  ]
    .filter(Boolean)
    .join(' ');

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.googleapis.com https://*.googleusercontent.com https://firebasestorage.googleapis.com",
    "connect-src 'self' https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.cloudfunctions.net https://api.upstash.com",
    "frame-ancestors 'none'",
    "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests',
    `report-uri ${reportUri}`,
    'report-to csp-endpoint',
  ].join('; ');
}

export function getSecurityHeaders(nonce?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-DNS-Prefetch-Control': 'off',
    // Enforced policy stays permissive (buildCsp) — nothing is blocked.
    'Content-Security-Policy': buildCsp(nonce),
  };

  // Only when a per-request nonce is available do we also emit the strict
  // Report-Only policy + its reporting endpoint. Report-Only never blocks.
  if (nonce) {
    headers['Content-Security-Policy-Report-Only'] = buildStrictCsp(nonce, CSP_REPORT_URI);
    headers['Reporting-Endpoints'] = `csp-endpoint="${CSP_REPORT_URI}"`;
  }

  return headers;
}

export function applySecurityHeaders(response: NextResponse, nonce?: string): NextResponse {
  const headers = response.headers;
  Object.entries(getSecurityHeaders(nonce)).forEach(([key, value]) => {
    headers.set(key, value);
  });
  return response;
}
