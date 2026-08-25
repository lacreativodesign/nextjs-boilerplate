import * as fs from 'fs';
import * as path from 'path';

/**
 * DS-9 — the last of the admin page titles.
 *
 * Closes the h1 work started in DS-6. Beyond size drift, four of these carried a
 * colour bug:
 *
 *   - `admin/launch-checklist` painted its whole page from the Tailwind slate palette
 *     (17 utilities). Those are fixed values with no dark-mode counterpart, so the
 *     page rendered near-black text on a dark surface.
 *   - `admin/settings/integrations/twilio` coloured its page subtitle with
 *     `--sidebar-text`. That token exists to colour sidebar links; it happens to
 *     resolve to `--text-muted` today, so the bug was invisible until someone
 *     restyles the sidebar.
 *   - `admin/settings/roles` used `opacity-70` in place of a colour, which dims the
 *     text against whatever is behind it rather than reading the theme.
 *   - `admin/support` styled its primary button `bg-blue-600` instead of `.btn`.
 */

const DS9_PAGES = [
  'app/admin/crm/page.tsx',
  'app/admin/finance/budgets/[id]/page.tsx',
  'app/admin/finance/budgets/create/page.tsx',
  'app/admin/import/page.tsx',
  'app/admin/launch-checklist/page.tsx',
  'app/admin/page.tsx',
  'app/admin/settings/integrations/twilio/page.tsx',
  'app/admin/settings/roles/page.tsx',
  'app/admin/settings/tax-rates/page.tsx',
  'app/admin/support/[ticketId]/page.tsx',
  'app/admin/support/page.tsx',
];

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const headingClasses = (source: string) =>
  Array.from(source.matchAll(/<h1[^>]*className="([^"]*)"/g)).map((m) => m[1]);

describe('DS-9: the admin module uses the canonical title', () => {
  it.each(DS9_PAGES)('%s renders only <h1 className="page-title">', (rel) => {
    const classes = headingClasses(read(rel));
    expect({ rel, classes }).toEqual({ rel, classes: classes.map(() => 'page-title') });
    expect(classes.length).toBeGreaterThan(0);
  });

  it('admin/crm normalised all three render branches', () => {
    // Loading, error and loaded each rendered their own copy of the heading.
    expect(headingClasses(read('app/admin/crm/page.tsx'))).toEqual([
      'page-title',
      'page-title',
      'page-title',
    ]);
  });
});

describe('DS-9: every app/ h1 is now canonical or deliberately out of shell', () => {
  const IN_SHELL_MODULES = [
    'activity',
    'admin',
    'am',
    'am_manager',
    'billing',
    'clients',
    'dashboard',
    'finance',
    'hr',
    'notifications',
    'production',
    'production_manager',
    'projects',
    'reports',
    'sales',
    'sales_manager',
    'search',
    'settings',
    'super_admin',
    'users',
  ];

  const walk = (dir: string): string[] => {
    const abs = path.join(process.cwd(), dir);
    if (!fs.existsSync(abs)) return [];
    return fs.readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(rel);
      return entry.name.endsWith('.tsx') ? [rel] : [];
    });
  };

  it('no in-shell page sizes its own h1', () => {
    const offenders: string[] = [];
    for (const moduleName of IN_SHELL_MODULES) {
      for (const rel of walk(path.join('app', moduleName))) {
        for (const className of headingClasses(read(rel))) {
          if (className !== 'page-title') offenders.push(`${rel} -> "${className}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no in-shell page styles its h1 inline', () => {
    const offenders: string[] = [];
    for (const moduleName of IN_SHELL_MODULES) {
      for (const rel of walk(path.join('app', moduleName))) {
        if (/<h1[^>]*style=\{/.test(read(rel))) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('DS-9: colour bugs found alongside the headings', () => {
  it('launch-checklist no longer paints from the slate palette', () => {
    // 17 utilities, none of which have a dark-mode counterpart.
    expect(read('app/admin/launch-checklist/page.tsx')).not.toMatch(/slate-\d/);
  });

  it('the twilio subtitle no longer borrows a sidebar token', () => {
    expect(read('app/admin/settings/integrations/twilio/page.tsx')).not.toContain('--sidebar-text');
  });

  it('the roles subtitle uses a colour, not opacity', () => {
    expect(read('app/admin/settings/roles/page.tsx')).not.toContain('text-sm opacity-70');
  });

  it('the support page uses .btn rather than a raw blue', () => {
    expect(read('app/admin/support/page.tsx')).not.toContain('bg-blue-600');
    expect(read('app/admin/support/page.tsx')).toContain('className="btn"');
  });
});
