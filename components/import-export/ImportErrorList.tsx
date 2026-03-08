"use client";

import type { ImportRowError } from "@/types/import-export";

type Props = {
  errors: ImportRowError[];
  downloadUrl?: string;
};

export default function ImportErrorList({ errors, downloadUrl }: Props) {
  return (
    <div className="rounded border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Import Errors</h3>
        {downloadUrl ? (
          <a href={downloadUrl} className="text-xs text-blue-600 hover:underline">
            Download CSV
          </a>
        ) : null}
      </div>
      <ul className="max-h-60 space-y-1 overflow-auto text-xs">
        {errors.map((error, idx) => (
          <li key={`${error.row}-${error.field}-${idx}`} className="rounded bg-neutral-100 px-2 py-1 dark:bg-neutral-800">
            Row {error.row} - {error.code}: {error.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
