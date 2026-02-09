"use client";

import { useState } from "react";
import { Dialog } from "@headlessui/react";

interface FilterRow {
  id: string;
  field: string;
  operator: string;
  value: string;
}

export function AdvancedSearchDialog({
  open,
  onClose,
  module,
  fields,
  onSearch,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  module: string;
  fields: { name: string; label: string; type: string }[];
  onSearch: (filters: FilterRow[]) => void;
  onSave: (name: string, filters: FilterRow[]) => void;
}) {
  const [filters, setFilters] = useState<FilterRow[]>([
    { id: "1", field: "", operator: "equals", value: "" },
  ]);

  const addFilter = () => {
    setFilters((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        field: "",
        operator: "equals",
        value: "",
      },
    ]);
  };

  const removeFilter = (id: string) => {
    setFilters((prev) => prev.filter((filter) => filter.id !== id));
  };

  const updateFilter = (id: string, key: keyof FilterRow, value: string) => {
    setFilters((prev) => prev.map((filter) => (filter.id === id ? { ...filter, [key]: value } : filter)));
  };

  const handleSearch = () => {
    onSearch(filters);
    onClose();
  };

  const handleSave = () => {
    const name = window.prompt(`Save ${module} search as:`);
    if (name) {
      onSave(name, filters);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl dark:bg-neutral-900">
          <Dialog.Title className="text-xl font-semibold text-[var(--text-primary)]">
            Advanced Search
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-[var(--text-muted)]">
            Build advanced filters for {module}.
          </Dialog.Description>

          <div className="mt-6 space-y-3">
            {filters.map((filter) => (
              <div key={filter.id} className="flex flex-col gap-2 md:flex-row md:items-center">
                <select
                  value={filter.field}
                  onChange={(event) => updateFilter(filter.id, "field", event.target.value)}
                  className="w-full rounded border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 md:flex-1"
                >
                  <option value="">Select field...</option>
                  {fields.map((field) => (
                    <option key={field.name} value={field.name}>
                      {field.label}
                    </option>
                  ))}
                </select>

                <select
                  value={filter.operator}
                  onChange={(event) => updateFilter(filter.id, "operator", event.target.value)}
                  className="w-full rounded border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 md:w-56"
                >
                  <option value="equals">Equals</option>
                  <option value="notEquals">Not equals</option>
                  <option value="contains">Contains</option>
                  <option value="notContains">Not contains</option>
                  <option value="startsWith">Starts with</option>
                  <option value="endsWith">Ends with</option>
                  <option value="greaterThan">Greater than</option>
                  <option value="greaterThanOrEqual">Greater than or equal</option>
                  <option value="lessThan">Less than</option>
                  <option value="lessThanOrEqual">Less than or equal</option>
                  <option value="between">Between</option>
                  <option value="in">In</option>
                  <option value="notIn">Not in</option>
                  <option value="isNull">Is null</option>
                  <option value="isNotNull">Is not null</option>
                </select>

                <input
                  type="text"
                  value={filter.value}
                  onChange={(event) => updateFilter(filter.id, "value", event.target.value)}
                  className="w-full rounded border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 md:flex-1"
                  placeholder="Value..."
                />

                {filters.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeFilter(filter.id)}
                    className="rounded bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addFilter}
              className="rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
            >
              + Add Filter
            </button>
            <button
              type="button"
              onClick={handleSearch}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Search
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Save Search
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
