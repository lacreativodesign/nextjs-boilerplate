import * as fs from 'fs';
import * as path from 'path';

/**
 * DS-7 — page titles across the dashboard module and the remaining in-shell singles.
 *
 * Continues DS-6. Two things beyond the size drift were fixed here:
 *
 *   - `app/dashboard/users` and `app/dashboard/settings/notifications` used
 *     `text-sm text-gray-500` for their subtitles. That is a fixed palette value with
 *     no dark-mode counterpart, so both subtitles stayed mid-grey on a dark surface.
 *   - `app/activity/layout.tsx` styled its heading with an inline
 *     `{ fontSize: 20, fontWeight: 600 }`, which no theme or token could reach. DS-14
 *     has since deleted that heading along with the layout's bespoke shell, so the file
 *     has left this list; `__tests__/ui/activity-shell.test.ts` guards it now.
 */

const DS7_PAGES = [
  'app/dashboard/compliance/page.tsx',
  'app/dashboard/crm/customers/page.tsx',
  'app/dashboard/crm/deals/page.tsx',
  'app/dashboard/inventory/products/page.tsx',
  'app/dashboard/projects/[id]/page.tsx',
  'app/dashboard/reports/[id]/page.tsx',
  'app/dashboard/settings/notifications/page.tsx',
  'app/dashboard/users/page.tsx',
  'app/notifications/page.tsx',
  'app/production/projects/page.tsx',
  'app/search/page.tsx',
];

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const headingClasses = (source: string) =>
  Array.from(source.matchAll(/<h1[^>]*className="([^"]*)"/g)).map((m) => m[1]);

describe('DS-7: dashboard and the in-shell singles use the canonical title', () => {
  it.each(DS7_PAGES)('%s renders only <h1 className="page-title">', (rel) => {
    const classes = headingClasses(read(rel));
    expect({ rel, classes }).toEqual({ rel, classes: classes.map(() => 'page-title') });
    expect(classes.length).toBeGreaterThan(0);
  });

  it('no page sizes or weights its own heading', () => {
    for (const rel of DS7_PAGES) {
      for (const className of headingClasses(read(rel))) {
        expect({ rel, className, adHoc: /text-(xl|2xl|3xl)|font-/.test(className) }).toEqual({
          rel,
          className,
          adHoc: false,
        });
      }
    }
  });

  it('no h1 in these files is styled inline', () => {
    // The original offender was app/activity/layout.tsx, with
    // style={{ fontSize: 20, fontWeight: 600 }}; DS-14 removed that heading entirely.
    for (const rel of DS7_PAGES) {
      expect({ rel, inline: /<h1[^>]*style=\{/.test(read(rel)) }).toEqual({ rel, inline: false });
    }
  });
});

describe('DS-7: subtitles are themed', () => {
  it('no DS-7 page uses a fixed grey for its subtitle', () => {
    // `text-gray-500` has no dark-mode counterpart; `.page-subtitle` reads
    // var(--text-muted), which flips with the theme.
    for (const rel of DS7_PAGES) {
      expect({ rel, fixedGrey: read(rel).includes('text-sm text-gray-500') }).toEqual({
        rel,
        fixedGrey: false,
      });
    }
  });

  it.each([
    'app/dashboard/users/page.tsx',
    'app/dashboard/settings/notifications/page.tsx',
    'app/search/page.tsx',
    'app/notifications/page.tsx',
  ])('%s pairs the title with .page-subtitle', (rel) => {
    expect(read(rel)).toContain('page-subtitle');
  });
});

describe('DS-7: margins live off the heading', () => {
  it('the Sales Pipeline title is wrapped rather than carrying mb-6 itself', () => {
    // `.page-title` declares no margin, so a page that needed one hung it on the h1.
    const source = read('app/dashboard/crm/deals/page.tsx');
    expect(source).toContain('<div className="mb-6">');
    expect(source).toContain('<h1 className="page-title">Sales Pipeline</h1>');
  });
});
