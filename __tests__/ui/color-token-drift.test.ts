import fs from 'fs';
import path from 'path';

/**
 * P2-1 — colour comes from design tokens, enforced file-by-file.
 *
 * The design-token system in app/globals.css is comprehensive, but ~20% of component files
 * bypassed it with raw hex — including token-divergent values and mixed-case duplicates. A
 * whole-repo purge in one step is unreviewable and risks changing rendered output with no way
 * to visually verify, so Phase 2 converts files in batches.
 *
 * CLEAN_FILES is the allowlist of files already migrated to tokens. It only grows. Each Phase 2
 * UI session adds the files it converts. This test fails the build if any listed file
 * re-introduces a raw hex colour, so cleaned files cannot silently regress while the remaining
 * files are migrated over subsequent sessions.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

/** Files fully migrated to design tokens. Append to this as Phase 2 progresses; never remove. */
const CLEAN_FILES: string[] = [
  'app/super_admin/payments/page.tsx',
  // P2-2: super_admin route group
  'app/super_admin/page.tsx',
  'app/super_admin/activation/page.tsx',
  'app/super_admin/demo/page.tsx',
  'app/super_admin/maintenance/page.tsx',
  'app/super_admin/security/page.tsx',
  'app/super_admin/tax/page.tsx',
  'app/super_admin/system-health/full/page.tsx',
  'app/super_admin/tenants/[tenantId]/page.tsx',
  // P2-3: finance / hr / production
  'app/finance/page.tsx',
  'app/finance/invoices/page.tsx',
  'app/hr/attendance/page.tsx',
  'app/hr/attendance/[employeeId]/page.tsx',
  'app/production/resources/page.tsx',
  'app/production/reports/page.tsx',
  'app/production/files/page.tsx',
  // P2-4: settings / onboarding
  'app/settings/page.tsx',
  'app/settings/preferences/page.tsx',
  'app/settings/payments/page.tsx',
  'app/onboarding/page.tsx',
  // P2-5: sales
  'app/sales/page.tsx',
  'app/sales/deals/page.tsx',
  'app/sales/analytics/page.tsx',
  'app/sales/leads/[id]/page.tsx',
  'app/sales/targets/page.tsx',
  'app/sales/reports/page.tsx',
  'app/sales/performance/page.tsx',
  'app/sales/clients/page.tsx',
  // P2-6: admin (settings + reports batch). Note: app/admin/settings/branding/page.tsx is
  // deliberately NOT listed — its hex values are tenant branding CONFIG DATA (default
  // colour-picker values fed into CSS vars), not hardcoded UI styling, so they must stay hex.
  'app/admin/page.tsx',
  'app/admin/reports/_components/ReportsUI.tsx',
  'app/admin/reports/settings/page.tsx',
  'app/admin/settings/api-usage/_components/UsageCharts.tsx',
  'app/admin/settings/email-templates/page.tsx',
  'app/admin/settings/integrations/quickbooks/page.tsx',
  'app/admin/settings/integrations/xero/page.tsx',
  // P2-7: admin/users (roles/page.tsx deferred to P2-8 — it is a full role-colour palette)
  'app/admin/users/[uid]/edit/page.tsx',
  'app/admin/users/[uid]/page.tsx',
  'app/admin/users/create/page.tsx',
  'app/admin/users/page.tsx',
  // P2-8: admin/users/roles — the role/org-chart colour palette
  'app/admin/users/roles/page.tsx',
  // P2-9: admin clients / hr / projects
  'app/admin/clients/add/page.tsx',
  'app/admin/clients/[id]/edit/page.tsx',
  'app/admin/clients/page.tsx',
  'app/admin/clients/key-accounts/page.tsx',
  'app/admin/hr/employees/page.tsx',
  'app/admin/hr/performance/page.tsx',
  'app/admin/hr/onboarding/page.tsx',
  'app/admin/hr/activity/page.tsx',
  'app/admin/projects/files/page.tsx',
  'app/admin/projects/change-requests/page.tsx',
  // P2-10: admin finance / monitoring / singletons + SettingsAlert (completes admin).
  // app/admin/settings/branding/page.tsx remains excluded — tenant branding config data.
  'app/admin/settings/_components/SettingsAlert.tsx',
  'app/admin/finance/budgets/[id]/page.tsx',
  'app/admin/finance/reports/page.tsx',
  'app/admin/finance/settings/page.tsx',
  'app/admin/jobs/page.tsx',
  'app/admin/leads/page.tsx',
  'app/admin/monitoring/page.tsx',
  'app/admin/sales/deals/page.tsx',
  // P2-11: shared components (batch 1). Deferred with documented reasons:
  //   - components/files/TagManager.tsx: default colour-picker value (config data).
  //   - components/finance/ExpenseBreakdownChart.tsx: pie palette pending a chart-theme pass.
  //   - components/production/GanttChart.tsx: canvas fillStyle cannot resolve CSS var().
  'components/activity/ActivityFeedSidebar.tsx',
  'components/onboarding/ActivationChecklist.tsx',
  'components/production/ProductionProjectDrawer.tsx',
  'components/super_admin/ImpersonationBanner.tsx',
  'components/notifications/NotificationToast.tsx',
  // P2-12: shared components (batch 2) — layout/auth cluster
  'components/DashboardLayout.tsx',
  'components/RequireAuth.tsx',
  'components/layouts/ERPLayout.tsx',
  'components/performance/ProgressBar.tsx',
  // P2-13: shared components (batch 3). Deferred: components/ui/BizostoSplash.tsx is a
  // self-contained splash screen with its own light/dark decorative gradient system (its own
  // @media prefers-color-scheme block); its one-off gradient stops are handled separately.
  'components/layout/Header.tsx',
  'components/hr/TimeTrackingDashboard.tsx',
  // P2-14: auth / entry pages
  'app/login/page.tsx',
  'app/signup/page.tsx',
  'app/set-password/page.tsx',
  'app/error.tsx',
  'app/not-found.tsx',
  // P2-15: public invoice-payment page
  'app/pay/[invoiceId]/page.tsx',
  // P2-16: legal + security pages (all existing brand tokens, no new tokens)
  'app/terms/page.tsx',
  'app/privacy/page.tsx',
  'app/cookie-policy/page.tsx',
  'app/refund-cancellation/page.tsx',
  'app/security/page.tsx',
  // P2-17: shared layouts (team / hierarchy / activity) — existing tokens, no new tokens
  'app/team/layout.tsx',
  'app/hierarchy/layout.tsx',
  'app/activity/layout.tsx',
  // P2-18: misc role/util pages
  'app/impersonate/page.tsx',
  'app/billing/upgrade/page.tsx',
  'app/am/change-requests/page.tsx',
  'app/sales_manager/deals/page.tsx',
  'app/sales_manager/leads/page.tsx',
  'app/users/page.tsx',
  // P2-19: shorthand sweep — files whose only remaining raw colour was #fff/#999 shorthand.
  // (hr/attendance pages were already allowlisted in an earlier batch.)
  'components/FileUploader.tsx',
];

