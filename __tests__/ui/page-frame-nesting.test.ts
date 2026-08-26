import * as fs from 'fs';
import * as path from 'path';

/**
 * DS-12 — one page frame per page.
 *
 * `AppShell` wraps every child in `<div className="page-frame">`, and `.page-frame`
 * is `width: min(--page-max-width, 100%); margin: 0 auto; padding-inline:
 * --page-padding-x`. Twenty-four pages opened with their own `page-frame` div inside
 * that one, so:
 *
 *   - horizontal padding doubled — those pages sat 48px from the viewport edge while
 *     the rest of the platform sat at 24px, which is visible the moment you navigate
 *     between, say, /admin/users and /hr/employees
 *   - `min(1400px, 100%)` was applied twice, so on a viewport narrower than 1400px the
 *     inner frame constrained an already-constrained width
 *
 * `app/admin/loading.tsx` also re-applied `py-6` on top of AppShell's
 * `py-[var(--page-padding-y)]`, so the skeleton sat lower than the content that
 * replaced it — a visible jump on every admin route change.
 *
 * One file legitimately keeps `.page-frame`: `HelpCenterPageContent` renders on the
 * public `/help` route, which has no AppShell layout, so it owns its own frame.
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

const CLEARED = [
  'app/sales/page.tsx',
  'app/sales/deals/page.tsx',
  'app/sales/leads/page.tsx',
  'app/sales/leads/[id]/edit/page.tsx',
  'app/sales/pipeline/page.tsx',
  'app/hr/page.tsx',
  'app/hr/documents/page.tsx',
  'app/hr/employees/page.tsx',
  'app/hr/leave/page.tsx',
  'app/hr/onboarding/page.tsx',
  'app/admin/loading.tsx',
  'app/admin/import/page.tsx',
  'app/admin/support/page.tsx',
];

describe('DS-12: AppShell owns the page frame', () => {
  it('AppShell applies it', () => {
    expect(read('components/layout/AppShell.tsx')).toContain('<div className="page-frame">');
  });

  it.each(CLEARED)('%s no longer nests a second one', (rel) => {
    expect({ rel, nested: read(rel).includes('className="page-frame') }).toEqual({
      rel,
      nested: false,
    });
  });

  it('the sales lead editor cleared all three of its branches', () => {
    // Loading, error and loaded each opened with their own frame.
    const source = read('app/sales/leads/[id]/edit/page.tsx');
    expect(source.match(/className="page-frame/g)).toBeNull();
    expect(source.match(/className="space-y-6"/g)).toHaveLength(3);
  });

  it('the admin skeleton no longer doubles the vertical padding too', () => {
    // `page-frame py-6` on top of AppShell's py-[var(--page-padding-y)] made the
    // skeleton sit lower than the content that replaced it.
    const source = read('app/admin/loading.tsx');
    expect(source).not.toContain('py-6');
    expect(source).toContain('<div className="space-y-6">');
  });
});

describe('DS-12: the remaining offenders are a known, shrinking list', () => {
  it('only the billing, reports and dashboard modules are left', () => {
    const remaining = walk('app')
      .filter((rel) => read(rel).includes('className="page-frame'))
      .sort();
    expect(remaining).toEqual([
      'app/billing/invoices/page.tsx',
      'app/billing/page.tsx',
      'app/billing/terminal/BillingTerminalContent.tsx',
      'app/billing/upgrade/page.tsx',
      'app/dashboard/compliance/page.tsx',
      'app/dashboard/crm/customers/page.tsx',
      'app/dashboard/crm/deals/page.tsx',
      'app/dashboard/inventory/products/page.tsx',
      'app/reports/projects/page.tsx',
      'app/reports/sales/page.tsx',
      'app/reports/team/page.tsx',
    ]);
  });

  it('the only component keeping a frame is the one outside AppShell', () => {
    // /help has no AppShell layout — it is a public route that opens in a new tab.
    const keepers = walk('components')
      .filter((rel) => read(rel).includes('className="page-frame'))
      .sort();
    expect(keepers).toEqual([
      'components/help-center/HelpCenterPageContent.tsx',
      'components/layout/AppShell.tsx',
    ]);
  });
});
