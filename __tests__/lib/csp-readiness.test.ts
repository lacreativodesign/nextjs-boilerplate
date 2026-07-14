import * as fs from 'fs';
import * as path from 'path';
import { normalizeViolation, violationId } from '@/lib/security/csp-violations';

/**
 * S15 — CSP is made correct and observable, so it can eventually be enforced.
 *
 * A strict nonce-based CSP has been running in Report-Only mode, but two things made
 * enforcement impossible to reach:
 *
 *  1. Middleware set only `x-nonce`. Next.js stamps `nonce=` onto the scripts IT generates
 *     only when it can read a nonce from a Content-Security-Policy REQUEST header. Without
 *     that, Next's own bootstrap and hydration scripts carried no nonce — so the strict
 *     policy treated the framework itself as a violation, and enforcing it produced a blank
 *     screen. Middleware now sets that request header. Nothing is blocked by this: the
 *     ENFORCED response policy is still the permissive one.
 *
 *  2. Violation reports were only console.warn'd into ephemeral platform logs, so nobody
 *     could answer "what would break if we enforced this?". They are now aggregated and
 *     viewable.
 *
 * The report sink is necessarily UNAUTHENTICATED (browsers post reports without app
 * credentials), so the write path must be safe against hostile input.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('S15: Next can nonce its own scripts', () => {
  const mw = read('middleware.ts');

  it('middleware sets the CSP on request headers, not just x-nonce', () => {
    expect(mw).toContain("requestHeaders.set('x-nonce', nonce)");
    expect(mw).toContain(
      "requestHeaders.set('Content-Security-Policy', buildStrictCsp(nonce, CSP_REPORT_URI))",
    );
  });

  it('the ENFORCED response policy is still permissive — this session blocks nothing', () => {
    const headers = read('lib/security/headers.ts');
    expect(headers).toContain("'Content-Security-Policy': buildCsp(nonce)");
    expect(headers).toContain("'unsafe-inline'");
    expect(headers).toContain('Content-Security-Policy-Report-Only');
  });
});

describe('S15: the unauthenticated report sink is safe against hostile input', () => {
  it('drops anything that is not a recognised CSP directive', () => {
    expect(
      normalizeViolation({ directive: 'not-a-directive', blockedUri: 'x', documentUri: '/' }),
    ).toBeNull();
    expect(normalizeViolation({ directive: '', blockedUri: 'x', documentUri: '/' })).toBeNull();
  });

  it('accepts a real directive and strips its value', () => {
    const v = normalizeViolation({
      directive: "script-src-elem 'self'",
      blockedUri: 'https://evil.example.com/x.js?a=1#frag',
      documentUri: 'https://app.bizosto.com/dashboard?tab=2',
    });
    expect(v).not.toBeNull();
    expect(v!.directive).toBe('script-src-elem');
  });

  it('bounds the key space: blocked URI reduces to an ORIGIN, document URI to a PATH', () => {
    // Varying the query/fragment must NOT mint new violation documents, otherwise an
    // attacker could write unbounded documents into Firestore through an open endpoint.
    const a = normalizeViolation({
      directive: 'script-src',
      blockedUri: 'https://evil.example.com/a.js?v=1',
      documentUri: 'https://app.bizosto.com/dashboard?x=1',
    })!;
    const b = normalizeViolation({
      directive: 'script-src',
      blockedUri: 'https://evil.example.com/b.js?v=99999#zzz',
      documentUri: 'https://app.bizosto.com/dashboard?x=2',
    })!;

    expect(a.blockedOrigin).toBe('https://evil.example.com');
    expect(a.documentPath).toBe('/dashboard');
    expect(violationId(a)).toBe(violationId(b));
  });

  it('keeps browser literals like inline and eval intact', () => {
    const v = normalizeViolation({
      directive: 'script-src-attr',
      blockedUri: 'inline',
      documentUri: 'https://app.bizosto.com/',
    })!;
    expect(v.blockedOrigin).toBe('inline');
  });

  it('produces a deterministic id from the violation shape, never from raw text', () => {
    const v = normalizeViolation({
      directive: 'img-src',
      blockedUri: 'https://cdn.example.com/a.png',
      documentUri: 'https://app.bizosto.com/projects',
    })!;
    expect(violationId(v)).toMatch(/^[a-f0-9]{32}$/);
  });
});

describe('S15: violations are aggregated and reviewable', () => {
  it('the report sink persists rather than only logging', () => {
    const sink = read('app/api/security/csp-report/route.ts');
    expect(sink).toContain('recordViolation(');
    expect(sink).toContain('normalizeViolation(');
  });

  it('the aggregate is exposed to super_admin only', () => {
    const route = read('app/api/super_admin/security/csp-violations/route.ts');
    expect(route).toContain('requireSuperAdmin(req)');
    expect(route).toContain("collection('csp_violations')");
  });

  it('a readiness page exists and is linked from the console', () => {
    expect(read('app/super_admin/security/page.tsx')).toContain(
      '/api/super_admin/security/csp-violations',
    );
    expect(read('app/super_admin/page.tsx')).toContain("href: '/super_admin/security'");
  });
});
