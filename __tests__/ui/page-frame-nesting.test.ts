import * as fs from 'fs';
import * as path from 'path';

/**
 * DS-12 / DS-13 — one page frame per page.
 *
 * `AppShell` wraps every child in `<div className="page-frame">`, and `.page-frame` is
 * `width: min(--page-max-width, 100%); margin: 0 auto; padding-inline:
 * --page-padding-x`. Twenty-four pages opened with their own `page-frame` div inside
 * that one, so:
 *
 *   - horizontal padding doubled — those pages sat 48px from the viewport edge while
 *     the rest of the platform sat at 24px, visible the moment you navigate between,
 *     say, /admin/users and /hr/employees
 *   - `min(1400px, 100%)` was applied twice, so on a viewport narrower than 1400px the
 *     inner frame re-constrained an already-constrained width
 *
 * Two of them nested a third level. `BillingTerminalContent` carried its own frame and
 * is rendered twice: standalone at `/billing/terminal`, and embedded in the terminal
 * tab of `app/billing/page.tsx`, which had a frame of its own. On that tab the padding
 * reached 72px.
 *
 * Two also re-applied vertical padding on top of AppShell's
 * `py-[var(--page-padding-y)]`: `app/admin/loading.tsx` (`py-6`), which made the
 * skeleton sit lower than the content that replaced it — a visible jump on every admin
 * route change — and `app/billing/upgrade` (`py-8`).
 *
 * The rule this pins: AppShell is the sole owner of `.page-frame`. The one exception is
 * `HelpCenterPageContent`, which renders on the public `/help` route. That route has no
 * AppShell layout and opens in a new tab, so it owns its own frame.
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

describe('DS-13: AppShell is the sole owner of the page frame', () => {
  it('AppShell applies it', () => {
    expect(read('components/layout/AppShell.tsx')).toContain('<div className="page-frame">');
  });

  it('no page under app/ applies its own', () => {
    const offenders = walk('app')
      .filter((rel) => read(rel).includes('className="page-frame'))
      .sort();
    expect(offenders).toEqual([]);
  });

  it('the only other owner is the route that has no AppShell', () => {
    const owners = walk('components')
      .filter((rel) => read(rel).includes('className="page-frame'))
      .sort();
    expect(owners).toEqual([
      'components/help-center/HelpCenterPageContent.tsx',
      'components/layout/AppShell.tsx',
    ]);
  });
});

describe('DS-13: the three-deep case is resolved', () => {
  it('BillingTerminalContent no longer carries a frame', () => {
    // Rendered standalone at /billing/terminal AND embedded in app/billing/page.tsx's
    // terminal tab, which had its own frame — 72px of padding on that tab.
    const source = read('app/billing/terminal/BillingTerminalContent.tsx');
    expect(source).not.toContain('className="page-frame');
    expect(source).toContain('<div className="space-y-6 text-[var(--text-primary)]">');
  });

  it('both of its render sites are still intact', () => {
    expect(read('app/billing/terminal/page.tsx')).toContain('<BillingTerminalContent />');
    expect(read('app/billing/page.tsx')).toContain('<BillingTerminalContent showShell={false} />');
  });
});

describe('DS-13: no page re-applies vertical padding either', () => {
  it.each([
    ['app/admin/loading.tsx', 'py-6'],
    ['app/billing/upgrade/page.tsx', 'py-8'],
  ])('%s no longer sets %s on its root', (rel, padding) => {
    const root = read(rel).match(/<(?:div|main) className="[^"]*"/)?.[0] ?? '';
    expect({ rel, root, padded: root.includes(padding) }).toEqual({ rel, root, padded: false });
  });
});

describe('DS-13: every render branch was cleared, not just the happy path', () => {
  it.each([
    ['app/reports/projects/page.tsx', 1],
    ['app/reports/sales/page.tsx', 2],
    ['app/reports/team/page.tsx', 1],
    ['app/sales/leads/[id]/edit/page.tsx', 3],
  ])('%s cleared its %i early-return branch(es)', (rel, branches) => {
    const source = read(rel);
    expect(source).not.toContain('className="page-frame');
    expect((source.match(/className="space-y-6"/g) ?? []).length).toBeGreaterThanOrEqual(branches);
  });

  it('the sales report error branch uses the danger token, not a raw red', () => {
    expect(read('app/reports/sales/page.tsx')).not.toContain('text-red-500');
  });
});
