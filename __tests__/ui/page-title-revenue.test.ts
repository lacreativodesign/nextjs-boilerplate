import * as fs from 'fs';
import * as path from 'path';

/**
 * DS-6 — page titles in the revenue-facing modules.
 *
 * 98 of 159 `h1` elements already used `.page-title`; the rest carried one of sixteen
 * ad-hoc class strings. The sales module was the worst of it: `text-xl font-bold` is
 * 20px/700, while `.page-title` is `clamp(24px, 2.4vw, 34px)`/900. A sales rep and an
 * admin were looking at visibly different products.
 *
 * This session covers sales, sales_manager, and the four `/performance` pages that
 * shared the same non-canonical shape. S7–S9 cover the rest.
 */

const REVENUE_PAGES = [
  'app/sales/deals/[id]/page.tsx',
  'app/sales/leads/page.tsx',
  'app/sales/leads/[id]/edit/page.tsx',
  'app/sales/performance/page.tsx',
  'app/sales/pipeline/page.tsx',
  'app/sales_manager/deals/[id]/page.tsx',
  'app/sales_manager/performance/page.tsx',
  'app/sales_manager/pipeline/page.tsx',
  'app/finance/performance/page.tsx',
  'app/am_manager/performance/page.tsx',
  'app/production_manager/performance/page.tsx',
];

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('DS-6: the revenue modules use the canonical page title', () => {
  it.each(REVENUE_PAGES)('%s renders <h1 className="page-title">', (rel) => {
    const source = read(rel);
    const headings = Array.from(source.matchAll(/<h1[^>]*className="([^"]*)"/g)).map((m) => m[1]);
    expect({ rel, headings }).toEqual({ rel, headings: headings.map(() => 'page-title') });
    expect(headings.length).toBeGreaterThan(0);
  });

  it('no revenue page still sizes its own heading', () => {
    // The four shapes that were in use here: text-xl font-bold, text-2xl font-bold,
    // text-2xl font-semibold text-[var(--text-primary)], and page-title with a
    // hand-tuned margin.
    for (const rel of REVENUE_PAGES) {
      const headings = Array.from(read(rel).matchAll(/<h1[^>]*className="([^"]*)"/g)).map(
        (m) => m[1],
      );
      for (const className of headings) {
        expect({
          rel,
          className,
          sizesItself: /text-(xl|2xl|3xl)|font-(bold|semibold)/.test(className),
        }).toEqual({
          rel,
          className,
          sizesItself: false,
        });
      }
    }
  });

  it('subtitles use .page-subtitle rather than restating its rules', () => {
    // `text-sm text-[var(--text-muted)]` is character-for-character what
    // `.page-subtitle` already declares.
    for (const rel of REVENUE_PAGES) {
      const source = read(rel);
      expect({ rel, adHoc: source.includes('text-sm text-[var(--text-muted)] mt-1') }).toEqual({
        rel,
        adHoc: false,
      });
    }
  });
});

describe('DS-6: the benchmark pages define the canon', () => {
  it.each([
    'app/super_admin/payments/page.tsx',
    'app/admin/users/page.tsx',
    'app/admin/leads/page.tsx',
    'app/admin/finance/page.tsx',
  ])('%s renders a canonical page title', (rel) => {
    expect(read(rel)).toContain('<h1 className="page-title">');
  });
});

describe('DS-6: the finance benchmark has a heading structure', () => {
  const source = read('app/admin/finance/page.tsx');

  it('has exactly one h1', () => {
    // It previously had no h1 — no h1 through h6 anywhere — so the page a keyboard
    // or screen-reader user landed on had no name at all.
    expect(source.match(/<h1/g)).toHaveLength(1);
  });

  it('its section headings are headings, not styled divs', () => {
    // Both were `<div style={{ fontSize: 16, fontWeight: 700 }}>`.
    expect(source).toContain('<h2 className="section-title mb-3">USD Performance</h2>');
    expect(source).toContain('<h2 className="section-title mb-3">PKR Performance</h2>');
    expect(source).not.toContain('fontSize: 16, fontWeight: 700');
  });
});
