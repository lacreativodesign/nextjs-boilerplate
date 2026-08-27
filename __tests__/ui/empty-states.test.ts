import * as fs from 'fs';
import * as path from 'path';

/**
 * DS-29 — an empty table should say it is empty.
 *
 * Of the files that check for emptiness at all, thirteen used `<EmptyState>` and
 * sixty-three printed a bare sentence — "No files found.", "No tickets.", "No
 * notifications" — in `text-[var(--text-muted)]`, at whatever padding that page
 * happened to use. Twelve convert here; the remaining 51 are pinned by name so the
 * count only goes down.
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

  it('the one inside a tbody keeps its row wrapper', () => {
    const source = read('app/admin/support/page.tsx');
    const branch = source.slice(source.indexOf('tickets.length === 0'));
    expect(branch.slice(0, 400)).toContain('<td colSpan={6}>');
    expect(branch.slice(0, 400)).toContain('variant="table"');
  });
});

describe('DS-29: the remaining bare-text pages are a known, shrinking list', () => {
  it('51 are left', () => {
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
      'app/admin/clients/key-accounts/page.tsx',
      'app/admin/clients/segments/page.tsx',
      'app/admin/finance/invoices/page.tsx',
      'app/admin/finance/page.tsx',
      'app/admin/finance/payments/page.tsx',
      'app/admin/finance/payroll/page.tsx',
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
      'app/hr/activity/page.tsx',
      'app/hr/documents/page.tsx',
      'app/hr/employees/page.tsx',
      'app/hr/onboarding/page.tsx',
      'app/production/activity/page.tsx',
      'app/production/queue/page.tsx',
      'app/sales/campaigns/page.tsx',
      'app/sales/deals/page.tsx',
      'app/sales/follow-ups/page.tsx',
      'app/sales/inbox/page.tsx',
      'app/sales/leads/[id]/page.tsx',
      'app/sales_manager/deals/page.tsx',
      'app/sales_manager/leads/page.tsx',
      'app/sales_manager/targets/page.tsx',
      'app/sales_manager/team/page.tsx',
      'app/super_admin/tax/page.tsx',
    ]);
  });
});
