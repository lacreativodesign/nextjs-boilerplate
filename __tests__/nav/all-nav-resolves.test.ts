import * as fs from 'fs';
import * as path from 'path';

/**
 * S26 — every navigation destination on the platform resolves to a real page.
 *
 * S25 fixed three super_admin pages that existed but were unreachable from their tab bar, and
 * added a guard for that one area. This extends the same protection to the WHOLE platform: the
 * central sidebar config (lib/navigation/sidebarConfig.ts) drives navigation for all eleven
 * roles, and a link there that points at a route with no page.tsx is a dead end — the customer
 * clicks a menu item and gets a 404. Equally, a role whose dashboard root does not exist can
 * never land anywhere after login.
 *
 * This test fails the build if either happens again. It is deliberately filesystem-based (no
 * server, no network) so it runs in the normal jest suite.
 */
const APP_DIR = path.join(process.cwd(), 'app');

/** Every route that has a page.tsx, indexed both with and without (route group) segments. */
function buildRouteSet(): Set<string> {
  const routes = new Set<string>();

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === 'page.tsx') {
        const rel = '/' + path.relative(APP_DIR, dir).replace(/\\/g, '/');
        const normalized = rel === '/.' ? '/' : rel;
        routes.add(normalized);
        // A route group like (modules) is invisible in the URL, so index the stripped form too.
        routes.add(normalized.replace(/\/\([^)]+\)/g, '') || '/');
      }
    }
  }

  walk(APP_DIR);
  return routes;
}

/** True if `href` maps to a real page, allowing for dynamic [segments]. */
function resolves(href: string, routes: Set<string>): boolean {
  const clean = href.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  if (routes.has(clean)) return true;

  // Match dynamic segments: /sales/leads/[id] should satisfy /sales/leads/123.
  for (const route of routes) {
    if (!route.includes('[')) continue;
    const rx = '^' + route.replace(/\[[^\]]+\]/g, '[^/]+') + '$';
    if (new RegExp(rx).test(clean)) return true;
  }
  return false;
}

function sidebarHrefs(): string[] {
  const src = fs.readFileSync(path.join(process.cwd(), 'lib/navigation/sidebarConfig.ts'), 'utf8');
  const hrefs: string[] = [];
  const re = /href: '([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const href = m[1];
    // Skip external links and templated/dynamic hrefs built at runtime.
    if (href.startsWith('/') && !href.includes('${')) hrefs.push(href);
  }
  return hrefs;
}

const ROLE_DASHBOARDS: Record<string, string> = {
  super_admin: '/super_admin',
  admin: '/dashboard',
  sales_manager: '/sales_manager',
  sales: '/sales',
  am_manager: '/am_manager',
  am: '/am',
  production_manager: '/production_manager',
  production: '/production',
  finance: '/finance',
  hr: '/hr',
  client: '/client',
};

describe('S26: every navigation destination resolves', () => {
  const routes = buildRouteSet();

  it('every sidebar link points at a page that exists', () => {
    const dead = Array.from(new Set(sidebarHrefs())).filter((href) => !resolves(href, routes));
    expect(dead).toEqual([]);
  });

  it('every role has a dashboard landing page to arrive at after login', () => {
    const missing = Object.entries(ROLE_DASHBOARDS)
      .filter(([, route]) => !resolves(route, routes))
      .map(([role, route]) => `${role} -> ${route}`);
    expect(missing).toEqual([]);
  });
});
