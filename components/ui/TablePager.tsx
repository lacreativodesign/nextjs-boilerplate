'use client';

import React from 'react';
import { DEFAULT_PAGE_SIZE, getPageInfo } from '@/lib/ui/paginate';

export type TablePagerProps = {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  /** Omit to hide the rows-per-page control. */
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  /** Plural noun for the range readout — "142 invoices". */
  itemLabel?: string;
  className?: string;
};

const DEFAULT_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * DS-4 — the one table pager.
 *
 * Modelled on `/super_admin/payments`, the benchmark, but with the readout it was
 * missing: that page shows "Page 3 of 8", which tells you nothing about how much data
 * you are looking at. This shows "51–75 of 187 tenants" as well, which is the number
 * people actually want, and adds a rows-per-page control so a wide screen is not stuck
 * at whatever constant the page happened to hard-code.
 *
 * Renders nothing on a single page of results — a pager under a five-row table is noise.
 */
export default function TablePager({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_SIZE_OPTIONS,
  itemLabel = 'results',
  className = '',
}: TablePagerProps) {
  const info = getPageInfo(totalItems, page, pageSize || DEFAULT_PAGE_SIZE);

  if (info.totalPages <= 1 && !onPageSizeChange) return null;

  return (
    <nav
      aria-label="Pagination"
      className={`flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-ink-muted ${className}`.trim()}
    >
      <p aria-live="polite" className="tabular-nums">
        {info.totalItems === 0
          ? `No ${itemLabel}`
          : `${info.firstRow}–${info.lastRow} of ${info.totalItems} ${itemLabel}`}
      </p>

      <div className="flex items-center gap-3">
        {onPageSizeChange ? (
          <label className="flex items-center gap-2">
            <span className="hidden sm:inline">Rows</span>
            <select
              className="input h-8 w-auto py-0 text-sm"
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn subtle h-8 px-3 py-0 text-sm"
            disabled={!info.hasPrevious}
            onClick={() => onPageChange(info.page - 1)}
          >
            Previous
          </button>
          <span className="tabular-nums whitespace-nowrap">
            {info.page} / {info.totalPages}
          </span>
          <button
            type="button"
            className="btn subtle h-8 px-3 py-0 text-sm"
            disabled={!info.hasNext}
            onClick={() => onPageChange(info.page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </nav>
  );
}
