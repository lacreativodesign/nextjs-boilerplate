import fs from 'fs';
import path from 'path';
import { ERP_ROLES, rolesAllowedForApi, type ErpRole } from '@/lib/erpAccess';
import {
  SEARCH_DOMAINS,
  SEARCH_DOMAIN_ROLES,
  canSearchDomain,
  visibleSearchDomains,
} from '@/lib/search/search-access';

/**
 * F-1 regression guard.
 *
 * The search subsystem declared `role` on SearchSession and never read it. Every
 * search scoped by tenantId alone, across nine collections, so any authenticated
 * role could read finance, staff-directory and CRM data — and, because module search
 * supports `format: 'csv'`, could bulk-export it in one request. The `client` role
 * is the tenant's own external customer, so this was a customer-facing exposure.
 *
 * These tests pin the visibility table, pin that enforcement lives in the shared
 * handlers rather than being re-implemented per route, and pin the edge layer.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const MODULE_SEARCH = 'lib/search/module-search.ts';
const GLOBAL_SEARCH = 'lib/search/global-search.ts';

const listSearchRoutes = (): string[] => {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) walk(next);
      else if (
        entry.name === 'route.ts' &&
        read(path.relative(process.cwd(), next)).includes('handleModuleSearch')
      ) {
        out.push(path.relative(process.cwd(), next));
      }
    }
  };
  walk(path.join(process.cwd(), 'app/api'));
  return out.sort();
};

const MODULE_SEARCH_ROUTES = listSearchRoutes();

describe('F-1: the client role can never search internal data', () => {
  it.each(SEARCH_DOMAINS)('client cannot search %s', (domain) => {
    expect(canSearchDomain('client', domain)).toBe(false);
  });

  it('no domain in the table grants the client role', () => {
    for (const roles of Object.values(SEARCH_DOMAIN_ROLES)) {
      expect(roles).not.toContain('client');
    }
  });

  it('the edge layer keeps client out of /api/search', () => {
    expect(rolesAllowedForApi('/api/search/global')).not.toContain('client');
    expect(rolesAllowedForApi('/api/search/advanced')).not.toContain('client');
  });
});

describe('F-1: module boundaries hold inside search', () => {
  it('non-finance roles cannot search financial records', () => {
    for (const domain of ['invoices', 'payments', 'expenses'] as const) {
      for (const role of ['production', 'sales', 'hr', 'am', 'production_manager'] as const) {
        expect(canSearchDomain(role, domain)).toBe(false);
      }
      expect(canSearchDomain('finance', domain)).toBe(true);
      expect(canSearchDomain('admin', domain)).toBe(true);
    }
  });

  it('non-admin roles cannot search the staff directory or the audit trail', () => {
    for (const domain of ['users', 'audit_logs', 'search_index'] as const) {
      for (const role of ['finance', 'hr', 'sales', 'production', 'am_manager'] as const) {
        expect(canSearchDomain(role, domain)).toBe(false);
      }
      expect(canSearchDomain('super_admin', domain)).toBe(true);
    }
  });

  it('CRM records stay with the roles that own them', () => {
    expect(canSearchDomain('sales', 'customers')).toBe(true);
    expect(canSearchDomain('am_manager', 'clients')).toBe(true);
    expect(canSearchDomain('production', 'customers')).toBe(false);
    expect(canSearchDomain('finance', 'clients')).toBe(false);
  });

  it('fails closed on unknown roles and unknown domains', () => {
    expect(canSearchDomain(null, 'projects')).toBe(false);
    expect(canSearchDomain(undefined, 'projects')).toBe(false);
    expect(canSearchDomain('owner', 'projects')).toBe(false);
    expect(canSearchDomain('admin', 'not_a_real_domain')).toBe(false);
  });

  it('every domain grants super_admin and admin, so the platform is never locked out', () => {
    for (const domain of SEARCH_DOMAINS) {
      expect(canSearchDomain('super_admin', domain)).toBe(true);
      expect(canSearchDomain('admin', domain)).toBe(true);
    }
  });

  it('visibleSearchDomains narrows a fan-out to what the role may see', () => {
    const all = [...SEARCH_DOMAINS];
    expect(visibleSearchDomains('client', all)).toEqual([]);
    expect(visibleSearchDomains('finance', all)).toEqual(
      expect.arrayContaining(['invoices', 'payments', 'expenses']),
    );
    expect(visibleSearchDomains('finance', all)).not.toContain('users');
  });

  it('every role in the table is a real ERP role', () => {
    const known = new Set<string>(ERP_ROLES);
    for (const roles of Object.values(SEARCH_DOMAIN_ROLES)) {
      for (const role of roles) expect(known.has(role)).toBe(true);
    }
  });
});

describe('F-1: enforcement lives in the shared handlers', () => {
  it('module search authorizes before it reads the request body', () => {
    const src = read(MODULE_SEARCH);
    expect(src).toContain('canSearchDomain(session.role, config.module)');
    expect(src.indexOf('canSearchDomain')).toBeLessThan(src.indexOf('await request.json()'));
  });

  it('global search filters its module fan-out by role', () => {
    const src = read(GLOBAL_SEARCH);
    expect(src).toContain('canSearchDomain(role, config.module)');
    expect(src).toContain('role: string | null | undefined;');
  });

  it('every module-search route reaches the shared handler', () => {
    expect(MODULE_SEARCH_ROUTES.length).toBeGreaterThanOrEqual(7);
    for (const rel of MODULE_SEARCH_ROUTES) {
      expect(read(rel)).toContain('handleModuleSearch');
    }
  });

  it('the global search route passes the caller role through', () => {
    expect(read('app/api/search/global/route.ts')).toContain('role: session.role,');
  });
});

describe('F-1: the /api/clients prefix collision is fixed', () => {
  it('routes /api/clients to the CRM roles, not the portal roles', () => {
    const roles = rolesAllowedForApi('/api/clients/search');
    expect(roles).toEqual(['sales', 'sales_manager', 'am', 'am_manager', 'admin', 'super_admin']);
    expect(roles).not.toContain('client');
  });

  it('still routes the singular /api/client portal to the client role', () => {
    expect(rolesAllowedForApi('/api/client/overview')).toEqual(['client', 'admin', 'super_admin']);
  });

  it('checks the plural prefix before the singular one', () => {
    // Ordering is the whole fix: '/api/client' is a prefix of '/api/clients', so
    // whichever is tested first wins. If these are ever swapped back, the CRM surface
    // silently reopens to the client role.
    const src = read('lib/erpAccess.ts');
    const plural = src.indexOf("pathname.startsWith('/api/clients')");
    const singular = src.indexOf("pathname.startsWith('/api/client')");
    expect(plural).toBeGreaterThan(-1);
    expect(singular).toBeGreaterThan(-1);
    expect(plural).toBeLessThan(singular);
  });

  it('search stays reachable for every internal role', () => {
    const roles = rolesAllowedForApi('/api/search/global') as ErpRole[];
    for (const role of ERP_ROLES) {
      if (role === 'client') continue;
      expect(roles).toContain(role);
    }
  });
});
