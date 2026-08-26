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
 * adds `client`, `finance` and `reports`, DS-18 adds `production` and `sales`, and DS-19
 * finishes with `hr`. All fourteen are converted, so the shrinking offender list becomes
 * a rule: no layout titles a page, and every page either names itself or renders no UI.
 *
 * DS-20 starts the same job inside `app/admin`, whose nine sub-modules title from a
 * layout using `<h2 className="section-title">` — leaving those routes with no h1 at
 * all. `clients`, `projects`, `users` and `production` convert in DS-20, `finance` and
 * `reports` in DS-21, `sales` in DS-22 and `hr` in DS-23. One remains: `settings`.
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
  // A stub neither renders JSX nor delegates to something that does — it redirects,
  // 404s, or returns null. Both halves matter: `app/hr/employees` is 713 lines and
  // contains `return null;` in a drawer guard, and `app/clients/page.tsx` is a
  // one-line re-export whose target must still be checked for a title.
  if (/<[A-Za-z]/.test(source)) return false;
  if (/export \{ default \} from/.test(source)) return false;
  return /\bredirect\(|\bnotFound\(|return null;/.test(source);
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
  'production',
  'sales',
  'hr',
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
    ['app/production/page.tsx', 'Overview'],
    ['app/production/activity/page.tsx', 'Activity'],
    ['app/sales/page.tsx', 'Overview'],
    ['app/sales/campaigns/page.tsx', 'Campaigns'],
    ['app/sales/deals/page.tsx', 'Deals'],
    ['app/sales/follow-ups/page.tsx', 'Follow-ups'],
    ['app/sales/inbox/page.tsx', 'Inbox'],
    ['app/sales/targets/page.tsx', 'Targets'],
    ['app/hr/page.tsx', 'Overview'],
    ['app/hr/employees/page.tsx', 'Employees'],
    ['app/hr/performance/page.tsx', 'Performance'],
    ['app/hr/attendance/page.tsx', 'Attendance'],
    ['app/hr/documents/page.tsx', 'Documents'],
    ['app/hr/onboarding/page.tsx', 'Onboarding'],
    ['app/hr/payroll/page.tsx', 'Payroll'],
    ['app/hr/activity/page.tsx', 'Activity'],
    ['app/admin/production/page.tsx', 'Overview'],
    ['app/admin/production/queue/page.tsx', 'Queue'],
    ['app/admin/reports/page.tsx', 'Overview'],
    ['app/admin/reports/clients/page.tsx', 'Client Insights'],
    ['app/admin/reports/delivery/page.tsx', 'Delivery Performance'],
    ['app/admin/reports/production/page.tsx', 'Production Analytics'],
    ['app/admin/reports/settings/page.tsx', 'Settings'],
    ['app/admin/finance/invoices/page.tsx', 'Invoices'],
    ['app/admin/finance/payments/page.tsx', 'Payments'],
    ['app/admin/finance/payroll/page.tsx', 'Payroll'],
    ['app/admin/finance/reports/page.tsx', 'Reports'],
    ['app/admin/finance/settings/page.tsx', 'Settings'],
    ['app/admin/sales/page.tsx', 'Overview'],
    ['app/admin/sales/deals/page.tsx', 'Deals'],
    ['app/admin/sales/follow-ups/page.tsx', 'Follow-Ups'],
    ['app/admin/sales/leads/page.tsx', 'Leads'],
    ['app/admin/sales/pipeline/page.tsx', 'Pipeline'],
    ['app/admin/hr/page.tsx', 'Overview'],
    ['app/admin/hr/activity/page.tsx', 'Activity'],
    ['app/admin/hr/documents/page.tsx', 'Documents'],
    ['app/admin/hr/employees/page.tsx', 'Employees'],
    ['app/admin/hr/onboarding/page.tsx', 'Onboarding'],
    ['app/admin/hr/performance/page.tsx', 'Performance'],
    ['app/admin/hr/settings/page.tsx', 'Settings'],
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

  it('the two production aliases are titled by their tab, not their path', () => {
    // /production/jobs re-exports /production/queue and /production/workload re-exports
    // /production/resources. Only the aliases appear in the tab bar, so the shared
    // component takes the tab's name.
    expect(read('app/production/jobs/page.tsx')).toContain(
      "export { default } from '@/app/production/queue/page';",
    );
    expect(read('app/production/queue/page.tsx')).toContain('<h1 className="page-title">Jobs</h1>');
    expect(read('app/production/workload/page.tsx')).toContain(
      "export { default } from '@/app/production/resources/page';",
    );
    expect(read('app/production/resources/page.tsx')).toContain(
      '<h1 className="page-title">Workload</h1>',
    );
  });

  it('the QA workspace titles the route it backs', () => {
    // app/production/qa renders this component and nothing else.
    expect(read('components/production/QualityAssuranceWorkspace.tsx')).toContain(
      '<h1 className="page-title">QA</h1>',
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
  it('no layout anywhere titles a page', () => {
    const stillTitling = walk('app')
      .filter((rel) => rel.endsWith('layout.tsx') && read(rel).includes('<h1'))
      .sort();
    expect(stillTitling).toEqual([]);
  });

  it('every page outside app/admin names itself', () => {
    // The rule, now that the shrinking list has reached zero for the role modules: a
    // route either renders a heading of its own or renders no UI at all.
    //
    // app/admin is excluded deliberately. Its nine sub-modules (clients, finance, hr,
    // production, projects, reports, sales, settings, users) still title their pages
    // from a layout, using `<h2 className="section-title">` rather than an h1 — so
    // roughly 53 admin pages have no h1 of their own and those routes expose no
    // top-level heading at all. Converting them is the same job done here, and is the
    // last of it.
    const PENDING_ADMIN = ['settings'].map(
      (mod) => `app${path.sep}admin${path.sep}${mod}${path.sep}`,
    );
    const orphans = walk('app')
      .filter((rel) => rel.endsWith('page.tsx'))
      .filter((rel) => !PENDING_ADMIN.some((prefix) => rel.startsWith(prefix)))
      .filter((rel) => !rendersHeading(rel))
      .filter((rel) => !rendersNothing(rel))
      .sort();
    expect(orphans).toEqual([]);
  });

  it('settings is the last holdout', () => {
    const sectionTitled = walk('app')
      .filter((rel) => rel.endsWith('layout.tsx') && read(rel).includes('className="section-title'))
      .sort();
    expect(sectionTitled).toEqual(['app/admin/settings/layout.tsx']);
  });

  it('no admin page titles itself with a styled div', () => {
    // Every app/admin/hr page rendered its title as
    // `<div style={{ fontSize: 20, fontWeight: 700 }}>`, which is why a sweep for <h1
    // reported all seven as untitled.
    const offenders = walk('app/admin/hr')
      .concat(walk('app/admin/sales'))
      .concat(walk('app/admin/finance'))
      .filter((rel) => /fontSize: 20, fontWeight: 700/.test(read(rel)))
      .sort();
    expect(offenders).toEqual([]);
  });

  it('no page fakes a loading state it can never leave', () => {
    // app/admin/hr/attendance rendered "Attendance dashboard is initializing" above a
    // TableSkeleton with nothing behind it — a placeholder dressed as a load.
    const source = read('app/admin/hr/attendance/page.tsx');
    expect(source).not.toContain('TableSkeleton');
    expect(source).toContain('EmptyState');
  });

  it('no page title is rendered as an h3 or a styled div', () => {
    // admin/finance/reports and /settings used <h3 style={{ fontSize: 20 }}>, and
    // admin/finance/ar used <h3 style={{ fontSize: 18 }}> inside a hand-rolled card —
    // three more sizes that no stylesheet could reach.
    const offenders = walk('app/admin/finance')
      .concat(walk('app/admin/reports'))
      .concat(walk('app/admin/sales'))
      .concat(walk('app/admin/hr'))
      .filter((rel) => /<h3[^>]*style=\{/.test(read(rel)))
      .sort();
    expect(offenders).toEqual([]);
  });

  it('no page renders two titles in the same pass', () => {
    // Several files hold more than one h1 across mutually exclusive render branches —
    // loading, error, loaded — which is correct. app/billing/upgrade was different: it
    // rendered "Premium Upgrade" and then "Choose Your Plan" eight lines later in the
    // same tree, and the hero already carried a "Premium upgrade" eyebrow above it.
    const BRANCHED = [
      'app/admin/crm/page.tsx',
      'app/client/accept-invite/page.tsx',
      'app/impersonate/page.tsx',
      'app/pay/[invoiceId]/page.tsx',
      'app/signup/page.tsx',
    ].map((rel) => rel.split('/').join(path.sep));

    const multi = walk('app')
      .filter((rel) => (read(rel).match(/<h1/g) ?? []).length > 1)
      .sort();
    expect(multi).toEqual(BRANCHED.sort());
  });

  it('the twelve stub routes are the only ones exempt', () => {
    const stubs = walk('app')
      .filter((rel) => rel.endsWith('page.tsx') && rendersNothing(rel))
      .sort();
    expect(stubs).toEqual([
      'app/admin/finance/estimates/page.tsx',
      'app/admin/finance/invoices/create/page.tsx',
      'app/admin/finance/retainers/page.tsx',
      'app/admin/hr/leave/page.tsx',
      'app/admin/hr/payroll/page.tsx',
      'app/admin/projects/changes/page.tsx',
      'app/admin/users/add/page.tsx',
      'app/billing/pricing/page.tsx',
      'app/client/settings/page.tsx',
      'app/forbidden/page.tsx',
      'app/page.tsx',
      'app/sales/leads/add/page.tsx',
    ]);
  });
});
