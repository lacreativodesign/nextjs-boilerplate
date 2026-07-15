/**
 * S27 — the strict, nonce-based CSP is enforced, safely.
 *
 * The strict policy ran in Report-Only across every role and the readiness console recorded
 * no violations, so nothing on the platform (including Firebase's own scripts) would be
 * blocked. It is now the enforced Content-Security-Policy. This is the last major XSS
 * hardening step: an injected inline script with no valid per-request nonce can no longer
 * execute.
 *
 * These tests pin the safety properties so a future change cannot quietly break them:
 *   - Enforced ONLY when a nonce is present (a strict policy on a nonce-less response would
 *     block that response's own scripts).
 *   - Nonce-less responses keep the permissive policy, so middleware error responses etc. are
 *     never bricked.
 *   - Reversible via CSP_ENFORCE=off without a code change.
 *   - Report-Only is still emitted, so violation reporting keeps working while enforced.
 */
describe('S27: CSP enforcement', () => {
  const ORIGINAL = process.env.CSP_ENFORCE;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.CSP_ENFORCE;
    else process.env.CSP_ENFORCE = ORIGINAL;
    jest.resetModules();
  });

  function loadHeaders() {
    let mod!: typeof import('@/lib/security/headers');
    jest.isolateModules(() => {
      mod = require('@/lib/security/headers');
    });
    return mod;
  }

  it('enforces the strict nonce-based policy when a nonce is present', () => {
    delete process.env.CSP_ENFORCE;
    const { getSecurityHeaders } = loadHeaders();
    const h = getSecurityHeaders('test-nonce-123');

    const enforced = h['Content-Security-Policy'];
    expect(enforced).toContain("'nonce-test-nonce-123'");
    expect(enforced).toContain("'strict-dynamic'");
    // The whole point: inline scripts are no longer trusted by keyword.
    expect(enforced).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it('still emits Report-Only while enforced, so reporting keeps working', () => {
    delete process.env.CSP_ENFORCE;
    const { getSecurityHeaders } = loadHeaders();
    const h = getSecurityHeaders('test-nonce-123');

    expect(h['Content-Security-Policy-Report-Only']).toContain("'nonce-test-nonce-123'");
    expect(h['Reporting-Endpoints']).toContain('csp-endpoint');
  });

  it('does NOT enforce the strict policy on a nonce-less response', () => {
    delete process.env.CSP_ENFORCE;
    const { getSecurityHeaders } = loadHeaders();
    const h = getSecurityHeaders();

    // A nonce-less response (e.g. some middleware JSON errors) keeps the permissive policy so
    // it cannot be bricked by a strict policy with no matching nonce.
    expect(h['Content-Security-Policy']).toContain("'unsafe-inline'");
    expect(h['Content-Security-Policy']).not.toContain('strict-dynamic');
  });

  it('is reversible: CSP_ENFORCE=off falls back to the permissive enforced policy', () => {
    process.env.CSP_ENFORCE = 'off';
    const { getSecurityHeaders } = loadHeaders();
    const h = getSecurityHeaders('test-nonce-123');

    // Enforced policy is permissive again...
    expect(h['Content-Security-Policy']).toContain("'unsafe-inline'");
    expect(h['Content-Security-Policy']).not.toContain('strict-dynamic');
    // ...but the strict policy is still observed in Report-Only.
    expect(h['Content-Security-Policy-Report-Only']).toContain("'strict-dynamic'");
  });

  it('keeps the other hardening headers intact', () => {
    delete process.env.CSP_ENFORCE;
    const { getSecurityHeaders } = loadHeaders();
    const h = getSecurityHeaders('n');
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['Strict-Transport-Security']).toContain('max-age=31536000');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
  });
});
