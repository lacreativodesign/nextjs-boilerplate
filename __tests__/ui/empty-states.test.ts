import * as fs from 'fs';
import * as path from 'path';

/**
 * DS-29 — an empty table should say it is empty.
 *
 * Of the files that check for emptiness at all, thirteen used `<EmptyState>` and
 * sixty-three printed a bare sentence — "No files found.", "No tickets.", "No
 * notifications" — in `text-[var(--text-muted)]`, at whatever padding that page
 * happened to use. Twelve converted in DS-29, twelve in DS-30 and eleven in DS-31;
 * the remaining 28 are pinned by name so the count only goes down.
 *
 * The distinction that matters is where the branch renders. Most sit outside the table,
 * replacing it wholesale, so `variant="table"` from DS-5 drops straight in.
 * `app/admin/support` is the exception: its branch is inside a `<tbody>`, so it keeps
 * the `<tr><td colSpan>` wrapper and puts the EmptyState inside the cell. An EmptyState
 * as a direct child of `<tbody>` is invalid markup and the browser hoists it out of the
 * table.
 *
 * Copy is the point of the exercise. "No files found." tells a client nothing; "No files
 * yet — deliverables shared with you will appear here" tells them the screen is working
 * and what will change it.
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

const CONVERTED = [
  // DS-29
  'app/client/billing/page.tsx',
  'app/client/change-requests/page.tsx',
  'app/client/files/page.tsx',
  'app/client/projects/page.tsx',
  'app/notifications/page.tsx',
  'app/super_admin/activity/page.tsx',
  'app/super_admin/tickets/page.tsx',
  'app/dashboard/users/page.tsx',
  'app/dashboard/inventory/products/page.tsx',
  'app/admin/support/page.tsx',
  'app/sales/targets/page.tsx',
  'app/settings/security/page.tsx',
  // DS-30
  'app/hr/activity/page.tsx',
  'app/hr/documents/page.tsx',
  'app/hr/employees/page.tsx',
  'app/hr/onboarding/page.tsx',
  'app/sales/campaigns/page.tsx',
  'app/sales/deals/page.tsx',
  'app/sales/follow-ups/page.tsx',
  'app/sales/inbox/page.tsx',
  'app/sales_manager/deals/page.tsx',
  'app/sales_manager/leads/page.tsx',
  'app/sales_manager/targets/page.tsx',
  'app/sales_manager/team/page.tsx',
  // DS-31
  'app/admin/clients/key-accounts/page.tsx',
  'app/admin/hr/activity/page.tsx',
  'app/admin/hr/documents/page.tsx',
  'app/admin/hr/employees/page.tsx',
  'app/admin/hr/onboarding/page.tsx',
  'app/admin/hr/page.tsx',
  'app/admin/hr/performance/page.tsx',
  'app/admin/leads/page.tsx',
  'app/admin/production/page.tsx',
  'app/admin/production/qa/page.tsx',
  'app/admin/production/queue/page.tsx',
];

/** The DS-30 branches that sit inside a <tbody> and therefore keep a <td colSpan>. */
const IN_TBODY: Array<[string, number]> = [
  ['app/admin/support/page.tsx', 6],
  ['app/hr/activity/page.tsx', 4],
  ['app/hr/documents/page.tsx', 6],
  ['app/hr/employees/page.tsx', 9],
  ['app/hr/onboarding/page.tsx', 6],
  ['app/sales/campaigns/page.tsx', 5],
  ['app/sales/deals/page.tsx', 7],
  ['app/sales/follow-ups/page.tsx', 5],
  ['app/sales/inbox/page.tsx', 5],
  ['app/admin/hr/activity/page.tsx', 4],
  ['app/admin/hr/documents/page.tsx', 6],
  ['app/admin/hr/employees/page.tsx', 9],
  ['app/admin/hr/page.tsx', 3],
  ['app/admin/hr/performance/page.tsx', 6],
  ['app/admin/production/page.tsx', 6],
  ['app/admin/production/qa/page.tsx', 6],
  ['app/admin/production/queue/page.tsx', 10],
];

