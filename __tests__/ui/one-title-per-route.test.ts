import * as fs from 'fs';
import * as path from 'path';

/**
 * DS-15 — the page owns its title, not the layout.
 *
 * Fourteen role-module layouts rendered `<h1 className="page-title">{module}</h1>` above
 * their tab bar, and 53 of their child pages rendered an `h1` of their own. So
 * `/sales/pipeline` showed "Sales & Pipeline" and "My Pipeline" stacked, both at
 * clamp(24px, 2.4vw, 34px)/900.
 *
 * That was survivable before DS-6, when page titles were `text-xl font-bold` — the size
 * gap read as hierarchy. Normalising them onto `.page-title` made the two
 * indistinguishable, so the normalisation is what forced this decision.
 *
 * The module name is already in three places: the highlighted sidebar item, the
 * breadcrumb trail (DS-2), and the active tab. Spending the largest line on the page
 * repeating it costs the one piece of information the user does not already have. So
 * the layout header goes and each page names itself — usually with the label already
 * sitting in that layout's own TABS array.
 *
 * DS-15 converted `users` and `settings` and established the pattern. DS-16 adds the six
 * modules whose pages were already titled or needed only their index page named:
 * `projects`, `clients`, `am`, `am_manager`, `production_manager`, `sales_manager`. DS-17
 * adds `client`, `finance` and `reports`. Three modules remain — `hr`, `production` and
 * `sales` — with 25 pages still needing a title written.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const walk = (dir: string): string[] => {
  const abs = path.join(process.cwd(), dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(rel);
    return entry.name.endsWith('.tsx') ? [rel] : [];
  });
};

const resolveImport = (spec: string, from: string): string | null => {
  let base: string;
  if (spec.startsWith('@/')) base = spec.slice(2);
  else if (spec.startsWith('.')) base = path.normalize(path.join(path.dirname(from), spec));
  else return null;
  for (const candidate of [`${base}.tsx`, `${base}.ts`, path.join(base, 'index.tsx')]) {
    if (fs.existsSync(path.join(process.cwd(), candidate))) return candidate;
  }
  return null;
};

/** A page that only redirects or 404s renders no UI, so it has nothing to title. */
const rendersNothing = (rel: string): boolean => {
  const source = read(rel);
  return /\bredirect\(|\bnotFound\(/.test(source);
};

/** Follows re-exports and component imports, since several pages are one-line delegates. */
const rendersHeading = (rel: string, depth = 0, seen = new Set<string>()): boolean => {
  if (seen.has(rel) || depth > 3) return false;
  seen.add(rel);
  const source = read(rel);
  if (source.includes('<h1')) return true;
  for (const [, spec] of source.matchAll(/from ['"]([^'"]+)['"]/g)) {
    const resolved = resolveImport(spec, rel);
    if (
      resolved &&
      /^(app|components)\//.test(resolved) &&
      rendersHeading(resolved, depth + 1, seen)
    ) {
      return true;
    }
  }
  return false;
};

const CONVERTED = [
  'users',
  'settings',
  'projects',
  'clients',
  'am',
  'am_manager',
  'production_manager',
  'sales_manager',
  'client',
  'finance',
  'reports',
];

describe('DS-15: the converted layouts no longer title the page', () => {
  it.each(CONVERTED)('app/%s/layout.tsx renders no h1', (module) => {
    const layout = read(`app/${module}/layout.tsx`);
    expect(layout).not.toContain('<h1');
    expect(layout).not.toContain('page-subtitle');
  });

  it.each(CONVERTED)('app/%s/layout.tsx keeps its tab bar', (module) => {
    // The active tab is one of the three places the module name still appears,
    // alongside the sidebar and the breadcrumb.
    expect(read(`app/${module}/layout.tsx`)).toContain('tabs-bar');
  });
});

describe('DS-15: every page in a converted module names itself', () => {
  it.each(CONVERTED)('no page under app/%s is left without a heading', (module) => {
    const orphans = walk(`app/${module}`)
      .filter((rel) => rel.endsWith('page.tsx'))
      .filter((rel) => !rendersNothing(rel))
      .filter((rel) => !rendersHeading(rel));
    expect(orphans).toEqual([]);
  });

  it.each([
    ['app/users/roles/page.tsx', 'Roles'],
    ['app/settings/page.tsx', 'Profile'],
    ['app/settings/payments/page.tsx', 'Payments'],
    ['app/settings/security/page.tsx', 'Security'],
    ['app/settings/system/page.tsx', 'System'],
    ['app/am/page.tsx', 'Dashboard'],
    ['app/am_manager/page.tsx', 'Dashboard'],
    ['app/production_manager/page.tsx', 'Dashboard'],
    ['app/sales_manager/page.tsx', 'Dashboard'],
    ['app/client/page.tsx', 'Dashboard'],
    ['app/finance/tax/page.tsx', 'Tax'],
    ['app/reports/page.tsx', 'Overview'],
    ['app/reports/ai/page.tsx', 'AI Reports'],
  ])('%s titles itself "%s", matching its tab label', (rel, title) => {
    expect(read(rel)).toContain(`<h1 className="page-title">${title}</h1>`);
  });

  it('the finance overview reads for both routes that render it', () => {
    // app/reports/finance/page.tsx is a one-line re-export of app/finance/page.tsx, and
    // the two tabs label it "Overview" and "Finance" respectively. One title has to work
    // under both breadcrumbs, so it is neither tab label verbatim.
    expect(read('app/reports/finance/page.tsx').trim()).toBe(
      "export { default } from '@/app/finance/page';",
    );
    expect(read('app/finance/page.tsx')).toContain(
      '<h1 className="page-title">Finance Overview</h1>',
    );
  });

  it('no page uses .page-title on anything other than an h1', () => {
    // app/finance/tax rendered <h2 className="page-title">, which is why the audit
    // sweep for missing headings did not flag it.
    const offenders = walk('app')
      .filter((rel) => /<h[2-6][^>]*className="page-title/.test(read(rel)))
      .sort();
    expect(offenders).toEqual([]);
  });

  it('the four role dashboards no longer paint errors from the raw palette', () => {
    // All four shared `text-red-400`, a fixed value with no dark-mode counterpart.
    for (const rel of [
      'app/am/page.tsx',
      'app/am_manager/page.tsx',
      'app/production_manager/page.tsx',
      'app/sales_manager/page.tsx',
    ]) {
      expect({ rel, rawRed: read(rel).includes('text-red-400') }).toEqual({ rel, rawRed: false });
    }
  });

  it('no converted route stacks two titles', () => {
    for (const module of CONVERTED) {
      const layoutHasTitle = read(`app/${module}/layout.tsx`).includes('<h1');
      expect({ module, layoutHasTitle }).toEqual({ module, layoutHasTitle: false });
    }
  });
});

describe('DS-15: the remaining modules are a known, shrinking list', () => {
  it('three layouts still title their pages', () => {
    const stillTitling = walk('app')
      .filter((rel) => rel.endsWith('layout.tsx') && read(rel).includes('<h1'))
      .sort();
    expect(stillTitling).toEqual([
      'app/hr/layout.tsx',
      'app/production/layout.tsx',
      'app/sales/layout.tsx',
    ]);
  });
});
