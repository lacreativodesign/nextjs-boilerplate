import * as fs from 'fs';
import * as path from 'path';

/**
 * S25 — every super_admin page is reachable from the tab bar.
 *
 * Three real, working pages (security, maintenance, activity) existed on disk but were absent
 * from the super_admin tab navigation, so the only way to reach them was to type the URL by
 * hand. A super_admin could not find the CSP readiness console, the data-repair tool, or the
 * activity log through the UI at all.
 *
 * This test walks app/super_admin for every page and asserts each one is either linked in the
 * tab bar or is a deliberately-nested detail route (dynamic segment, or a sub-view of a page
 * that IS linked). It fails the build the next time a page is added without a tab.
 */
const layout = fs.readFileSync(path.join(process.cwd(), 'app/super_admin/layout.tsx'), 'utf8');

function tabHrefs(): Set<string> {
  const hrefs = new Set<string>();
  const re = /href: '(\/super_admin[^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(layout)) !== null) hrefs.add(m[1]);
  return hrefs;
}

function superAdminRoutes(): string[] {
  const routes: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'page.tsx') {
        routes.push(
          '/' +
            path
              .relative(process.cwd(), path.dirname(full))
              .replace(/\\/g, '/')
              .replace(/^app\//, ''),
        );
      }
    }
  }
  walk(path.join(process.cwd(), 'app/super_admin'));
  return routes;
}

describe('S25: super_admin navigation is complete', () => {
  const tabs = tabHrefs();

  it('links the three pages that were previously hidden', () => {
    expect(tabs.has('/super_admin/security')).toBe(true);
    expect(tabs.has('/super_admin/maintenance')).toBe(true);
    expect(tabs.has('/super_admin/activity')).toBe(true);
  });

  it('every top-level super_admin page is in the tab bar', () => {
    const orphans = superAdminRoutes().filter((route) => {
      if (tabs.has(route)) return false;
      if (route.includes('[')) return false;
      const parent = route.split('/').slice(0, -1).join('/');
      if (tabs.has(parent)) return false;
      if (route === '/super_admin') return false;
      return true;
    });

    expect(orphans).toEqual([]);
  });
});
