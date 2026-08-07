import fs from 'fs';
import path from 'path';
import { AUTHENTICATED_ROUTES, classifyRouteSource } from '@/lib/api/route-contract';

/**
 * S-1 regression guard.
 *
 * /api/auth/create-set-password-token takes the target `uid` from the request body.
 * Before this guard existed it fetched users/{uid} globally with no tenant filter, so
 * an admin of tenant A could mint a live password-setup credential for any user in any
 * other tenant — including the platform super_admin — and, when the email send failed,
 * receive that credential directly in the HTTP response.
 *
 * These tests pin both halves of the fix: the tenant authorization, and the rule that a
 * set-password link is delivered by email only and never leaves the server in a response
 * body or a log line.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const ROUTE_REL = 'auth/create-set-password-token';
const ROUTE = 'app/api/auth/create-set-password-token/route.ts';
const PASSWORD_SETUP = 'lib/passwordSetup.ts';

/** Every server path that mints a set-password token and returns something to a caller. */
const LINK_RESPONSE_SURFACES = [
  ROUTE,
  'app/api/admin/users/create/route.ts',
  'app/api/admin/clients/invite/route.ts',
  'lib/clientPortal.ts',
];

describe('S-1: create-set-password-token is tenant scoped', () => {
  const src = read(ROUTE);

  it('authorizes the target user against the caller tenant', () => {
    expect(src).toContain('const callerTenantId = String(current.tenantId || ');
    expect(src).toContain('const targetTenantId = String(userData.tenantId || ');
    expect(src).toContain('callerTenantId !== targetTenantId');
  });

  it('exempts only super_admin from the tenant check', () => {
    expect(src).toContain('if (!isSuperAdmin(current.role)) {');
  });

  it('fails closed when either side has no tenant context', () => {
    expect(src).toContain('!callerTenantId || !targetTenantId');
  });

  it('returns 404 on a cross-tenant target so uids cannot be probed', () => {
    const guard = src.slice(src.indexOf('if (!isSuperAdmin(current.role)) {'));
    const decision = guard.slice(0, guard.indexOf('const email'));
    expect(decision).toContain('status: 404');
    expect(decision).not.toContain('status: 403');
  });

  it('separates unauthenticated (401) from non-admin (403)', () => {
    expect(src).toContain("error: 'Unauthorized' }, { status: 401 }");
    expect(src).toContain("error: 'Forbidden' }, { status: 403 }");
  });

  it('classifies as tenant_scoped, not authenticated', () => {
    expect(classifyRouteSource(ROUTE_REL, src)).toBe('tenant_scoped');
  });

  it('is no longer registered as a non-tenant-scoped exception', () => {
    expect(AUTHENTICATED_ROUTES[ROUTE_REL]).toBeUndefined();
  });
});

describe('S-1: the set-password link never leaves the server except by email', () => {
  it.each(LINK_RESPONSE_SURFACES)('%s does not return the link to a caller', (rel) => {
    expect(read(rel)).not.toContain('setPasswordLink');
  });

  it('the route reports a send failure instead of handing back the link', () => {
    const src = read(ROUTE);
    expect(src).toContain('if (!emailResult.sent) {');
    expect(src).toContain('status: 502');
    expect(src).not.toContain('tokenData.link,');
  });

  it('the send helper never logs the raw link', () => {
    const src = read(PASSWORD_SETUP);
    const guard = src.slice(src.indexOf('if (!apiKey) {'));
    const branch = guard.slice(0, guard.indexOf('const resend'));
    // The `link` identifier must never be passed to a console call in this branch.
    expect(branch).not.toMatch(/console\.[a-z]+\([^)]*\blink\b/);
    expect(branch).toContain('Resend is not configured');
  });

  it('the send helper does not return the link to its callers', () => {
    expect(read(PASSWORD_SETUP)).toContain(
      "return { sent: false, error: 'RESEND_API_KEY missing' }",
    );
  });
});
