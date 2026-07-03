'use client';

import { useState } from 'react';
import type { ExportConfiguration } from '@/types/import-export';

type Props = {
  open: boolean;
  availableFields: { sourceField: string; label: string }[];
  onClose: () => void;
  onSubmit: (config: ExportConfiguration) => void;
};

export default function ExportConfigurationModal({
  open,
  availableFields,
  onClose,
  onSubmit,
}: Props) {
  const [selected, setSelected] = useState<string[]>(
    availableFields.slice(0, 5).map((field) => field.sourceField),
  );
  const [format, setFormat] = useState<'csv' | 'excel'>('csv');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-4 dark:bg-neutral-900">
        <h3 className="mb-3 text-sm font-semibold">Export Configuration</h3>
        <div className="max-h-64 space-y-2 overflow-auto">
          {availableFields.map((field) => (
            <label key={field.sourceField} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(field.sourceField)}
                onChange={(event) => {
                  setSelected((prev) =>
                    event.target.checked
                      ? [...prev, field.sourceField]
                      : prev.filter((entry) => entry !== field.sourceField),
                  );
                }}
              />
              {field.label}
            </label>
          ))}
        </div>

        <div className="mt-4">
          <label className="text-xs">Format</label>
          <select
            className="mt-1 w-full rounded border p-2 text-sm"
            value={format}
            onChange={(event) => setFormat(event.target.value as 'csv' | 'excel')}
          >
            <option value="csv">CSV</option>
            <option value="excel">Excel</option>
          </select>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border px-3 py-2 text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onSubmit({
                format,
                scope: 'all',
                fields: availableFields.filter((field) => selected.includes(field.sourceField)),
                filters: [],
              });
            }}
            className="rounded bg-blue-600 px-3 py-2 text-sm text-white"
          >
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
