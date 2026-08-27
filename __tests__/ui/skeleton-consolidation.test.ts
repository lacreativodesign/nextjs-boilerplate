import * as fs from 'fs';
import * as path from 'path';

/**
 * DS-26 — one skeleton library, and a route group that owned no routes.
 *
 * Two parallel skeleton systems existed: `components/ui/Skeleton.tsx` with 23
 * consumers, and `components/ui/skeleton/` with three. Both exported a component named
 * `TableSkeleton`, so `app/admin/sales/deals` rendered a visibly different placeholder
 * from every other table on the platform while importing what looked like the same
 * thing.
 *
 * The directory version was the better of the two — a CSS grid matching the real
 * column count, an optional header row, `aria-hidden`. The canonical one laid cells out
 * with `flex-1`, so the placeholder columns did not line up with the table's and the
 * row re-flowed the moment data arrived. So the good implementation was absorbed into
 * the canonical file rather than deleted.
 *
 * `showHeader` defaults to false: three of the five consumers render inside a
 * `<td colSpan>` where the real header is already on screen.
 *
 * Separately, `app/(modules)/` held a layout, three `loading.tsx` and three `error.tsx`
 * — and no `page.tsx` anywhere. Route groups do not appear in the URL, so
 * `(modules)/finance` declared the `/finance` segment alongside the real `app/finance`
 * without owning a page, and `(modules)/crm` pointed at a `/crm` route that does not
 * exist in the app at all. Its two live loading states are re-created under the real
 * module directories.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(process.cwd(), rel));

const walk = (dir: string): string[] => {
  const abs = path.join(process.cwd(), dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(rel);
    return /\.tsx?$/.test(entry.name) ? [rel] : [];
  });
};

describe('DS-26: one skeleton library', () => {
  it('the duplicate directory is gone', () => {
    expect({
      dir: exists('components/ui/skeleton'),
      canonical: exists('components/ui/Skeleton.tsx'),
    }).toEqual({ dir: false, canonical: true });
  });

  it('nothing imports the duplicate', () => {
    const offenders = [...walk('app'), ...walk('components'), ...walk('lib')].filter((rel) =>
      read(rel).includes('components/ui/skeleton/'),
    );
    expect(offenders).toEqual([]);
  });

  it('the canonical TableSkeleton aligns to the real column count', () => {
    // `flex-1` gave every placeholder cell equal width regardless of the table's
    // columns, so the row re-flowed when data replaced it.
    const source = read('components/ui/Skeleton.tsx');
    const fn = source.slice(source.indexOf('export function TableSkeleton'));
    expect(fn).toContain('gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`');
    expect(fn).not.toContain('flex-1');
  });

  it('it is hidden from assistive tech', () => {
    const source = read('components/ui/Skeleton.tsx');
    const fn = source.slice(source.indexOf('export function TableSkeleton'));
    expect(fn.slice(0, fn.indexOf('export function ListSkeleton'))).toContain('aria-hidden="true"');
  });

  it('showHeader defaults to false, so the in-table consumers do not double up', () => {
    // app/sales/deals, app/admin/finance/invoices and /payments all render inside a
    // <td colSpan> beneath a real <thead>.
    const source = read('components/ui/Skeleton.tsx');
    const fn = source.slice(source.indexOf('export function TableSkeleton'));
    expect(fn).toContain('showHeader = false');
  });

  it('app/admin/sales/deals now uses the canonical one', () => {
    const source = read('app/admin/sales/deals/page.tsx');
    expect(source).toContain("import { TableSkeleton } from '@/components/ui/Skeleton'");
    expect(source).toContain('<TableSkeleton rows={6} columns={9} showHeader={false} />');
  });
});

describe('DS-26: the routeless route group is gone', () => {
  it('app/(modules) no longer exists', () => {
    expect(exists('app/(modules)')).toBe(false);
  });

  it('the two live modules keep a route-level loading state', () => {
    // DS-28 moved both onto the shared PageLoading component; what matters here is only
    // that neither module lost the loading state the deleted group had provided.
    for (const rel of ['app/finance/loading.tsx', 'app/projects/loading.tsx']) {
      expect({ rel, present: exists(rel) }).toEqual({ rel, present: true });
      expect(read(rel)).toMatch(/@\/components\/ui\/(Skeleton|PageLoading)/);
    }
  });

  it('the third pointed at a route that never existed', () => {
    // (modules)/crm declared /crm, and there is no app/crm page or layout.
    expect({ page: exists('app/crm/page.tsx'), layout: exists('app/crm/layout.tsx') }).toEqual({
      page: false,
      layout: false,
    });
  });

  it('every loading.tsx in the app sits beside a real route', () => {
    const orphans = walk('app')
      .filter((rel) => rel.endsWith('loading.tsx'))
      .filter((rel) => {
        const dir = path.dirname(rel);
        return !exists(path.join(dir, 'page.tsx')) && !exists(path.join(dir, 'layout.tsx'));
      });
    expect(orphans).toEqual([]);
  });
});
