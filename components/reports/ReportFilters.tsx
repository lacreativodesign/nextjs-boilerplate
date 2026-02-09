"use client";

import { useState } from "react";
import type { ReportFilter } from "@/types/reports";

const OPERATORS = [
  { value: "equals", label: "Equals" },
  { value: "notEquals", label: "Not equals" },
  { value: "contains", label: "Contains" },
  { value: "notContains", label: "Not contains" },
  { value: "startsWith", label: "Starts with" },
  { value: "endsWith", label: "Ends with" },
  { value: "greaterThan", label: "Greater than" },
  { value: "greaterThanOrEqual", label: "Greater than or equal" },
  { value: "lessThan", label: "Less than" },
  { value: "lessThanOrEqual", label: "Less than or equal" },
  { value: "between", label: "Between" },
  { value: "in", label: "In" },
  { value: "notIn", label: "Not in" },
  { value: "isNull", label: "Is null" },
  { value: "isNotNull", label: "Is not null" },
];

type FilterRow = ReportFilter & { id: string };

export function ReportFilters({
  filters,
  onChange,
  onApply,
}: {
  filters: ReportFilter[];
  onChange: (filters: ReportFilter[]) => void;
  onApply: () => void;
}) {
  const [rows, setRows] = useState<FilterRow[]>(
    filters.length
      ? filters.map((filter, index) => ({ ...filter, id: `${index}-${filter.field}` }))
      : [{ id: "1", field: "", operator: "equals", value: "" }]
  );

  const syncRows = (next: FilterRow[]) => {
    setRows(next);
    onChange(next.map(({ id, ...rest }) => rest));
  };

  const addFilter = () => {
    syncRows([
      ...rows,
      {
        id: Date.now().toString(),
        field: "",
        operator: "equals",
        value: "",
      },
    ]);
  };

  const removeFilter = (id: string) => {
    const next = rows.filter((row) => row.id !== id);
    syncRows(next.length ? next : [{ id: Date.now().toString(), field: "", operator: "equals", value: "" }]);
  };

  const updateFilter = (id: string, key: keyof ReportFilter, value: unknown) => {
    syncRows(rows.map((row) => (row.id === id ? { ...row, [key]: value } : row)));
  };

  return (
    <div className="card mb-6 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Filters</h2>
          <p className="text-xs text-[var(--text-muted)]">
            Use commas for multiple values and "A,B" for between ranges.
          </p>
        </div>
        <button
          type="button"
          onClick={addFilter}
          className="rounded bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
        >
          + Add Filter
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {rows.map((filter) => (
          <div key={filter.id} className="grid gap-2 md:grid-cols-[1.5fr_1fr_1.5fr_auto] md:items-center">
            <input
              type="text"
              value={filter.field}
              onChange={(event) => updateFilter(filter.id, "field", event.target.value)}
              className="rounded border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              placeholder="Field (e.g. status)"
            />
            <select
              value={filter.operator}
              onChange={(event) => updateFilter(filter.id, "operator", event.target.value)}
              className="rounded border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              {OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={String(filter.value ?? "")}
              onChange={(event) => updateFilter(filter.id, "value", event.target.value)}
              className="rounded border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              placeholder="Value"
              disabled={filter.operator === "isNull" || filter.operator === "isNotNull"}
            />
            <button
              type="button"
              onClick={() => removeFilter(filter.id)}
              className="rounded border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onApply}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Apply Filters
        </button>
      </div>
    </div>
  );
}
