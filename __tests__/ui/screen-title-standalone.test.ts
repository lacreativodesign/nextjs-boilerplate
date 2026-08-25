import * as fs from 'fs';
import * as path from 'path';

/**
 * DS-10 — standalone screens, and two shells that never rendered.
 *
 * The h1 work in DS-6 through DS-9 covered every page inside AppShell. What was left
 * is a different kind of page: centred, full-viewport, single-purpose — an error, a
 * 404, an offline notice, a payment result, a signup step. `.page-title` is wrong for
 * those. At `clamp(24px, 2.4vw, 34px)`/900 it reads as shouting inside a 360px card,
 * and it is left-aligned by intent.
 *
 * These eight screens previously sized themselves in six different ways between 20px
 * and 30px, four of them from inline style objects. `.screen-title` gives them one
 * treatment without dragging the dashboard header size onto an error card.
 *
 * Separately: `app/hierarchy/` and `app/team/` each held a `layout.tsx` and no
 * `page.tsx`. In the App Router that generates no route, so both 404'd. Each defined a
 * complete parallel application shell — its own sidebar, header and logout button,
 * roughly 100 lines of inline styles, bypassing AppShell entirely. Neither appeared in
 * sidebarConfig or the route contract, and nothing in the codebase linked to them.
 */

const STANDALONE_SCREENS = [
  'app/error.tsx',
  'app/not-found.tsx',
  'app/offline/page.tsx',
  'app/unauthorized/page.tsx',
  'app/pay/[invoiceId]/page.tsx',
  'app/set-password/page.tsx',
  'app/signup/page.tsx',
  'app/invite/[token]/page.tsx',
  'app/client/accept-invite/page.tsx',
];

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(process.cwd(), rel));
const headingClasses = (source: string) =>
  Array.from(source.matchAll(/<h1[^>]*className="([^"]*)"/g)).map((m) => m[1]);

describe('DS-10: the screen-title treatment exists', () => {
  const css = read('app/globals.css');

  it('globals.css defines .screen-title and .screen-subtitle', () => {
    expect(css).toContain('.screen-title {');
    expect(css).toContain('.screen-subtitle {');
  });

  it('it is smaller and lighter than .page-title', () => {
    // .page-title is clamp(24px, 2.4vw, 34px)/900 — a dashboard header, not an
    // error card.
    const rule = css.slice(css.indexOf('.screen-title {'));
    const body = rule.slice(0, rule.indexOf('}'));
    expect(body).toContain('font-size: 24px');
    expect(body).toContain('font-weight: 800');
  });

  it('it reads a token rather than a fixed colour', () => {
    const rule = css.slice(css.indexOf('.screen-title {'));
    expect(rule.slice(0, rule.indexOf('}'))).toContain('var(--text-primary)');
  });
});

describe('DS-10: standalone screens use it', () => {
  it.each(STANDALONE_SCREENS)('%s uses .screen-title for every h1', (rel) => {
    const classes = headingClasses(read(rel));
    expect(classes.length).toBeGreaterThan(0);
    for (const className of classes) {
      expect({ rel, className, ok: className.split(' ').includes('screen-title') }).toEqual({
        rel,
        className,
        ok: true,
      });
    }
  });

  it.each(STANDALONE_SCREENS)('%s has no inline-styled h1', (rel) => {
    // unauthorized, pay (x2) and set-password each sized theirs from a style object.
    expect({ rel, inline: /<h1[^>]*style=\{/.test(read(rel)) }).toEqual({ rel, inline: false });
  });

  it('no standalone screen borrows the in-shell page title', () => {
    // app/invite/[token] used `page-title mb-6` despite rendering outside the shell.
    for (const rel of STANDALONE_SCREENS) {
      for (const className of headingClasses(read(rel))) {
        expect({ rel, className, borrowed: className.split(' ').includes('page-title') }).toEqual({
          rel,
          className,
          borrowed: false,
        });
      }
    }
  });

  it('error and not-found no longer use --text-slate-deep for the heading', () => {
    // A fixed #1e293b, so both headings stayed near-black on a dark surface.
    for (const rel of ['app/error.tsx', 'app/not-found.tsx']) {
      const heading = read(rel).match(/<h1[^>]*>/)?.[0] ?? '';
      expect({ rel, heading, fixed: heading.includes('text-slate-deep') }).toEqual({
        rel,
        heading,
        fixed: false,
      });
    }
  });

  it('the client invite error uses the danger token, not a raw red', () => {
    expect(read('app/client/accept-invite/page.tsx')).not.toContain('text-red-400');
  });
});

describe('DS-10: the two routeless shells are gone', () => {
  it('app/hierarchy and app/team no longer exist', () => {
    expect({
      hierarchy: exists('app/hierarchy'),
      team: exists('app/team'),
    }).toEqual({ hierarchy: false, team: false });
  });

  it('nothing links to them', () => {
    const walk = (dir: string): string[] => {
      const abs = path.join(process.cwd(), dir);
      if (!fs.existsSync(abs)) return [];
      return fs.readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(rel);
        return /\.(ts|tsx)$/.test(entry.name) ? [rel] : [];
      });
    };

    const offenders = [...walk('app'), ...walk('components'), ...walk('lib')].filter((rel) =>
      /['"]\/(hierarchy|team)(['"/])/.test(read(rel)),
    );
    expect(offenders).toEqual([]);
  });
});
