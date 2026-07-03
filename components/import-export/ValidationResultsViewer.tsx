'use client';

import type { ImportRowError } from '@/types/import-export';

type Props = {
  totalRows: number;
  errors: ImportRowError[];
};

export default function ValidationResultsViewer({ totalRows, errors }: Props) {
  const errorCount = errors.length;

  return (
    <div className="rounded border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Validation Results</h3>
        <span
          className={`rounded px-2 py-1 text-xs ${errorCount ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}
        >
          {errorCount ? `${errorCount} issues` : 'No issues'}
        </span>
      </div>
      <p className="mb-3 text-xs text-[var(--text-muted)]">Rows checked: {totalRows}</p>
      <div className="max-h-64 overflow-auto text-xs">
        {errors.map((error, index) => (
          <div
            key={`${error.row}-${error.field}-${index}`}
            className="mb-1 rounded bg-neutral-100 px-2 py-1 dark:bg-neutral-800"
          >
            Row {error.row} {error.field ? `(${error.field})` : ''}: {error.message}
          </div>
        ))}
      </div>
    </div>
  );
}
