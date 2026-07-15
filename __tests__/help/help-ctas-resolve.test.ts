import * as fs from 'fs';
import * as path from 'path';

/**
 * S24 — every call-to-action in the help center goes somewhere real.
 *
 * The help center's quick links pointed at external sites that do not exist yet
 * (docs.bizosto.com, bizosto.com/tutorials, bizosto.com/community). Each opened a new tab to a
 * dead destination — the worst place to break a link, because it is exactly where a confused
 * customer lands when they are already stuck. They now point at destinations that ship today:
 * the guide library on the page, the help search, and the support flow.
 *
 * This test fails the build if a help CTA ever again points at an unbuilt external Bizosto
 * marketing/docs domain, and confirms the internal targets it now uses actually resolve.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(process.cwd(), rel));

describe('S24: help center CTAs resolve', () => {
  const page = read('components/help-center/HelpCenterPageContent.tsx');

  it('no quick link points at an unbuilt external bizosto domain', () => {
    expect(page).not.toContain('docs.bizosto.com');
    expect(page).not.toContain('bizosto.com/tutorials');
    expect(page).not.toContain('bizosto.com/community');
  });

  it('the quick links point at destinations that exist in the app', () => {
    expect(page).toContain("href: '/help/search'");
    expect(exists('app/help/search/page.tsx')).toBe(true);

    expect(page).toContain("href: '#help-guide-search'");
    expect(page).toContain('id="help-guide-search"');

    expect(page).toContain("href: '/help/search?q=contact%20support'");
  });

  it('internal quick links do not open a new browser tab', () => {
    const quickLinksRender = page.slice(page.indexOf('aria-label="Quick links"'));
    const firstAnchor = quickLinksRender.slice(0, quickLinksRender.indexOf('</a>'));
    expect(firstAnchor).not.toContain('target="_blank"');
  });
});
