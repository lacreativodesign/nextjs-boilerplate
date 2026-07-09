import * as fs from 'fs';
import * as path from 'path';

/**
 * Help Center fixes gate (AI-0c).
 *
 * Two bugs: (1) article cards linked to href="#" (dead), so no guide could be
 * opened from the Help Center home; they now link to the real article route
 * /help/{categoryId}/{article.slug}. (2) Home search filtered by article title
 * only; it now matches title, excerpt, and keywords so topic/synonym searches
 * surface the right guide. The article route path is verified against the
 * actual [category]/[slug] segment layout.
 */

const read = (relative: string): string =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');
const exists = (relative: string): boolean =>
  fs.existsSync(path.join(process.cwd(), relative));

describe('Help Center article cards link to real guides', () => {
  const source = read('components/help-center/HelpCenterPageContent.tsx');

  it('no longer uses a dead href="#" for article cards', () => {
    expect(source).not.toContain('href="#"');
  });

  it('links to the article route /help/{categoryId}/{slug}', () => {
    expect(source).toContain('href={`/help/${categoryId}/${article.slug}`}');
  });

  it('the target article route exists at [category]/[slug]', () => {
    expect(exists('app/help/[category]/[slug]/page.tsx')).toBe(true);
  });
});

describe('Help Center home search matches more than the title', () => {
  const source = read('components/help-center/HelpCenterPageContent.tsx');

  it('search haystack includes title, excerpt, and keywords', () => {
    expect(source).toContain('article.excerpt');
    expect(source).toContain('article.keywords');
    // The old title-only filter is gone.
    expect(source).not.toContain(
      'article.title.toLowerCase().includes(normalizedSearchQuery),',
    );
  });
});
