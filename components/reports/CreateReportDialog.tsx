"use client";

import { Dialog } from "@headlessui/react";
import { useMemo, useState } from "react";
import type { Aggregation, ReportFilter, ReportSchedule } from "@/types/reports";

const DATA_SOURCES = [
  "invoices",
  "payments",
  "expenses",
  "customers",
  "products",
  "users",
  "audit_logs",
  "projects",
  "deals",
  "leads",
  "opportunities",
];

const CHART_TYPES = ["line", "bar", "pie", "area", "scatter", "table", "metric"] as const;

const CATEGORY_OPTIONS = ["financial", "sales", "operations", "inventory", "hr", "custom"] as const;

type FilterRow = ReportFilter & { id: string };

type DragItem = {
  id: string;
  label: string;
};

const defaultSchedule: ReportSchedule = {
  frequency: "weekly",
  dayOfWeek: 1,
  time: "09:00",
  timezone: "UTC",
  enabled: true,
};

export function CreateReportDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORY_OPTIONS)[number]>("financial");
  const [dataSource, setDataSource] = useState(DATA_SOURCES[0]);
  const [chartType, setChartType] = useState<(typeof CHART_TYPES)[number]>("bar");
  const [xAxis, setXAxis] = useState("createdAt");
  const [yAxis, setYAxis] = useState<string[]>(["total"]);
  const [groupByItems, setGroupByItems] = useState<DragItem[]>([]);
  const [groupByInput, setGroupByInput] = useState("");
  const [aggregations, setAggregations] = useState<Aggregation[]>([]);
  const [filters, setFilters] = useState<FilterRow[]>([{ id: "1", field: "", operator: "equals", value: "" }]);
  const [isPublic, setIsPublic] = useState(false);
  const [sharedWith, setSharedWith] = useState("");
  const [isScheduled, setIsScheduled] = useState(false);
  const [schedule, setSchedule] = useState<ReportSchedule>(defaultSchedule);
  const [recipients, setRecipients] = useState("");

  const isValid = useMemo(() => {
    if (!name.trim()) return false;
    if (!dataSource) return false;
    if (isScheduled && (!recipients.trim() || !schedule.time || !schedule.timezone)) return false;
    return true;
  }, [name, dataSource, isScheduled, recipients, schedule]);

  const reset = () => {
    setName("");
    setDescription("");
    setCategory("financial");
    setDataSource(DATA_SOURCES[0]);
    setChartType("bar");
    setXAxis("createdAt");
    setYAxis(["total"]);
    setGroupByItems([]);
    setGroupByInput("");
    setAggregations([]);
    setFilters([{ id: "1", field: "", operator: "equals", value: "" }]);
    setIsPublic(false);
    setSharedWith("");
    setIsScheduled(false);
    setSchedule(defaultSchedule);
    setRecipients("");
  };

  const closeDialog = () => {
    setOpen(false);
    reset();
  };

  const addGroupBy = (value: string) => {
    if (!value.trim()) return;
    if (groupByItems.some((item) => item.label === value.trim())) return;
    setGroupByItems((prev) => [...prev, { id: Date.now().toString(), label: value.trim() }]);
  };

  const updateGroupByOrder = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const sourceIndex = groupByItems.findIndex((item) => item.id === sourceId);
    const targetIndex = groupByItems.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const next = [...groupByItems];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    setGroupByItems(next);
  };

  const removeGroupBy = (id: string) => {
    setGroupByItems((prev) => prev.filter((item) => item.id !== id));
  };

  const addAggregation = () => {
    setAggregations((prev) => [...prev, { field: "", function: "sum", alias: "" }]);
  };

  const updateAggregation = (index: number, key: keyof Aggregation, value: string) => {
    setAggregations((prev) => prev.map((agg, idx) => (idx === index ? { ...agg, [key]: value } : agg)));
  };

  const removeAggregation = (index: number) => {
    setAggregations((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateFilter = (id: string, key: keyof ReportFilter, value: unknown) => {
    setFilters((prev) => prev.map((filter) => (filter.id === id ? { ...filter, [key]: value } : filter)));
  };

  const addFilter = () => {
    setFilters((prev) => [...prev, { id: Date.now().toString(), field: "", operator: "equals", value: "" }]);
  };

  const removeFilter = (id: string) => {
    const next = filters.filter((filter) => filter.id !== id);
    setFilters(next.length ? next : [{ id: Date.now().toString(), field: "", operator: "equals", value: "" }]);
  };

  const handleSubmit = async () => {
    if (!isValid) return;
    setLoading(true);

    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      category,
      dataSource,
      filters: filters.map(({ id, ...rest }) => rest).filter((f) => f.field),
      groupBy: groupByItems.map((item) => item.label),
      aggregations: aggregations.filter((agg) => agg.field),
      chartType,
      chartConfig: {
        xAxis: xAxis || undefined,
        yAxis: yAxis.filter(Boolean),
      },
      isPublic,
      sharedWith: sharedWith
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
      isScheduled,
      schedule: isScheduled ? schedule : undefined,
      recipients: isScheduled
        ? recipients
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
        : undefined,
    };

    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setLoading(false);

    if (!response.ok) {
      const error = await response.json();
      window.alert(error.error || "Unable to create report");
      return;
    }

    onSuccess();
    closeDialog();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        New Report
      </button>

      <Dialog open={open} onClose={closeDialog} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-neutral-900">
            <Dialog.Title className="text-xl font-semibold text-[var(--text-primary)]">
              Create Report
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-[var(--text-muted)]">
              Build custom reports with drag-and-drop grouping and aggregation order.
            </Dialog.Description>

            <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase text-[var(--text-muted)]">Name</label>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="w-full rounded border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                      placeholder="Quarterly Revenue"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase text-[var(--text-muted)]">Category</label>
                    <select
                      value={category}
                      onChange={(event) => setCategory(event.target.value as (typeof CATEGORY_OPTIONS)[number])}
                      className="w-full rounded border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    >
                      {CATEGORY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-[var(--text-muted)]">Description</label>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    className="w-full rounded border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    rows={3}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase text-[var(--text-muted)]">Data Source</label>
                    <select
                      value={dataSource}
                      onChange={(event) => setDataSource(event.target.value)}
                      className="w-full rounded border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    >
                      {DATA_SOURCES.map((source) => (
                        <option key={source} value={source}>
                          {source}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase text-[var(--text-muted)]">Chart Type</label>
                    <select
                      value={chartType}
                      onChange={(event) => setChartType(event.target.value as (typeof CHART_TYPES)[number])}
                      className="w-full rounded border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    >
                      {CHART_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase text-[var(--text-muted)]">X-Axis</label>
                    <input
                      value={xAxis}
                      onChange={(event) => setXAxis(event.target.value)}
                      className="w-full rounded border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                      placeholder="month"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase text-[var(--text-muted)]">Y-Axis (comma separated)</label>
                    <input
                      value={yAxis.join(",")}
                      onChange={(event) => setYAxis(event.target.value.split(",").map((v) => v.trim()).filter(Boolean))}
                      className="w-full rounded border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                      placeholder="revenue"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase text-[var(--text-muted)]">Group By</div>
                      <p className="text-xs text-[var(--text-muted)]">Drag items to reorder grouping priority.</p>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={groupByInput}
                        onChange={(event) => setGroupByInput(event.target.value)}
                        className="rounded border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                        placeholder="Field"
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addGroupBy(groupByInput);
                            setGroupByInput("");
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          addGroupBy(groupByInput);
                          setGroupByInput("");
                        }}
                        className="rounded bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {groupByItems.length === 0 ? (
                      <div className="text-xs text-[var(--text-muted)]">No groupings yet.</div>
                    ) : (
                      groupByItems.map((item) => (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault();
                            const sourceId = event.dataTransfer.getData("text/plain");
                            updateGroupByOrder(sourceId, item.id);
                          }}
                          className="flex items-center justify-between rounded border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                        >
                          <span className="cursor-move">{item.label}</span>
                          <button
                            type="button"
                            onClick={() => removeGroupBy(item.id)}
                            className="text-xs text-red-500 hover:text-red-600"
                          >
                            Remove
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase text-[var(--text-muted)]">Aggregations</div>
                      <p className="text-xs text-[var(--text-muted)]">Add aggregation functions for metrics.</p>
                    </div>
                    <button
                      type="button"
                      onClick={addAggregation}
                      className="rounded bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
                    >
                      + Add
                    </button>
                  </div>
                  {aggregations.length === 0 ? (
                    <div className="text-xs text-[var(--text-muted)]">No aggregations.</div>
                  ) : (
                    <div className="space-y-2">
                      {aggregations.map((agg, index) => (
                        <div key={`${agg.field}-${index}`} className="grid gap-2 md:grid-cols-[1.2fr_1fr_1fr_auto]">
                          <input
                            value={agg.field}
                            onChange={(event) => updateAggregation(index, "field", event.target.value)}
                            className="rounded border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                            placeholder="Field"
                          />
                          <select
                            value={agg.function}
                            onChange={(event) => updateAggregation(index, "function", event.target.value)}
                            className="rounded border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                          >
                            {"sum,avg,count,min,max".split(",").map((fn) => (
                              <option key={fn} value={fn}>
                                {fn}
                              </option>
                            ))}
                          </select>
                          <input
                            value={agg.alias || ""}
                            onChange={(event) => updateAggregation(index, "alias", event.target.value)}
                            className="rounded border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                            placeholder="Alias"
                          />
                          <button
                            type="button"
                            onClick={() => removeAggregation(index)}
                            className="rounded border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase text-[var(--text-muted)]">Filters</div>
                      <p className="text-xs text-[var(--text-muted)]">Define base filters for the report.</p>
                    </div>
                    <button
                      type="button"
                      onClick={addFilter}
                      className="rounded bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
                    >
                      + Add Filter
                    </button>
                  </div>
                  {filters.map((filter) => (
                    <div key={filter.id} className="grid gap-2 md:grid-cols-[1.2fr_1fr_1.5fr_auto]">
                      <input
                        value={filter.field}
                        onChange={(event) => updateFilter(filter.id, "field", event.target.value)}
                        className="rounded border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                        placeholder="Field"
                      />
                      <select
                        value={filter.operator}
                        onChange={(event) => updateFilter(filter.id, "operator", event.target.value)}
                        className="rounded border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                      >
                        {[
                          "equals",
                          "notEquals",
                          "contains",
                          "notContains",
                          "startsWith",
                          "endsWith",
                          "greaterThan",
                          "greaterThanOrEqual",
                          "lessThan",
                          "lessThanOrEqual",
                          "between",
                          "in",
                          "notIn",
                          "isNull",
                          "isNotNull",
                        ].map((op) => (
                          <option key={op} value={op}>
                            {op}
                          </option>
                        ))}
                      </select>
                      <input
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
              </div>

              <div className="space-y-5">
                <div className="card p-4">
                  <div className="text-xs font-semibold uppercase text-[var(--text-muted)]">Visibility</div>
                  <label className="mt-3 flex items-center gap-2 text-sm text-[var(--text-primary)]">
                    <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
                    Public (all users in tenant)
                  </label>
                  <div className="mt-3 space-y-2">
                    <label className="text-xs font-semibold uppercase text-[var(--text-muted)]">Share with users</label>
                    <input
                      value={sharedWith}
                      onChange={(event) => setSharedWith(event.target.value)}
                      className="w-full rounded border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                      placeholder="User IDs (comma-separated)"
                    />
                  </div>
                </div>

                <div className="card p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase text-[var(--text-muted)]">Scheduling</div>
                      <p className="text-xs text-[var(--text-muted)]">Email reports on a cadence.</p>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                      <input
                        type="checkbox"
                        checked={isScheduled}
                        onChange={(event) => setIsScheduled(event.target.checked)}
                      />
                      Enabled
                    </label>
                  </div>

                  {isScheduled ? (
                    <div className="mt-4 space-y-3">
                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase text-[var(--text-muted)]">Frequency</label>
                          <select
                            value={schedule.frequency}
                            onChange={(event) =>
                              setSchedule((prev) => ({ ...prev, frequency: event.target.value as ReportSchedule["frequency"] }))
                            }
                            className="w-full rounded border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                          >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase text-[var(--text-muted)]">Time</label>
                          <input
                            type="time"
                            value={schedule.time}
                            onChange={(event) => setSchedule((prev) => ({ ...prev, time: event.target.value }))}
                            className="w-full rounded border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                          />
                        </div>
                      </div>

                      {schedule.frequency === "weekly" ? (
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase text-[var(--text-muted)]">Day of week</label>
                          <select
                            value={schedule.dayOfWeek}
                            onChange={(event) => setSchedule((prev) => ({ ...prev, dayOfWeek: Number(event.target.value) }))}
                            className="w-full rounded border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                          >
                            {[
                              "Sunday",
                              "Monday",
                              "Tuesday",
                              "Wednesday",
                              "Thursday",
                              "Friday",
                              "Saturday",
                            ].map((label, index) => (
                              <option key={label} value={index}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}

                      {schedule.frequency === "monthly" ? (
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase text-[var(--text-muted)]">Day of month</label>
                          <input
                            type="number"
                            min={1}
                            max={31}
                            value={schedule.dayOfMonth || 1}
                            onChange={(event) => setSchedule((prev) => ({ ...prev, dayOfMonth: Number(event.target.value) }))}
                            className="w-full rounded border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                          />
                        </div>
                      ) : null}

                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase text-[var(--text-muted)]">Timezone</label>
                        <input
                          value={schedule.timezone}
                          onChange={(event) => setSchedule((prev) => ({ ...prev, timezone: event.target.value }))}
                          className="w-full rounded border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                          placeholder="UTC"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase text-[var(--text-muted)]">Recipients</label>
                        <input
                          value={recipients}
                          onChange={(event) => setRecipients(event.target.value)}
                          className="w-full rounded border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                          placeholder="email@company.com, exec@company.com"
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeDialog}
                className="rounded border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!isValid || loading}
                onClick={handleSubmit}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Creating..." : "Create Report"}
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </>
  );
}
