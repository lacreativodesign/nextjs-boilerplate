/**
 * DS-4 — pagination arithmetic, kept out of components.
 *
 * 89 tables render every row they fetch. The seven that do paginate each recompute
 * `Math.ceil(total / size)` and the slice bounds inline, and the page-size constants
 * across the repo range from 20 to 1000 with no reasoning attached.
 *
 * The off-by-one hazards live here rather than in eleven page components: an empty
 * result still has one page, a page index past the end clamps instead of rendering a
 * blank table, and the human-readable range is 1-based while the slice is 0-based.
 */

export type PageInfo = {
  /** Clamped to 1..totalPages, so a stale page index cannot blank the table. */
  page: number;
  totalPages: number;
  totalItems: number;
  /** 0-based, for Array.prototype.slice. */
  startIndex: number;
  endIndex: number;
  /** 1-based inclusive, for display. Both 0 when there are no items. */
  firstRow: number;
  lastRow: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

export const DEFAULT_PAGE_SIZE = 25;

export function getPageInfo(totalItems: number, page: number, pageSize: number): PageInfo {
  const safeSize = Math.max(1, Math.floor(pageSize) || DEFAULT_PAGE_SIZE);
  const safeTotal = Math.max(0, Math.floor(totalItems) || 0);
  // An empty table is still "Page 1 of 1" — reporting 0 pages reads like an error.
  const totalPages = Math.max(1, Math.ceil(safeTotal / safeSize));
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);

  const startIndex = (safePage - 1) * safeSize;
  const endIndex = Math.min(startIndex + safeSize, safeTotal);

  return {
    page: safePage,
    totalPages,
    totalItems: safeTotal,
    startIndex,
    endIndex,
    firstRow: safeTotal === 0 ? 0 : startIndex + 1,
    lastRow: endIndex,
    hasPrevious: safePage > 1,
    hasNext: safePage < totalPages,
  };
}

/** Slices a already-filtered array to the current page. */
export function pageSlice<T>(items: T[], page: number, pageSize: number): T[] {
  const { startIndex, endIndex } = getPageInfo(items.length, page, pageSize);
  return items.slice(startIndex, endIndex);
}
