'use client';

import { useMemo, useState } from 'react';
import type { ImportFieldMapping } from '@/types/import-export';

type Props = {
  sourceColumns: string[];
  destinationFields: string[];
  value: ImportFieldMapping[];
  onChange: (mappings: ImportFieldMapping[]) => void;
};

export default function FieldMappingInterface({
  sourceColumns,
  destinationFields,
  value,
  onChange,
}: Props) {
  const mappedBySource = useMemo(
    () => new Map(value.map((item) => [item.sourceColumn, item])),
    [value],
  );
  const [activeSource, setActiveSource] = useState<string | null>(null);

  const updateMapping = (source: string, destination: string) => {
    const next = value.filter(
      (item) => item.sourceColumn !== source && item.destinationField !== destination,
    );
    next.push({ sourceColumn: source, destinationField: destination, transform: 'string' });
    onChange(next);
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded border p-3">
        <h4 className="mb-2 text-sm font-semibold">Source columns</h4>
        <div className="space-y-2">
          {sourceColumns.map((column) => (
            <button
              key={column}
              type="button"
              onClick={() => setActiveSource(column)}
              className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm ${
                activeSource === column
                  ? 'bg-blue-100 dark:bg-blue-900/30'
                  : 'bg-neutral-100 dark:bg-neutral-800'
              }`}
            >
              <span>{column}</span>
              <span className="text-xs text-[var(--text-muted)]">
                {mappedBySource.get(column)?.destinationField || 'unmapped'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded border p-3">
        <h4 className="mb-2 text-sm font-semibold">Destination fields</h4>
        <div className="space-y-2">
          {destinationFields.map((field) => (
            <button
              key={field}
              type="button"
              disabled={!activeSource}
              onClick={() => activeSource && updateMapping(activeSource, field)}
              className="flex w-full items-center justify-between rounded bg-neutral-100 px-3 py-2 text-left text-sm dark:bg-neutral-800 disabled:opacity-50"
            >
              <span>{field}</span>
              <span className="text-xs text-[var(--text-muted)]">
                {value.find((item) => item.destinationField === field)?.sourceColumn || 'unmapped'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
