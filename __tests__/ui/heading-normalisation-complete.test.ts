import * as fs from 'fs';
import * as path from 'path';

/**
 * DS-11 — heading normalisation, complete.
 *
 * Closes the work started in DS-6. Every `h1` in `app/` and `components/` now uses one
 * of four shared classes, and none is styled from a JavaScript object.
 *
 * The three public documentation pages and the help-centre landing component sized
 * themselves `text-3xl font-semibold`. They are left-aligned, full-width pages, so
 * `.page-title` fits — `.screen-title` from DS-10 is for centred full-viewport
 * moments, which these are not.
 *
 * Two deliberate exceptions remain, both public marketing screens:
 *   - `.login-title`, defined in `app/login/page.tsx`'s own `<style jsx global>` block
 *     alongside roughly 500 lines of bespoke login chrome.
 *   - `.marketing-title`, new here, for `/pricing`. It keeps that page's intentional
 *     hero scale while replacing `text-gray-900` — a fixed value that rendered
 *     near-black on a dark surface.
 *
 * Three components are deleted rather than fixed:
 *   - `components/layouts/AdminLayout.tsx` and `components/dashboard/CustomizableDashboard.tsx`
 *     had zero importers.
 *   - `components/layouts/ERPLayout.tsx` had one: `app/admin/hr/time-tracking`, which
 *     sits under `app/admin/layout.tsx` and therefore inside AppShell. ERPLayout renders
 *     its own 240px collapsible sidebar, header and logout button, so that page showed
 *     TWO application shells at once. Its sibling `app/hr/time-tracking` renders the
 *     same dashboard correctly with a plain wrapper; this now matches it.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(process.cwd(), rel));
const headingClasses = (source: string) =>
  Array.from(source.matchAll(/<h1[^>]*className="([^"]*)"/g)).map((m) => m[1]);

const walk = (dir: string): string[] => {
  const abs = path.join(process.cwd(), dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(rel);
    return entry.name.endsWith('.tsx') ? [rel] : [];
  });
};

const ALL_TSX = () => [...walk('app'), ...walk('components')];
const CANONICAL = new Set(['page-title', 'screen-title', 'login-title', 'marketing-title']);

describe('DS-11: the documentation pages use .page-title', () => {
  it.each([
    'app/api-docs/page.tsx',
    'app/help/search/page.tsx',
    'app/help/[category]/[slug]/page.tsx',
    'components/help-center/HelpCenterPageContent.tsx',
  ])('%s leads with page-title', (rel) => {
    const classes = headingClasses(read(rel));
    expect(classes.length).toBeGreaterThan(0);
    for (const className of classes) {
      expect({ rel, className, ok: className.split(' ')[0] === 'page-title' }).toEqual({
        rel,
        className,
        ok: true,
      });
    }
  });
});

describe('DS-11: normalisation is complete', () => {
  it('every h1 uses a shared class', () => {
    const offenders: string[] = [];
    for (const rel of ALL_TSX()) {
      for (const className of headingClasses(read(rel))) {
        if (!CANONICAL.has(className.split(' ')[0])) offenders.push(`${rel} -> "${className}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no h1 anywhere is styled from a JavaScript object', () => {
    const offenders = ALL_TSX().filter((rel) => /<h1[^>]*style=\{/.test(read(rel)));
    expect(offenders).toEqual([]);
  });

  it('the two bespoke titles are exactly where we expect', () => {
    const bespoke: Record<string, string[]> = { 'login-title': [], 'marketing-title': [] };
    for (const rel of ALL_TSX()) {
      for (const className of headingClasses(read(rel))) {
        const base = className.split(' ')[0];
        if (base in bespoke) bespoke[base].push(rel);
      }
    }
    expect(bespoke).toEqual({
      'login-title': ['app/login/page.tsx'],
      'marketing-title': ['components/pricing/PricingPageClient.tsx'],
    });
  });

  it('.marketing-title reads a token rather than a fixed grey', () => {
    const css = read('app/globals.css');
    const rule = css.slice(css.indexOf('.marketing-title {'));
    expect(rule.slice(0, rule.indexOf('}'))).toContain('var(--text-primary)');
  });

  it('the pricing hero no longer hardcodes its colour', () => {
    // The rest of that page is still painted from the Tailwind grey palette
    // (bg-gray-50, text-gray-900, border-gray-300). That is a whole-page
    // tokenisation job, tracked separately — this only pins the heading.
    const heading = read('components/pricing/PricingPageClient.tsx').match(/<h1[^>]*>/)?.[0] ?? '';
    expect(heading).toBe('<h1 className="marketing-title">');
  });
});

describe('DS-11: no page renders two application shells', () => {
  it('app/admin/hr/time-tracking matches its working sibling', () => {
    const admin = read('app/admin/hr/time-tracking/page.tsx');
    expect(admin).not.toContain('ERPLayout');
    expect(admin).toContain('<div className="space-y-6">');
  });

  it('the three dead components are gone', () => {
    expect({
      erp: exists('components/layouts/ERPLayout.tsx'),
      admin: exists('components/layouts/AdminLayout.tsx'),
      dashboard: exists('components/dashboard/CustomizableDashboard.tsx'),
    }).toEqual({ erp: false, admin: false, dashboard: false });
  });

  it('nothing imports them', () => {
    const offenders = ALL_TSX().filter((rel) =>
      /ERPLayout|layouts\/AdminLayout|CustomizableDashboard/.test(read(rel)),
    );
    expect(offenders).toEqual([]);
  });

  it('AppShell is the only component that renders the app sidebar', () => {
    const shells = ALL_TSX().filter((rel) =>
      /from '@\/components\/layout\/Sidebar'/.test(read(rel)),
    );
    expect(shells).toEqual(['components/layout/AppShell.tsx']);
  });
});