describe('DS-29: the converted pages use the shared empty state', () => {
  it.each(CONVERTED)('%s renders <EmptyState>', (rel) => {
    const source = read(rel);
    expect(source).toContain("import EmptyState from '@/components/ui/EmptyState'");
    expect(source).toContain('<EmptyState');
  });

  it('none of them still prints a bare "No \u2026 found." sentence', () => {
    for (const rel of CONVERTED) {
      const bare = /<(div|p)[^>]*>\s*No [a-z ]+ found\.\s*</.test(read(rel));
      expect({ rel, bare }).toEqual({ rel, bare: false });
    }
  });

  it('every empty state says what will fill the screen', () => {
    // A title alone repeats what the user can already see. The description is the part
    // that tells them the screen is working and what changes it.
    for (const rel of CONVERTED) {
      const hasDescription = /<EmptyState[\s\S]{0,400}?description=/.test(read(rel));
      expect({ rel, hasDescription }).toEqual({ rel, hasDescription: true });
    }
  });

  it.each(IN_TBODY)('%s keeps its <td colSpan={%i}> wrapper', (rel, colSpan) => {
    // An EmptyState rendered as a direct child of <tbody> is invalid markup and the
    // browser hoists it out of the table entirely.
    const source = read(rel);
    const branch = source.slice(source.indexOf('.length === 0'));
    expect(branch.slice(0, 500)).toContain(`<td colSpan={${colSpan}}>`);
    expect(branch.slice(0, 500)).toContain('variant="table"');
  });

  it('no converted empty state still carries a hand-tuned cell style', () => {
    // The three app/admin/production tables spread `...cellStyle` onto the empty cell,
    // which set a border and 14px padding around what is now a centred EmptyState.
    for (const [rel] of IN_TBODY) {
      const source = read(rel);
      const start = source.indexOf('.length === 0');
      // Stop at the closing </tr> — past it are the real data rows, which legitimately
      // still carry their own cell styles.
      const branch = source.slice(start, source.indexOf('</tr>', start));
      expect({ rel, styled: /<td[^>]*style=\{/.test(branch) }).toEqual({ rel, styled: false });
    }
  });

  it('the sales_manager pages no longer paint from a hardcoded rgba', () => {
    // All four used `color: 'rgba(15,23,42,0.70)'` — a fixed near-black with no
    // dark-mode counterpart, so the message was invisible on a dark surface.
    for (const rel of [
      'app/sales_manager/deals/page.tsx',
      'app/sales_manager/leads/page.tsx',
      'app/sales_manager/targets/page.tsx',
      'app/sales_manager/team/page.tsx',
    ]) {
      const source = read(rel);
      const start = source.indexOf('.length === 0');
      const branch = source.slice(start, start + 600);
      expect({ rel, hardcoded: branch.includes('rgba(15,23,42') }).toEqual({
        rel,
        hardcoded: false,
      });
    }
  });
});

describe('DS-29: the remaining bare-text pages are a known, shrinking list', () => {
  it('28 are left', () => {
    const bare = walk('app')
      .filter((rel) => !CONVERTED.includes(rel.split(path.sep).join('/')))
      .filter((rel) => {
        const source = read(rel);
        if (source.includes('EmptyState')) return false;
        return /length === 0 \?[\s\S]{0,200}?>\s*(No|Nothing|You have no)\s/.test(source);
      })
      .map((rel) => rel.split(path.sep).join('/'))
      .sort();
    expect(bare).toEqual([
      'app/admin/clients/segments/page.tsx',
      'app/admin/finance/invoices/page.tsx',
      'app/admin/finance/page.tsx',
      'app/admin/finance/payments/page.tsx',
      'app/admin/finance/payroll/page.tsx',
      'app/admin/projects/change-requests/page.tsx',
      'app/admin/projects/files/page.tsx',
      'app/admin/projects/pipeline/page.tsx',
      'app/admin/reports/clients/page.tsx',
      'app/admin/reports/delivery/page.tsx',
      'app/admin/reports/page.tsx',
      'app/admin/reports/production/page.tsx',
      'app/admin/reports/revenue/page.tsx',
      'app/admin/sales/campaigns/page.tsx',
      'app/admin/sales/deals/page.tsx',
      'app/admin/sales/follow-ups/page.tsx',
      'app/admin/sales/leads/page.tsx',
      'app/admin/settings/integrations/quickbooks/page.tsx',
      'app/admin/settings/integrations/xero/page.tsx',
      'app/admin/settings/notifications/page.tsx',
      'app/billing/page.tsx',
      'app/billing/terminal/BillingTerminalContent.tsx',
      'app/finance/performance/page.tsx',
      'app/finance/tax/page.tsx',
      'app/production/activity/page.tsx',
      'app/production/queue/page.tsx',
      'app/sales/leads/[id]/page.tsx',
      'app/super_admin/tax/page.tsx',
    ]);
  });
});
