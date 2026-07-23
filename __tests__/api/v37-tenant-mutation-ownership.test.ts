import fs from 'fs';
import path from 'path';

/**
 * P0-1 — direct-document mutation ownership guard.
 *
 * Companion to __tests__/api/tenant-scope-source-guard.test.ts. That guard proves a
 * route never SOURCES tenantId from the request. This guard proves the opposite half
 * of the invariant: a route that loads a document by a REQUEST-SUPPLIED id and then
 * mutates it must also PROVE the document belongs to the caller's tenant.
 *
 * Without this, an authenticated admin of tenant A could mutate tenant B's records by
 * supplying a foreign document id (confirmed in v37 as SEC-001, SEC-002, SEC-008,
 * SEC-009).
 *
 * A route clears the guard by containing one of the recognised ownership assertions
 * (isTenantOwned(...), an explicit tenantId !== tenantId comparison, docTenantId(),
 * FileManager.getFileById(), a .where('tenantId', ...) scoped query, or
 * queryWithTenant()), or by holding a reviewed entry in OWNERSHIP_EXEMPT_ROUTES with
 * a written justification.
 */

const API_ROOT = path.join(process.cwd(), 'app', 'api');

/**
 * Reviewed exemptions. Every entry states WHY the mutation is already bound to a
 * principal other than a raw tenant comparison. New entries require review.
 */
const OWNERSHIP_EXEMPT_ROUTES: Record<string, string> = {
  'admin/change-requests/create':
    'Compares projectTenant vs myTenant via local variables before any write.',
  'admin/domains/verify':
    'Writes tenant_domain_mappings keyed by domain. Tracked as V37-P2-DOMAIN-001: the ' +
    'collection currently has no read path anywhere in the repo, so there is no ' +
    'exploitable impact; an ownership gate lands with the custom-domain read path.',
  'admin/finance/tax-rates':
    'Mutates tenants/{sessionTenantId}/taxRates/{id}: tenant is in the document path.',
  'am/change-requests/create':
    'Bound by isOwnedByAm(project, me.uid): the project must be owned by the caller uid.',
  'auth/send-otp': 'Pre-authentication. Documents are keyed by email; no tenant exists yet.',
  'auth/verify-otp': 'Pre-authentication. Documents are keyed by email; no tenant exists yet.',
  'billing/terminal/oauth-callback':
    'Keyed by a server-generated single-use OAuth state nonce, not a tenant-owned record.',
  'client/change-requests/update-status':
    'Compares docTenant vs the client session tenant via local variables before any write.',
  'client/projects/approve':
    'Bound by project.clientId === auth.clientId, a stricter check than tenant equality.',
  'crm/leads/convert':
    'Bound by lead.createdBy === auth.user.uid, a stricter check than tenant equality.',
  'notifications/create':
    'Loads the recipient user and requires recipientTenantId === me.tenantId before writing.',
  'public/invoice/[invoiceId]/confirm':
    'Public payment surface authorised by the per-invoice payment token, not by session tenant.',
  'public/invoice/[invoiceId]/pay':
    'Public payment surface authorised by the per-invoice payment token, not by session tenant.',
  signup: 'Pre-authentication provisioning. Documents are keyed by email; no tenant exists yet.',
  'stripe/connect/callback':
    'Keyed by a server-generated single-use OAuth state nonce, not a tenant-owned record.',
  'support/tickets/[id]/messages':
    'Mutates tenants/{sessionTenantId}/support_tickets/{id}: tenant is in the document path.',
};

/** Document-id expressions that are derived from the request rather than the session. */
const REQUEST_SOURCED =
  /\b(body|payload|parsed|validated|input)\b\s*[?.]|searchParams\.get|params\.\w/;

