import * as fs from 'fs';
import * as path from 'path';

/**
 * DS-1 — design-system baseline.
 *
 * The Aug-2026 design audit scored the platform 62/100 and found the failure was
 * adoption, not the system: `app/globals.css` already ships the tokens and component
 * classes, but two dead stylesheets shadowed them, `--focus-ring` had exactly one
 * consumer, and the reduced-motion guard covered three `.admin-shell` selectors.
 *
 * This test pins the baseline the rest of the remediation builds on, so a later
 * session cannot reintroduce a second stylesheet or drop the focus/motion guards.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(process.cwd(), rel));

describe('DS-1: one stylesheet', () => {
  it('the two unimported stylesheets are gone', () => {
    // `styles.css` (409 lines) redefined `.btn` and `.btn-primary`; `styles/globals.css`
    // redefined --card-bg/--border. Neither was imported, so both were pure drift risk.
    expect({
      'styles.css': exists('styles.css'),
      'styles/globals.css': exists('styles/globals.css'),
    }).toEqual({ 'styles.css': false, 'styles/globals.css': false });
  });

  it('app/layout.tsx imports exactly one stylesheet', () => {
    const layout = read('app/layout.tsx');
    const imports = Array.from(layout.matchAll(/import\s+['"]([^'"]+\.css)['"]/g)).map((m) => m[1]);
    expect(imports).toEqual(['./globals.css']);
  });

  it('the legacy aliases the deleted sheet defined still resolve in app/globals.css', () => {
    // `app/admin/finance/ar` and `app/admin/hr/attendance` read --card-bg / --border.
    const css = read('app/globals.css');
    expect(css).toContain('--card-bg: var(--surface-card)');
    expect(css).toContain('--border: var(--border-subtle)');
  });
});

describe('DS-1: motion tokens', () => {
  const css = read('app/globals.css');

  it('defines the three motion tokens that replace 18 ad-hoc durations', () => {
    for (const token of ['--motion-fast:', '--motion-base:', '--motion-slow:', '--motion-ease:']) {
      expect(css).toContain(token);
    }
  });

  it('honours prefers-reduced-motion globally, not just inside .admin-shell', () => {
    const guard = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    expect(guard).toContain('*,');
    expect(guard).toContain('transition-duration: 0.01ms !important');
    expect(guard).toContain('animation-duration: 0.01ms !important');
  });
});

describe('DS-1: focus is visible outside inputs', () => {
  const css = read('app/globals.css');

  it('every focusable element gets a ring, not just .input', () => {
    expect(css).toContain(':focus-visible');
    expect(css).toContain('outline-offset: 2px');
  });

  it('uses zero-specificity :where() so .input keeps its own focus treatment', () => {
    const rule = css.slice(css.indexOf(':where(a, button, select, textarea, summary, [tabindex])'));
    expect(rule.startsWith(':where(')).toBe(true);
    expect(css).toContain('box-shadow: var(--focus-ring)');
  });
});

describe('DS-1: audit P0 fixes', () => {
  it('the bug-report close button has an accessible name', () => {
    // Was the only unlabelled icon-only button in the repo; screen readers said "button".
    const src = read('components/support/BugReportButton.tsx');
    expect(src).toContain('aria-label="Close bug report"');
  });

  it('the finance dashboard has no unreachable loading branch', () => {
    // The whole subtree already sits inside {loading ? <SkeletonDashboard/> : (…)},
    // so an inner {loading ? 'Loading activity…' : …} could never render.
    const src = read('app/admin/finance/page.tsx');
    expect(src).not.toContain('Loading activity');
  });
});

describe('DS-1: Support Tickets lives on the Platform tab only', () => {
  it('is not a sidebar nav entry', () => {
    const config = read('lib/navigation/sidebarConfig.ts');
    expect(config).not.toContain("id: 'sa-tickets'");
    expect(config).not.toContain("label: 'Support Tickets'");
  });

  it('is still reachable from the super_admin tab bar', () => {
    // Removing the duplicate must not orphan the page — super-admin-page-chrome
    // asserts every tab target resolves, and this pins the tab itself.
    const layout = read('app/super_admin/layout.tsx');
    expect(layout).toContain("label: 'Support Tickets'");
    expect(layout).toContain("href: '/super_admin/tickets'");
    expect(exists('app/super_admin/tickets/page.tsx')).toBe(true);
  });
});
