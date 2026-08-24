import * as fs from 'fs';
import * as path from 'path';
import { getBreadcrumbs } from '@/lib/navigation/sidebarConfig';

/**
 * DS-2 — navigation context and token ergonomics.
 *
 * `Breadcrumbs.tsx` was fully written, `aria-label`ed, and imported by nothing, so no
 * page on the platform showed breadcrumbs. Wiring it up as-was would have made things
 * worse: `getBreadcrumbs` returned on the first prefix match, so every route under
 * `/admin` rendered the same `Home / Overview`. This pins the corrected resolution
 * alongside the AppShell wiring, so neither can silently regress.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const labels = (pathname: string) => getBreadcrumbs(pathname).map((crumb) => crumb.label);

describe('DS-2: getBreadcrumbs resolves the full trail', () => {
  it('descends past the first prefix match', () => {
    // The regression: /admin matched, the depth-first walk returned, and
    // /admin/finance was never reached.
    expect(labels('/admin/finance/invoices')).toEqual(['Overview', 'Finance', 'Invoices']);
  });

  it.each([
    ['/admin/finance', ['Overview', 'Finance']],
    ['/admin/users/create', ['Overview', 'User Management', 'Create']],
    ['/admin/projects/change-requests', ['Overview', 'Projects', 'Change Requests']],
    ['/super_admin/payments', ['Platform', 'Payments']],
    ['/sales/deals', ['Sales', 'Deals']],
    ['/hr/employees', ['HR', 'Employees']],
    ['/finance/invoices', ['Finance', 'Invoices']],
  ])('%s resolves to %s', (pathname, expected) => {
    expect(labels(pathname)).toEqual(expected);
  });

  it('stops before an opaque id rather than title-casing it', () => {
    // `/admin/users/8xKq2LmP` should not render a crumb labelled "8xKq2LmP".
    expect(labels('/admin/users/8xKq2LmP')).toEqual(['Overview', 'User Management']);
  });

  it('returns nothing for routes outside the sidebar', () => {
    for (const pathname of ['/', '/login', '/pay/abc123', '/settings']) {
      expect({ pathname, trail: getBreadcrumbs(pathname) }).toEqual({ pathname, trail: [] });
    }
  });

  it('no longer prepends a synthetic Home crumb', () => {
    // `/` only redirects to the role's own dashboard, so Home duplicated the first
    // real crumb's destination.
    expect(getBreadcrumbs('/admin/finance')[0]).toEqual({ label: 'Overview', href: '/admin' });
  });

  it('every crumb href is a real prefix of the requested path', () => {
    for (const pathname of ['/admin/finance/invoices', '/super_admin/payments', '/sales/deals']) {
      for (const crumb of getBreadcrumbs(pathname)) {
        expect({ pathname, href: crumb.href, isPrefix: pathname.startsWith(crumb.href) }).toEqual({
          pathname,
          href: crumb.href,
          isPrefix: true,
        });
      }
    }
  });
});

describe('DS-2: the shell renders breadcrumbs', () => {
  const shell = read('components/layout/AppShell.tsx');

  it('AppShell imports and renders Breadcrumbs with the live pathname', () => {
    expect(shell).toContain("import Breadcrumbs from '@/components/layout/Breadcrumbs'");
    expect(shell).toContain('usePathname');
    expect(shell).toContain('<Breadcrumbs pathname={pathname}');
  });

  it('renders them inside the page frame, above the page', () => {
    const frame = shell.slice(shell.indexOf('className="page-frame"'));
    expect(frame.indexOf('<Breadcrumbs')).toBeLessThan(frame.indexOf('{children}'));
  });

  it('a lone crumb is suppressed', () => {
    // On a role dashboard the trail is one item, which only restates the current page.
    expect(read('components/layout/Breadcrumbs.tsx')).toContain('trail.length < 2');
  });
});

describe('DS-2: design tokens are reachable as Tailwind utilities', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const config = require(path.join(process.cwd(), 'tailwind.config.js'));
  const extend = config.theme.extend;

  it('theme.extend is no longer empty', () => {
    expect(Object.keys(extend).length).toBeGreaterThan(0);
  });

  it('maps surfaces, ink, brand and the semantic hues to CSS variables', () => {
    expect(extend.colors.surface.DEFAULT).toBe('var(--surface-card)');
    expect(extend.colors.surface.muted).toBe('var(--surface-muted)');
    expect(extend.colors.ink.DEFAULT).toBe('var(--text-primary)');
    expect(extend.colors.ink.muted).toBe('var(--text-muted)');
    expect(extend.colors.brand.DEFAULT).toBe('var(--erp-blue)');
    for (const hue of ['success', 'danger', 'warning']) {
      expect(extend.colors[hue].DEFAULT).toBe(`var(--${hue})`);
      expect(extend.colors[hue].soft).toBe(`var(--${hue}-soft)`);
    }
  });

  it('exposes the S1 motion tokens as duration utilities', () => {
    expect(extend.transitionDuration).toEqual({
      fast: 'var(--motion-fast)',
      base: 'var(--motion-base)',
      slow: 'var(--motion-slow)',
    });
  });

  it('does not redefine Tailwind shadow-sm/md/lg', () => {
    // Renaming those would silently restyle every existing consumer.
    for (const reserved of ['sm', 'md', 'lg']) {
      expect(extend.boxShadow[reserved]).toBeUndefined();
    }
  });

  it('keeps dark mode class-based', () => {
    expect(config.darkMode).toBe('class');
  });
});

describe('DS-2: numeric columns use tabular figures', () => {
  it('.table-cell-right sets tabular-nums', () => {
    // Was zero uses repo-wide; proportional digits make currency columns ragged.
    const css = read('app/globals.css');
    const rule = css.slice(css.indexOf('.table-cell-right {'));
    expect(rule.slice(0, rule.indexOf('}'))).toContain('font-variant-numeric: tabular-nums');
  });
});