/**
 * EXCLUDED_FILES intentionally retain raw colour and are NOT part of CLEAN_FILES. Each entry
 * documents why. This makes the exclusions explicit and permanent rather than silent omissions.
 */
const EXCLUDED_FILES: Record<string, string> = {
  'app/admin/settings/branding/page.tsx':
    'Tenant branding config data — default colour-picker values fed INTO CSS vars, not styling.',
  'components/files/TagManager.tsx':
    'Default colour-picker value (useState seed) — config data a user edits, not styling.',
  'components/finance/ExpenseBreakdownChart.tsx':
    'Pie palette pending a deliberate chart-theme pass (theme-aware decision across all charts).',
  'components/production/GanttChart.tsx':
    'One intentional literal #ffffff: the PNG-export canvas background is theme-independent white ' +
    '(canvas 2D fillStyle cannot resolve CSS var()). All other colour is tokenised.',
  'components/ui/BizostoSplash.tsx':
    'Self-contained splash with its own light/dark decorative gradient system (own @media block).',
  'app/layout.tsx':
    'Next.js viewport.themeColor — serialized into a <meta name="theme-color"> tag, not CSS; ' +
    'cannot resolve CSS var(). Value equals --brand-navy.',
};

/**
 * Tokens formalized in P2-1 so no component needs raw hex for these colours. Each must exist in
 * globals.css with its exact value, because the migration relies on the token rendering
 * identically to the hex it replaced.
 */
