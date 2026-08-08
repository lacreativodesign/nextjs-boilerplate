import fs from 'fs';
import path from 'path';

/**
 * UI-2 regression guard: super_admin section chrome.
 *
 * The layout rendered a generic `<h1 class="page-title">Super Admin</h1>` and 14 of
 * the 19 child pages rendered their own page-title underneath it, so every one of
 * those pages showed two stacked h1s. `/super_admin/tickets` was also missing from
 * the layout's TABS array, so no tab highlighted when it was open and the page was
 * unreachable from the tab bar. On top of that, pages used three competing heading
 * conventions and the ticket status filters used `btn subtle` with an inline
 * borderColor instead of the shared `.tab-pill` control.
 *
 * The rule these tests pin: navigation chrome belongs to the layout, the heading
 * belongs to the page, and there is exactly one of each.
 */

const SUPER_ADMIN_DIR = path.join(process.cwd(), 'app/super_admin');
const read = (abs: string) => fs.readFileSync(abs, 'utf8');

const listPages = (): Array<{ rel: string; abs: string }> => {
  const out: Array<{ rel: string; abs: string }> = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) walk(next);
      else if (entry.name === 'page.tsx') {
        out.push({ rel: path.relative(process.cwd(), next), abs: next });
      }
    }
  };
  walk(SUPER_ADMIN_DIR);
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
};

const PAGES = listPages();
const LAYOUT = read(path.join(SUPER_ADMIN_DIR, 'layout.tsx'));
const countPageTitles = (src: string) => src.split('className="page-title"').length - 1;

describe('super_admin: exactly one page heading per screen', () => {
  it('finds the whole section so a new page cannot skip these rules', () => {
    expect(PAGES.length).toBeGreaterThanOrEqual(19);
  });

  it('the layout renders no page-title of its own', () => {
    // A heading here stacks above every child page's heading.
    expect(countPageTitles(LAYOUT)).toBe(0);
    expect(LAYOUT).not.toContain('<h1 className="page-title">Super Admin</h1>');
  });

  it.each(PAGES.map((p) => p.rel))('%s renders exactly one page-title', (rel) => {
    expect(countPageTitles(read(path.join(process.cwd(), rel)))).toBe(1);
  });

  it.each(PAGES.map((p) => p.rel))('%s uses the shared heading class, not an ad-hoc one', (rel) => {
    const src = read(path.join(process.cwd(), rel));
    // The three conventions that were in use before: page-title, a raw text-2xl h1,
    // and an h2 acting as the page heading. Only the shared class is allowed.
    expect(src).not.toContain('<h1 className="text-2xl font-bold text-[var(--text-primary)]">');
  });

  it('no page wraps itself in a second page frame inside AppShell', () => {
    // AppShell already provides the width and padding. A nested
    // `mx-auto max-w-4xl px-4 py-8` made two pages narrower than the rest.
    for (const { rel, abs } of PAGES) {
      expect({
        rel,
        hasNestedFrame: read(abs).includes('mx-auto w-full max-w-4xl px-4 py-8'),
      }).toEqual({ rel, hasNestedFrame: false });
    }
  });
});

describe('super_admin: the tab bar reaches every page', () => {
  const tabHrefs = Array.from(LAYOUT.matchAll(/href: '(\/super_admin[^']*)'/g)).map((m) => m[1]);

  it('includes Support Tickets', () => {
    expect(tabHrefs).toContain('/super_admin/tickets');
    expect(LAYOUT).toContain("label: 'Support Tickets'");
  });

  it('every tab target is a real page', () => {
    for (const href of tabHrefs) {
      const rel = href.replace('/super_admin', '').replace(/^\//, '');
      const abs = rel
        ? path.join(SUPER_ADMIN_DIR, rel, 'page.tsx')
        : path.join(SUPER_ADMIN_DIR, 'page.tsx');
      expect({ href, exists: fs.existsSync(abs) }).toEqual({ href, exists: true });
    }
  });

  it('every top-level page is reachable from the tab bar', () => {
    const topLevel = PAGES.map((p) => p.rel)
      .map((rel) => rel.replace('app/super_admin', '').replace('/page.tsx', ''))
      // Detail routes are reached from their list page, not the tab bar.
      .filter((seg) => !seg.includes('[') && seg.split('/').filter(Boolean).length <= 1);

    for (const seg of topLevel) {
      expect({ page: seg || '/', inTabs: tabHrefs.includes(`/super_admin${seg}`) }).toEqual({
        page: seg || '/',
        inTabs: true,
      });
    }
  });
});

describe('super_admin: tickets uses the shared filter control', () => {
  const TICKETS = read(path.join(SUPER_ADMIN_DIR, 'tickets/page.tsx'));

  it('filters render as tab-pill, matching the section tab bar', () => {
    expect(TICKETS).toContain('tab-pill');
    expect(TICKETS).not.toContain('className="btn subtle"');
    expect(TICKETS).not.toContain('className="btn subtle capitalize"');
  });

  it('no inline borderColor stands in for the active state', () => {
    expect(TICKETS).not.toContain("borderColor: 'var(--erp-blue)'");
  });

  it('the filter row is an accessible tablist', () => {
    expect(TICKETS).toContain('role="tablist"');
    expect(TICKETS).toContain('aria-selected={statusFilter');
  });
});
