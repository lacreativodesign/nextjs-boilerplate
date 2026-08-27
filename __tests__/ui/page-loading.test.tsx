import React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import { render, screen } from '@testing-library/react';
import PageLoading from '@/components/ui/PageLoading';

/**
 * DS-27 — route-level loading states.
 *
 * Seventeen modules covering 135 pages had no `loading.tsx`. Without one, navigating
 * between routes leaves the previous page frozen on screen until the next mounts, then
 * swaps the whole thing at once — the platform reads as unresponsive rather than slow.
 * Next.js renders `loading.tsx` for an entire segment, so one small file per module
 * covers every route beneath it.
 *
 * `PageLoading` leads with a title and subtitle placeholder because DS-6 through DS-25
 * gave every page an `h1` and a `.page-subtitle`. Without them the heading pops in above
 * content already occupying the space, which is the jump the skeleton exists to prevent.
 *
 * DS-27 covered the nine largest modules; DS-28 finishes the remaining eight and
 * rewrites the three that predated `PageLoading` — `admin`, `finance` and `projects` —
 * which opened straight into a `SkeletonDashboard` with no title placeholder at all.
 * All twenty modules now ship one, so the shrinking list becomes a rule.
 */

const exists = (rel: string) => fs.existsSync(path.join(process.cwd(), rel));
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const shellModules = () =>
  fs
    .readdirSync(path.join(process.cwd(), 'app'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => {
      const layout = `app/${name}/layout.tsx`;
      return exists(layout) && read(layout).includes('<AppShell');
    })
    .sort();

describe('DS-27: PageLoading', () => {
  it('renders a title and subtitle placeholder', () => {
    // The heading is the first thing on every page since Phase 3; without a
    // placeholder it pops in and pushes the content that arrived first.
    const { container } = render(<PageLoading />);
    expect(container.querySelector('.h-7')).toBeInTheDocument();
    expect(container.querySelector('.h-4')).toBeInTheDocument();
  });

  it('announces itself as busy without reading out the placeholders', () => {
    const { container } = render(<PageLoading />);
    const root = container.firstElementChild;
    expect(root).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading')).toHaveClass('sr-only');
  });

  it('the table variant shows a header row and the requested column count', () => {
    // Standalone, unlike the in-table consumers from DS-26 — the real <thead> is not
    // on screen yet, so the skeleton supplies one.
    const { container } = render(<PageLoading variant="table" rows={3} columns={5} />);
    const grids = Array.from(container.querySelectorAll<HTMLElement>('.grid')).filter((node) =>
      node.style.gridTemplateColumns.includes('repeat(5'),
    );
    // One header row plus the three requested body rows.
    expect(grids).toHaveLength(4);
  });

  it('each variant renders something different', () => {
    const shapes = (['dashboard', 'table', 'form', 'cards'] as const).map((variant) => {
      const { container } = render(<PageLoading variant={variant} />);
      return container.innerHTML;
    });
    expect(new Set(shapes).size).toBe(4);
  });
});

describe('DS-28: route-level coverage is complete', () => {
  it('every module rendering AppShell ships a loading state', () => {
    // The rule, now that the shrinking list has reached zero. A new module without one
    // leaves the previous route frozen on screen during navigation.
    const missing = shellModules().filter((name) => !exists(`app/${name}/loading.tsx`));
    expect(missing).toEqual([]);
  });

  it('all twenty of them use the shared component', () => {
    const bespoke = shellModules().filter(
      (name) =>
        !read(`app/${name}/loading.tsx`).includes(
          "import PageLoading from '@/components/ui/PageLoading'",
        ),
    );
    expect(bespoke).toEqual([]);
  });

  it('none of them renders a skeleton without a title placeholder', () => {
    // app/admin, app/finance and app/projects predated PageLoading and opened straight
    // into a SkeletonDashboard, so the h1 still popped in above content that had
    // already arrived — the jump the skeleton exists to prevent.
    const offenders = shellModules().filter((name) => {
      const source = read(`app/${name}/loading.tsx`);
      return source.includes('SkeletonDashboard') || source.includes('TableSkeleton');
    });
    expect(offenders).toEqual([]);
  });

  it('every loading.tsx still sits beside a real route', () => {
    const walk = (dir: string): string[] => {
      const abs = path.join(process.cwd(), dir);
      if (!fs.existsSync(abs)) return [];
      return fs.readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(rel);
        return entry.name === 'loading.tsx' ? [rel] : [];
      });
    };

    const orphans = walk('app').filter((rel) => {
      const dir = path.dirname(rel);
      return !exists(path.join(dir, 'page.tsx')) && !exists(path.join(dir, 'layout.tsx'));
    });
    expect(orphans).toEqual([]);
  });
});