const FORMALIZED_TOKENS: Record<string, string> = {
  '--danger-strong': '#dc2626',
  '--warning-strong': '#d97706',
  '--info-strong': '#0891b2',
  '--brand-navy': '#012167',
  '--brand-blue-light': '#6692f9',
  // P2-2
  '--warning-strong-alt': '#b45309',
  '--warning-deep': '#92400e',
  '--warning-deeper': '#78350f',
  '--brand-primary': '#6366f1',
  // P2-3
  '--color-info': '#3b82f6',
  '--warning-alt': '#eab308',
  '--surface-inverse': '#1f2937',
  '--status-success-bg': '#dcfce7',
  '--status-success-text': '#166534',
  // P2-4
  '--text-on-brand': '#ffffff',
  '--stripe-brand': '#635bff',
  // P2-5
  '--success-strong': '#15803d',
  '--danger-deep': '#b91c1c',
  // P2-6
  '--alert-error-text': '#991b1b',
  '--alert-success-text': '#065f46',
  '--color-indigo': '#4f46e5',
  '--email-canvas': '#ffffff',
  // P2-7
  '--surface-neutral': '#e5e7eb',
  '--text-strong': '#111827',
  '--danger-bg': '#fee2e2',
  // P2-8
  '--color-violet': '#6d28d9',
  '--color-violet-deep': '#5b21b6',
  '--color-violet-deeper': '#4c1d95',
  '--color-slate': '#4b5563',
  '--color-slate-deep': '#374151',
  '--color-emerald': '#059669',
  '--color-rose': '#e11d48',
  // P2-9
  '--danger-text-soft': '#fca5a5',
  '--color-sky': '#38bdf8',
  // P2-10
  '--alert-error-text-dark': '#fecaca',
  '--alert-success-text-dark': '#a7f3d0',
  '--alert-info-text': '#1e3a8a',
  '--alert-info-text-dark': '#e2e8f0',
  '--color-orange-deep': '#ea580c',
  '--danger-border-soft': '#f87171',
  // P2-11
  '--color-violet-light': '#8b5cf6',
  // P2-12
  '--gray-50': '#f9fafb',
  '--gray-100': '#f3f4f6',
  '--gray-300': '#d1d5db',
  '--gray-400': '#9ca3af',
  '--gray-500': '#6b7280',
  // P2-13
  '--border-muted': '#cbd5e1',
  '--border-faint': '#f1f5f9',
  // P2-14
  '--text-slate-deep': '#1e293b',
  '--brand-navy-soft': '#1e3a5f',
  // P2-15
  '--text-near-black': '#1a1a1a',
  '--status-success-bg-soft': '#f0fdf4',
  '--status-success-border': '#bbf7d0',
  // P2-18
  '--text-slate': '#334155',
  // P2-19
  '--border-dashed': '#999999',
};

/** Matches a six-digit hex colour literal. */
const HEX = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/;

describe('P2-1: the formalized tokens exist with their exact values', () => {
  const css = read('app/globals.css');

  it.each(Object.entries(FORMALIZED_TOKENS))('%s is defined as %s', (token, value) => {
    expect(css).toContain(`${token}: ${value};`);
  });

  it('keeps the fill and text danger shades distinct', () => {
    // --danger is the -500 fill; --danger-strong is the -600 text shade. They must not collapse.
    expect(css).toContain('--danger: #ef4444;');
    expect(css).toContain('--danger-strong: #dc2626;');
    expect(css).not.toContain('--danger-strong: #ef4444;');
  });
});

describe('P2-1: migrated files contain no raw hex colour', () => {
  it.each(CLEAN_FILES)('%s uses tokens, not hex', (rel) => {
    const src = read(rel);
    const offending = src
      .split('\n')
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => HEX.test(line));

    if (offending.length > 0) {
      const detail = offending.map(([n, line]) => `  ${rel}:${n}  ${line.trim()}`).join('\n');
      throw new Error(
        `Raw hex colour found in a file that is supposed to use design tokens.\n` +
          `Replace each with a var(--token) from app/globals.css:\n${detail}`,
      );
    }
    expect(offending).toEqual([]);
  });

  it('the benchmark page drives its stat-card accents from tokens', () => {
    const src = read('app/super_admin/payments/page.tsx');
    // The six metric cards each carry a `color:` — all must be token references now.
    const colorValues = [...src.matchAll(/color: '([^']+)'/g)].map((m) => m[1]);
    expect(colorValues.length).toBeGreaterThanOrEqual(6);
    for (const value of colorValues) {
      expect(value.startsWith('var(--')).toBe(true);
    }
  });
});

describe('P2-1: the clean-file allowlist only grows', () => {
  it('contains no duplicates', () => {
    expect(CLEAN_FILES).toEqual([...new Set(CLEAN_FILES)]);
  });

  it('lists only files that exist', () => {
    for (const rel of CLEAN_FILES) {
      expect(fs.existsSync(path.join(process.cwd(), rel))).toBe(true);
    }
  });
});

describe('P2-19: documented colour-token exclusions', () => {
  it('every excluded file exists and is not also in the clean allowlist', () => {
    for (const rel of Object.keys(EXCLUDED_FILES)) {
      expect(fs.existsSync(path.join(process.cwd(), rel))).toBe(true);
      expect(CLEAN_FILES).not.toContain(rel);
    }
  });

  it('each exclusion carries a non-empty reason', () => {
    for (const reason of Object.values(EXCLUDED_FILES)) {
      expect(reason.trim().length).toBeGreaterThan(0);
    }
  });
});
