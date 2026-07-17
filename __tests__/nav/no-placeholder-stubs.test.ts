import * as fs from 'fs';
import * as path from 'path';

/**
 * F12 (FUNC-01, FUNC-02) — placeholder stub surfaces are gone.
 *
 * Five routes were 17-line "Placeholder for ..." pages: an unfinished surface shipping inside a
 * sold plan, none of them linked from navigation. Three have a real, implemented equivalent and
 * now redirect to it; two have no implementation yet and now return 404. This test pins that
 * replacement so no "Placeholder for ..." page can quietly reappear.
 *
 * It also guards FUNC-01: the recurring-invoice UI components (FrequencySelector,
 * RecurringTemplateCard) are unimported by any page and the generator cron is gated behind
 * ERP_ENABLE_RECURRING_INVOICES. There is no reachable recurring UI, and this test keeps it that
 * way.
 */
const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function walkPages(dir: string, acc: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkPages(full, acc);
    else if (entry.name === 'page.tsx') acc.push(full);
  }
}

const REDIRECT_STUBS: Array<{ file: string; target: string }> = [
  { file: 'app/admin/hr/leave/page.tsx', target: '/hr/leave' },
  { file: 'app/admin/hr/payroll/page.tsx', target: '/hr/payroll' },
  { file: 'app/admin/projects/changes/page.tsx', target: '/admin/projects/change-requests' },
];

const NOT_FOUND_STUBS = [
  'app/admin/finance/estimates/page.tsx',
  'app/admin/finance/retainers/page.tsx',
];

const RECURRING_COMPONENTS = ['FrequencySelector', 'RecurringTemplateCard'];

describe('F12: no placeholder stub surfaces', () => {
  it('the 3 stubs with a real equivalent redirect to it', () => {
    for (const { file, target } of REDIRECT_STUBS) {
      const src = read(file);
      expect(src).toContain("from 'next/navigation'");
      expect(src).toContain(`redirect('${target}')`);
    }
  });

  it('the 2 stubs with no implementation return 404', () => {
    for (const file of NOT_FOUND_STUBS) {
      const src = read(file);
      expect(src).toContain("from 'next/navigation'");
      expect(src).toContain('notFound()');
    }
  });

  it('no page imports the recurring-invoice components', () => {
    const pages: string[] = [];
    walkPages(path.join(ROOT, 'app'), pages);

    const offenders = pages.filter((file) => {
      const src = fs.readFileSync(file, 'utf8');
      return RECURRING_COMPONENTS.some((name) => src.includes(name));
    });

    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it('the recurring invoice cron stays gated behind ERP_ENABLE_RECURRING_INVOICES', () => {
    const cron = read('app/api/cron/generate-invoices/route.ts');
    expect(cron).toContain("process.env.ERP_ENABLE_RECURRING_INVOICES !== 'true'");
  });
});
