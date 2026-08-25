import * as fs from 'fs';
import * as path from 'path';

/**
 * DS-8 — the headings that no stylesheet could reach.
 *
 * Six admin pages sized their h1 from a JavaScript object rather than a class:
 * `headerStyle` in the three `admin/users` pages, `styles.pageTitle` in the two
 * `admin/clients` pages, and a bare object literal in `admin/jobs`.
 *
 * Five of the six were `{ fontSize: 34, fontWeight: 900 }` — the TOP of
 * `.page-title`'s `clamp(24px, 2.4vw, 34px)`, pinned. So the rest of the platform
 * scaled its title down to 24px on a narrow viewport and these six stayed at 34px,
 * which is exactly where a long title like "User Roles & Hierarchy" starts to wrap.
 * `admin/jobs` went the other way at 24px/700, below every other page.
 *
 * None of it was reachable by a theme, a media query, or a token.
 */

const DS8_PAGES = [
  'app/admin/users/create/page.tsx',
  'app/admin/users/[uid]/edit/page.tsx',
  'app/admin/users/roles/page.tsx',
  'app/admin/clients/add/page.tsx',
  'app/admin/clients/[id]/edit/page.tsx',
  'app/admin/jobs/page.tsx',
];

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('DS-8: admin headings are class-driven', () => {
  it.each(DS8_PAGES)('%s renders <h1 className="page-title">', (rel) => {
    const source = read(rel);
    expect(source).toContain('<h1 className="page-title">');
    const classes = Array.from(source.matchAll(/<h1[^>]*className="([^"]*)"/g)).map((m) => m[1]);
    expect({ rel, classes }).toEqual({ rel, classes: classes.map(() => 'page-title') });
  });

  it.each(DS8_PAGES)('%s has no inline-styled h1', (rel) => {
    expect({ rel, inline: /<h1[^>]*style=\{/.test(read(rel)) }).toEqual({ rel, inline: false });
  });

  it('no page pins the title to the top of the clamp', () => {
    // `fontSize: 34, fontWeight: 900` is clamp(24px, 2.4vw, 34px) with the responsive
    // behaviour removed.
    for (const rel of DS8_PAGES) {
      const source = read(rel);
      expect({ rel, pinned: /fontSize: 34,\s*\n?\s*fontWeight: 900/.test(source) }).toEqual({
        rel,
        pinned: false,
      });
    }
  });

  it('the dead style objects are gone, not just unused', () => {
    // Leaving them would trip no-unused-vars and re-tempt the next editor.
    for (const rel of ['app/admin/users/create/page.tsx', 'app/admin/users/roles/page.tsx']) {
      expect({ rel, found: read(rel).includes('const headerStyle') }).toEqual({
        rel,
        found: false,
      });
    }
    for (const rel of ['app/admin/clients/add/page.tsx', 'app/admin/clients/[id]/edit/page.tsx']) {
      expect({ rel, found: read(rel).includes('const pageTitle') }).toEqual({ rel, found: false });
    }
  });

  it('subtitles are paragraphs using .page-subtitle', () => {
    // Both clients pages rendered the subtitle as a <div>, so it carried no
    // paragraph semantics at all.
    for (const rel of DS8_PAGES) {
      const source = read(rel);
      expect({ rel, subtitle: source.includes('className="page-subtitle mt-2"') }).toEqual({
        rel,
        subtitle: true,
      });
    }
  });
});
