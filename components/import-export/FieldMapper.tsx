'use client';

import { useState } from 'react';

type SystemField = { key: string; label: string; required: boolean };

type FieldMapperProps = {
  fileHeaders: string[];
  systemFields: SystemField[];
  onMap: (mapping: Record<string, string>) => void;
};

export function FieldMapper({ fileHeaders, systemFields, onMap }: FieldMapperProps) {
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const missingRequired = systemFields.filter((field) => field.required && !mapping[field.key]);

  return (
    <div className="space-y-4">
      {systemFields.map((field) => (
        <div key={field.key} className="flex items-center gap-4">
          <div className="w-1/3">
            <label className="font-medium" htmlFor={`field-map-${field.key}`}>
              {field.label}
              {field.required ? <span className="ml-1 text-red-500">*</span> : null}
            </label>
          </div>
          <select
            id={`field-map-${field.key}`}
            className="w-2/3 rounded border px-3 py-2"
            value={mapping[field.key] || ''}
            onChange={(event) => setMapping({ ...mapping, [field.key]: event.target.value })}
          >
            <option value="">-- Skip --</option>
            {fileHeaders.map((header) => (
              <option key={header} value={header}>
                {header}
              </option>
            ))}
          </select>
        </div>
      ))}

      {missingRequired.length > 0 ? (
        <p className="text-sm text-red-600">Map all required fields before continuing.</p>
      ) : null}

      <button
        type="button"
        onClick={() => onMap(mapping)}
        className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        disabled={missingRequired.length > 0}
      >
        Continue
      </button>
    </div>
  );
}
