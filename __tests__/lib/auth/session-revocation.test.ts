import fs from 'fs';
import path from 'path';

/**
 * P0-1 session revocation hardening — static gate.
 *
 * Firebase session cookies stay valid until expiry unless checkRevoked is passed.
 * After revokeRefreshTokens() (password change, admin disable), a cookie verified
 * with checkRevoked=false would still authenticate for up to 14 days. These
 * assertions pin both verification points to checkRevoked=true so a future edit
 * cannot silently reopen the window.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('session revocation hardening (P0-1)', () => {
  it('lib/tenant/server.ts verifies session cookies with checkRevoked=true', () => {
    const src = read('lib/tenant/server.ts');
    expect(src).toContain('verifySessionCookie(sessionCookie, true)');
    expect(src).not.toContain('verifySessionCookie(sessionCookie, false)');
  });

  it('app/api/session-login/route.ts verifies the idToken with checkRevoked=true', () => {
    const src = read('app/api/session-login/route.ts');
    expect(src).toContain('verifyIdToken(idToken, true)');
    expect(src).not.toMatch(/verifyIdToken\(idToken\)\s*;/);
  });

  it('CI workflow does not allow lint to fail (P0-6)', () => {
    // Q1 consolidated the two pipelines into a single Quality Gates workflow (test.yml); the
    // redundant ci.yml was removed. Lint is a required, non-softened gate there.
    const src = read('.github/workflows/test.yml');
    expect(src).toContain('npm run lint');
    expect(src).not.toContain('lint || true');
  });
});
