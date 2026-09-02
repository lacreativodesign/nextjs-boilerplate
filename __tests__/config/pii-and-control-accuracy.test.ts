import fs from 'fs';
import path from 'path';

/**
 * SOC2 F-12 / F-18 / F-21 regression guard.
 *
 * F-12 — the browser SDK called `Sentry.setUser({ id, email })`. That shipped
 * identifiable personal data to a processor which is covered by no DPA and named in
 * no subprocessor register, and it contradicted both the `sendDefaultPii: false`
 * posture set server-side and the `beforeSend` scrubbing that strips cookies,
 * headers and request bodies. Only the server config carried that flag; the client
 * and edge runtimes did not.
 *
 * F-18 — three comments described controls that no longer behaved that way. The
 * `PUBLIC_ROUTES` justifications are the intended evidence pack for the public attack
 * surface, so a stale entry misleads an auditor about what the control does.
 *
 * F-21 — CSP enforcement is disableable at runtime via `CSP_ENFORCE=off`, which
 * means the enforcement state is environment-dependent and cannot be proven from the
 * repository alone. What CAN be proven, and is asserted here, is that the DEFAULT is
 * enforcement-on and that no committed file ships the kill switch.
 */

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('Sentry PII posture', () => {
  it('never sends a user email from the browser SDK', () => {
    const source = read('sentry.client.config.js');
    expect(source).toContain('Sentry.setUser(');
    expect(source).not.toMatch(/email:\s*user\.email/);
  });

  it('sets sendDefaultPii false on every runtime', () => {
    for (const file of [
      'sentry.client.config.js',
      'sentry.server.config.js',
      'sentry.edge.config.js',
    ]) {
      expect(read(file)).toContain('sendDefaultPii: false');
    }
  });

  it('keeps scrubbing cookies, headers and request bodies on every runtime', () => {
    for (const file of [
      'sentry.client.config.js',
      'sentry.server.config.js',
      'sentry.edge.config.js',
    ]) {
      const source = read(file);
      expect(source).toContain('delete event.request.cookies');
      expect(source).toContain('delete event.request.headers');
      expect(source).toContain('delete event.request.data');
    }
  });
});

describe('control documentation accuracy', () => {
  it('does not describe invoices/search as a token-authenticated public lookup', () => {
    const contract = read('lib/api/route-contract.ts');
    const route = read('app/api/invoices/search/route.ts');

    // The route is a 308 redirect; there is no token and no lookup.
    expect(route).toContain('308');
    expect(contract).not.toContain('Public invoice lookup by unguessable token.');
  });

  it('does not claim the enforced CSP is permissive or Report-Only', () => {
    expect(read('middleware.ts')).not.toContain('enforced CSP stays permissive');
    expect(read('app/layout.tsx')).not.toContain('Report-Only today');
  });
});

describe('CSP enforcement default', () => {
  it('enforces unless explicitly opted out', () => {
    const source = read('lib/security/headers.ts');
    expect(source).toContain("process.env.CSP_ENFORCE !== 'off'");
  });

  it('ships no committed kill switch', () => {
    // CSP_ENFORCE=off must never be baked into config; it is an incident-response
    // lever set in the hosting dashboard, and its absence in production is the
    // auditor-facing evidence that enforcement is live.
    for (const file of ['next.config.js', 'vercel.json']) {
      const full = path.join(process.cwd(), file);
      if (!fs.existsSync(full)) continue;
      expect(fs.readFileSync(full, 'utf8')).not.toContain('CSP_ENFORCE');
    }
  });
});