/** Recognised tenant-ownership assertions. */
const OWNERSHIP_ASSERTIONS: RegExp[] = [
  /isTenantOwned\s*\(/,
  /tenantId[^;\n]{0,40}!==[^;\n]{0,60}tenantId/,
  /tenantId[^;\n]{0,40}!=[^=][^;\n]{0,60}tenantId/,
  /docTenantId\s*\(/,
  /getFileById\s*\(/,
  /\.where\(\s*['"`]tenantId['"`]/,
  /queryWithTenant\s*\(/,
];

const MUTATION = /\.(set|update|delete)\s*\(/;
const COLLECTION_DOC =
  /\.collection\(\s*['"`]([A-Za-z0-9_]+)['"`]\s*\)\s*\n?\s*\.doc\(\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\)/g;

/** Doc-id variables that are already session-derived by construction. */
const SESSION_SOURCED_PREFIX = /^(me|auth|session|decoded|user|userRecord|authUser)\./;

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(full));
    else if (entry.name === 'route.ts') out.push(full);
  }
  return out;
}

type Route = { rel: string; asserted: boolean };

function collectRoutes(): Route[] {
  const routes: Route[] = [];

  for (const file of walk(API_ROOT)) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path
      .relative(API_ROOT, file)
      .replace(/\\/g, '/')
      .replace(/\/route\.ts$/, '');

    // super_admin/* is cross-tenant by design and gated by requireSuperAdmin.
    if (rel.startsWith('super_admin/')) continue;
    if (!MUTATION.test(src)) continue;

    let match: RegExpExecArray | null;
    let requestSourced = false;
    COLLECTION_DOC.lastIndex = 0;

    while ((match = COLLECTION_DOC.exec(src)) !== null) {
      const idExpression = match[2];
      if (/tenantId$/.test(idExpression)) continue;
      if (SESSION_SOURCED_PREFIX.test(idExpression)) continue;

      const assignment = new RegExp(
        `(?:const|let|var)\\s+${idExpression.replace(/[.$]/g, '\\$&')}\\s*=([^;]*);`,
        's',
      );
      const found = assignment.exec(src);
      const rhs = found ? found[1] : '';

      if (REQUEST_SOURCED.test(rhs) || /^params\./.test(idExpression)) {
        requestSourced = true;
        break;
      }
    }

    if (!requestSourced) continue;
    routes.push({ rel, asserted: OWNERSHIP_ASSERTIONS.some((rx) => rx.test(src)) });
  }

  return routes;
}

describe('P0-1: tenant-scoped direct-document mutations assert ownership', () => {
  const routes = collectRoutes();

  it('the detector is live and covers a meaningful share of the route surface', () => {
    expect(routes.length).toBeGreaterThan(100);
  });

  it('every request-id mutation route asserts tenant ownership or is a reviewed exemption', () => {
    const offenders = routes
      .filter((route) => !route.asserted)
      .map((route) => route.rel)
      .filter((rel) => !OWNERSHIP_EXEMPT_ROUTES[rel])
      .sort();

    if (offenders.length > 0) {
      throw new Error(
        'Route(s) mutate a document loaded by a request-supplied id without proving tenant\n' +
          'ownership. Add isTenantOwned({ data, callerTenantId, callerRole }) from\n' +
          'lib/tenant/ownership.ts before the first side effect and return 404 on mismatch,\n' +
          'or add a reviewed justification to OWNERSHIP_EXEMPT_ROUTES in this file:\n' +
          offenders.map((rel) => '  - ' + rel).join('\n'),
      );
    }

    expect(offenders).toEqual([]);
  });

  it('the guard actually detects unasserted routes (self-check)', () => {
    const unasserted = routes.filter((route) => !route.asserted);
    expect(unasserted.length).toBeGreaterThan(0);
  });

  it('every exemption has a non-empty justification', () => {
    const missing = Object.entries(OWNERSHIP_EXEMPT_ROUTES)
      .filter(([, why]) => !why || !why.trim())
      .map(([route]) => route);
    expect(missing).toEqual([]);
  });

  it('no stale exemptions for routes that no longer exist or no longer need one', () => {
    const flagged = new Set(routes.filter((route) => !route.asserted).map((route) => route.rel));
    const stale = Object.keys(OWNERSHIP_EXEMPT_ROUTES).filter((rel) => !flagged.has(rel));
    expect(stale).toEqual([]);
  });

  it('no super_admin route is added to the exemption list (exempt by design)', () => {
    const misplaced = Object.keys(OWNERSHIP_EXEMPT_ROUTES).filter((rel) =>
      rel.startsWith('super_admin/'),
    );
    expect(misplaced).toEqual([]);
  });
});

describe('P0-1: the confirmed defects are closed at the exact call site', () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

  it('SEC-001 admin/clients/delete gates the request-supplied client id', () => {
    const src = read('app/api/admin/clients/delete/route.ts');
    expect(src).toContain(
      'isTenantOwned({ data, callerTenantId: me.tenantId, callerRole: me.role })',
    );
    expect(src.indexOf('isTenantOwned')).toBeLessThan(src.indexOf('await ref.set('));
  });

  it('SEC-002 move-stage gates before the stage write and every side effect', () => {
    const src = read('app/api/admin/production/project/move-stage/route.ts');
    expect(src).toContain('isTenantOwned(');
    expect(src.indexOf('isTenantOwned(')).toBeLessThan(src.indexOf('await emitAutomationEvent({'));
    expect(src.indexOf('isTenantOwned(')).toBeLessThan(src.indexOf('await ref.set('));
  });

  it('SEC-003 storeVersion rejects a foreign fileId and a foreign folderId', () => {
    const src = read('lib/files/file-manager.ts');
    expect(src).toMatch(/if \(params\.fileId\) \{[\s\S]{0,400}isTenantOwned\(/);
    expect(src).toMatch(/if \(params\.folderId\) \{[\s\S]{0,400}isTenantOwned\(/);
    expect(src.indexOf('isTenantOwned(')).toBeLessThan(src.indexOf('const fileRoot ='));
  });

  it('SEC-004 upload ids are opaque and chunk indices are bounded', () => {
    const src = read('app/api/files/upload/route.ts');
    expect(src).toContain('MAX_TOTAL_CHUNKS');
    expect(src).toMatch(/regex\(\/\^\[A-Za-z0-9_-\]\+\$\//);
    expect(src).toContain('value.chunkIndex < value.totalChunks');
  });

  it('SEC-008 sales_manager lead conversion cannot read or mutate a foreign lead', () => {
    const src = read('app/api/sales_manager/leads/convert/route.ts');
    expect(src).toContain('isTenantOwned(');
    expect(src.indexOf('isTenantOwned(')).toBeLessThan(src.indexOf('tx.set(dealRef'));
  });

  it('SEC-009 change-request status transitions are tenant-gated', () => {
    const src = read('app/api/admin/change-requests/update-status/route.ts');
    expect(src).toContain('isTenantOwned(');
    expect(src.indexOf('isTenantOwned(')).toBeLessThan(src.indexOf('!canTransition(fromStatus'));
  });
});

describe('P0-1: lib/tenant/ownership.ts fails closed', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'lib/tenant/ownership.ts'), 'utf8');

  it('never matches when the caller tenant is empty', () => {
    expect(src).toContain('if (!caller) return false;');
  });

  it('treats a missing document tenantId as the default tenant, matching docTenantId()', () => {
    expect(src).toContain('return value || DEFAULT_TENANT_ID;');
  });

  it('makes the super_admin bypass explicit and opt-in', () => {
    expect(src).toContain('allowSuperAdmin = true');
    expect(src).toContain('if (allowSuperAdmin && isSuperAdminRole(callerRole)) return true;');
  });
});
