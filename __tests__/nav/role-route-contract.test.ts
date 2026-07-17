import * as fs from 'fs';
import * as path from 'path';
import { sidebarNavigation } from '@/lib/navigation/sidebarConfig';
import { ROLE_DASHBOARD_ROUTE, ERP_ROLES, type ErpRole } from '@/lib/erpAccess';

/**
 * F2 — role/navigation authorization contract.
 *
 * The existing all-nav-resolves test proves every sidebar link points at a page that EXISTS.
 * It does NOT prove that the role which SEES the link is actually ALLOWED into that page. That
 * gap shipped two real defects (prior audit NAV-01 / NAV-02):
 *
 *   - The sales_manager sidebar linked Sales Overview/Leads/Deals/Pipeline/Targets into
 *     /sales/*. Middleware derives the owning role of a path from its dashboard prefix
 *     (roleFromPath): /sales/* resolves to role `sales`. A signed-in sales_manager therefore
 *     hit pageRole('sales') !== sessionRole('sales_manager') and was redirected to
 *     /unauthorized. Five of the manager's own menu items were dead.
 *
 *   - The sales sidebar linked Clients to /clients, whose layout RequireAuth allow-list does
 *     not include `sales`. The rep saw a menu item that bounced them.
 *
 * This test reconstructs the two real gates a click passes through and fails the build if any
 * sidebar item would send a role to a destination that rejects it:
 *
 *   Gate 1 (middleware, server): if the destination lives under another role's dashboard
 *           prefix, the request is rejected. A role may only enter a role-prefixed area that
 *           is its own (admin/super_admin are allowed everywhere by middleware).
 *   Gate 2 (RequireAuth, client): if the destination's nearest layout.tsx carries a
 *           RequireAuth allowed={[...]} list, the viewing role must be in it.
 *
 * It is filesystem + config based (no server, no network) so it runs in the normal jest suite.
 */

const APP_DIR = path.join(process.cwd(), 'app');

/** Roles middleware treats as universal — never rejected by roleFromPath mismatch. */
const GLOBAL_ROLES = new Set<ErpRole>(['admin', 'super_admin']);

/** The dashboard-prefix owner of a path, mirroring lib/erpAccess.roleFromPath. */
function ownerRoleOfPath(pathname: string): ErpRole | null {
  const entries = Object.entries(ROLE_DASHBOARD_ROUTE) as Array<[ErpRole, string]>;
  const match = entries.find(([, route]) => pathname === route || pathname.startsWith(`${route}/`));
  return match?.[0] ?? null;
}

/** Strip route groups like /(modules) and normalize trailing slashes. */
function normalize(href: string): string {
  const clean = href.split('?')[0].split('#')[0].replace(/\/+$/, '');
  return clean === '' ? '/' : clean;
}

/**
 * Walk up from a route to the nearest layout.tsx containing a RequireAuth allow-list and
 * return the allowed roles, or null if no such gate is found on the chain.
 */
function requireAuthRolesFor(href: string): string[] | null {
  let dir = path.join(APP_DIR, normalize(href).replace(/^\//, ''));
  while (dir.startsWith(APP_DIR)) {
    const layout = path.join(dir, 'layout.tsx');
    if (fs.existsSync(layout)) {
      const src = fs.readFileSync(layout, 'utf8');
      const m = src.match(/allowed=\{\[([\s\S]*?)\]\}/);
      if (m) {
        const roles = Array.from(m[1].matchAll(/'([^']+)'/g)).map((r) => r[1]);
        if (roles.length) return roles;
      }
    }
    if (dir === APP_DIR) break;
    dir = path.dirname(dir);
  }
  return null;
}

/** Sidebar items as (role, href) pairs, skipping templated/dynamic hrefs. */
function roleHrefPairs(): Array<{ role: string; href: string; id: string }> {
  const pairs: Array<{ role: string; href: string; id: string }> = [];
  const visit = (items: typeof sidebarNavigation) => {
    for (const item of items) {
      if (item.href.startsWith('/') && !item.href.includes('${')) {
        for (const role of item.roles) pairs.push({ role, href: item.href, id: item.id });
      }
      if (item.children) visit(item.children);
    }
  };
  visit(sidebarNavigation);
  return pairs;
}

describe('F2: sidebar links never send a role to a destination that rejects it', () => {
  const pairs = roleHrefPairs();

  it('every navigable role is a known ERP role', () => {
    const known = new Set<string>(ERP_ROLES);
    const unknown = Array.from(new Set(pairs.map((p) => p.role))).filter((r) => !known.has(r));
    expect(unknown).toEqual([]);
  });

  it('Gate 1 (middleware): no link points into another role’s dashboard prefix', () => {
    const violations = pairs
      .filter((p) => !GLOBAL_ROLES.has(p.role as ErpRole))
      .filter((p) => {
        const owner = ownerRoleOfPath(p.href);
        // owner === null means the path is not role-prefixed (e.g. /reports, /billing):
        // middleware lets it through and RequireAuth (Gate 2) governs it.
        return owner !== null && owner !== p.role;
      })
      .map((p) => `${p.role} -> ${p.href} (owned by ${ownerRoleOfPath(p.href)}) [${p.id}]`);
    expect(violations).toEqual([]);
  });

  it('Gate 2 (RequireAuth): every link’s destination layout allows the viewing role', () => {
    const violations = pairs
      .filter((p) => !GLOBAL_ROLES.has(p.role as ErpRole))
      .filter((p) => {
        const allowed = requireAuthRolesFor(p.href);
        if (allowed === null) return false; // no client gate on this path
        return !allowed.includes(p.role);
      })
      .map(
        (p) =>
          `${p.role} -> ${p.href} allows [${requireAuthRolesFor(p.href)?.join(', ')}] [${p.id}]`,
      );
    expect(violations).toEqual([]);
  });

  it('specifically: sales_manager stays within /sales_manager (NAV-01)', () => {
    const strays = pairs
      .filter((p) => p.role === 'sales_manager')
      .filter((p) => {
        const owner = ownerRoleOfPath(p.href);
        return owner !== null && owner !== 'sales_manager';
      })
      .map((p) => `${p.href} [${p.id}]`);
    expect(strays).toEqual([]);
  });

  it('specifically: the sales Clients link resolves to a sales-allowed page (NAV-02)', () => {
    const clientsLinks = pairs.filter((p) => p.role === 'sales' && p.id === 'sales-clients');
    expect(clientsLinks.length).toBe(1);
    const href = clientsLinks[0].href;
    const owner = ownerRoleOfPath(href);
    expect(owner === null || owner === 'sales').toBe(true);
    const allowed = requireAuthRolesFor(href);
    expect(allowed === null || allowed.includes('sales')).toBe(true);
  });
});
