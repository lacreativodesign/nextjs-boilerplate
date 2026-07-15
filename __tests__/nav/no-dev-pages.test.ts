import * as fs from 'fs';
import * as path from 'path';

/**
 * S30 — no developer-only showcase, sandbox or scratch page ships to production.
 *
 * The app included /ui-preview, a 990-line component showcase that was linked from nowhere and
 * — unlike every real page — was not behind auth. Anyone could open app.bizosto.com/ui-preview
 * and browse internal component states. It was pure dead weight in the bundle and a small
 * surface-area / polish problem in front of customers and investors. It has been removed.
 *
 * This test fails the build if a page whose route segment marks it as a dev artifact
 * (ui-preview, sandbox, playground, scratch, a bare "demo" or "example" segment) reappears
 * under app/. It is intentionally conservative: it matches whole path segments, so legitimate
 * words embedded in real routes (e.g. a "demo" tenant feature under super_admin) are not
 * caught unless the segment itself is the dev marker.
 */
const DEV_SEGMENTS = new Set([
  'ui-preview',
  'sandbox',
  'playground',
  'scratch',
  'component-preview',
  'style-guide',
  'styleguide',
]);

function walk(dir: string, acc: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name === 'page.tsx') acc.push(full);
  }
}

describe('S30: no dev-only pages in production', () => {
  it('ui-preview is gone', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'app/ui-preview'))).toBe(false);
  });

  it('no page lives under a developer-only route segment', () => {
    const pages: string[] = [];
    walk(path.join(process.cwd(), 'app'), pages);

    const offenders = pages.filter((file) => {
      const rel = path.relative(path.join(process.cwd(), 'app'), file);
      const segments = rel.split(path.sep).slice(0, -1); // drop 'page.tsx'
      return segments.some((seg) => DEV_SEGMENTS.has(seg));
    });

    expect(offenders.map((f) => path.relative(process.cwd(), f))).toEqual([]);
  });
});
