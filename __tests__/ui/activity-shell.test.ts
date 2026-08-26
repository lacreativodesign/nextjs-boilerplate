import * as fs from 'fs';
import * as path from 'path';

/**
 * DS-14 — the third parallel shell, and a superseded route.
 *
 * `app/activity/layout.tsx` imported `AppShell` on line 7 and never rendered it. It
 * built its own 250px dark aside, its own header and its own logout button — the same
 * template as the `hierarchy` and `team` layouts removed in S10. Those two held a
 * layout and no page, so neither route ever existed; this one has a page, so it
 * rendered. `/activity` showed no Bizosto sidebar, no breadcrumbs, no notification
 * bell and no theme toggle.
 *
 * Its five-item nav pointed at four routes that were never created — `/activity/logs`,
 * `/activity/actions`, `/activity/errors` and `/activity/notifications`. Rather than
 * rebuild dead links as a `.tabs-bar`, the nav is gone: `/activity` is a single-page
 * module, and AppShell's own sidebar is its navigation.
 *
 * It also produced two `h1`s on the route: "Activity Monitoring" from the layout and
 * "Activity Timeline" from `app/activity/page.tsx`. Dropping the layout's leaves the
 * page as the single owner. Note that `components/activity/ActivityPage.tsx` is a
 * different, prop-driven component whose consumer is `/admin/activity` — it is not
 * what this route renders.
 *
 * `app/dashboard/notifications/page.tsx` is deleted. F4/NOT-02 replaced it with the
 * role-neutral `/notifications` inbox because the dashboard copy was admin-only and
 * bounced the other nine roles; the file was left behind, byte-identical at 207 lines.
 * Its one live inbound reference was the `deepLink` written by
 * `app/api/users/notifications/test/route.ts`, now repointed at `/notifications`.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(process.cwd(), rel));

// The layout's docblock names the routes it stopped linking, so the dead-link guard
// has to read code rather than prose.
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// Both extensions: the only live link to the deleted route lived in a `route.ts`, so a
// .tsx-only sweep would have reported clean while the deep link still pointed at it.
const walk = (dir: string): string[] => {
  const abs = path.join(process.cwd(), dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(rel);
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [rel] : [];
  });
};

describe('DS-14: /activity renders inside the real shell', () => {
  const layout = read('app/activity/layout.tsx');

  it('renders AppShell rather than only importing it', () => {
    expect(layout).toContain('<AppShell>');
  });

  it('no longer builds its own sidebar, header or logout', () => {
    expect(layout).not.toContain('<aside');
    expect(layout).not.toContain('<header');
    expect(layout).not.toContain('/api/logout');
  });

  it('links no route that was never created', () => {
    const code = stripComments(layout);
    for (const dead of [
      '/activity/logs',
      '/activity/actions',
      '/activity/errors',
      '/activity/notifications',
    ]) {
      expect({ dead, linked: code.includes(dead) }).toEqual({ dead, linked: false });
    }
  });

  it.each(['logs', 'actions', 'errors', 'notifications'])(
    '/activity/%s still has no page, which is why the nav went',
    (segment) => {
      // If one of these is ever added it will be unreachable from the shell, so this
      // failing is the prompt to reinstate a .tabs-bar for the module.
      expect(exists(`app/activity/${segment}/page.tsx`)).toBe(false);
    },
  );

  it('leaves the route with exactly one h1 owner', () => {
    expect(layout).not.toContain('<h1');
    expect(read('app/activity/page.tsx')).toContain(
      '<h1 className="page-title">Activity Timeline</h1>',
    );
  });
});

describe('DS-14: every layout that imports AppShell renders it', () => {
  it('there are no import-only shells left', () => {
    const offenders = walk('app')
      .filter((rel) => rel.endsWith('layout.tsx'))
      .filter((rel) => {
        const source = read(rel);
        return source.includes('import AppShell') && !/<AppShell[\s>]/.test(source);
      });
    expect(offenders).toEqual([]);
  });

  it('no layout builds a competing sidebar', () => {
    // hierarchy and team (S10) and activity (here) each hand-rolled one.
    const offenders = walk('app')
      .filter((rel) => rel.endsWith('layout.tsx'))
      .filter((rel) => /<aside/.test(read(rel)));
    expect(offenders).toEqual([]);
  });
});

describe('DS-14: the superseded notifications page is gone', () => {
  it('app/dashboard/notifications no longer exists', () => {
    expect(exists('app/dashboard/notifications/page.tsx')).toBe(false);
  });

  it('the role-neutral inbox survives and is what the bell links to', () => {
    expect(exists('app/notifications/page.tsx')).toBe(true);
    expect(read('components/notifications/NotificationDrawer.tsx')).toContain(
      'href="/notifications"',
    );
  });

  it('nothing links to the deleted route', () => {
    const offenders = [...walk('app'), ...walk('components'), ...walk('lib')].filter((rel) =>
      read(rel).includes('/dashboard/notifications'),
    );
    expect(offenders).toEqual([]);
  });

  it('the test-notification deep link points at the surviving inbox', () => {
    expect(read('app/api/users/notifications/test/route.ts')).toContain(
      "deepLink: '/notifications'",
    );
  });
});
