'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  DataSource,
  Report,
  ReportFilter,
  ReportFormat,
  ReportSchedule,
} from '@/types/reports';
import { apiFetch } from '@/lib/api/client';

const availableFieldsBySource: Record<DataSource, string[]> = {
  invoices: ['invoiceNumber', 'customerId', 'status', 'total', 'tax', 'createdAt', 'dueDate'],
  payments: ['paymentId', 'customerId', 'method', 'amount', 'status', 'createdAt'],
  expenses: ['category', 'amount', 'status', 'vendor', 'createdAt'],
  customers: ['name', 'industry', 'country', 'status', 'lifetimeValue', 'createdAt'],
  products: ['sku', 'name', 'category', 'stockOnHand', 'unitPrice', 'createdAt'],
  users: ['displayName', 'email', 'department', 'role', 'status', 'trackedHours', 'createdAt'],
  audit_logs: ['action', 'resource', 'userId', 'createdAt'],
  projects: ['name', 'status', 'ownerId', 'budgetAmount', 'actualSpend', 'createdAt'],
  deals: ['name', 'stage', 'ownerId', 'value', 'createdAt'],
  leads: ['name', 'status', 'source', 'ownerId', 'createdAt'],
  opportunities: ['name', 'stage', 'value', 'ownerId', 'createdAt'],
  time_entries: ['employeeId', 'projectId', 'durationHours', 'billable', 'date'],
  budget_lines: ['department', 'account', 'budget', 'actual', 'month'],
  custom: [],
};

const templateSeeds = [
  {
    name: 'Sales pipeline by stage',
    dataSource: 'deals',
    groupBy: ['stage'],
    aggField: 'id',
    aggFunction: 'count',
  },
  {
    name: 'Revenue by client (monthly)',
    dataSource: 'invoices',
    groupBy: ['customerId', 'month'],
    aggField: 'total',
    aggFunction: 'sum',
  },
  {
    name: 'Time tracking by employee',
    dataSource: 'users',
    groupBy: ['displayName'],
    aggField: 'trackedHours',
    aggFunction: 'sum',
  },
  {
    name: 'Budget vs actual variance',
    dataSource: 'projects',
    groupBy: ['name'],
    aggField: 'actualSpend',
    aggFunction: 'sum',
  },
  {
    name: 'Overdue invoices summary',
    dataSource: 'invoices',
    groupBy: ['status'],
    aggField: 'id',
    aggFunction: 'count',
  },
  {
    name: 'Project status overview',
    dataSource: 'projects',
    groupBy: ['status'],
    aggField: 'id',
    aggFunction: 'count',
  },
] as const;

const defaultSchedule: ReportSchedule = {
  frequency: 'weekly',
  dayOfWeek: 1,
  time: '09:00',
  timezone: 'UTC',
  enabled: true,
};

export function VisualReportBuilder() {
  const [reports, setReports] = useState<Report[]>([]);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [dataSource, setDataSource] = useState<DataSource>('invoices');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<string[]>([]);
  const [chartType, setChartType] = useState<Report['chartType']>('table');
  const [filters, setFilters] = useState<ReportFilter[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [schedule, setSchedule] = useState<ReportSchedule>(defaultSchedule);
  const [scheduleRecipients, setScheduleRecipients] = useState('ops@example.com');
  const [exportFormat, setExportFormat] = useState<ReportFormat>('csv');

  const availableFields = useMemo(() => availableFieldsBySource[dataSource] || [], [dataSource]);

  useEffect(() => {
    void loadReports();
  }, []);

  const loadReports = async () => {
    const response = await apiFetch('/api/reports/custom');
    const payload = await response.json();
    setReports(payload.reports || []);
  };

  const addFilter = () => {
    setFilters((prev) => [
      ...prev,
      { field: availableFields[0] || 'status', operator: 'equals', value: '' },
    ]);
  };

  const saveReport = async () => {
    if (!name.trim()) return;

    await apiFetch('/api/reports/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        category: 'custom',
        dataSource,
        fields: selectedFields.map((field, index) => ({
          field,
          label: field,
          selectedAt: index + 1,
        })),
        filters,
        groupBy,
        aggregations: [
          {
            field: selectedFields[selectedFields.length - 1] || 'id',
            function: 'count',
            alias: 'value',
          },
        ],
        sorts: [{ field: 'createdAt', direction: 'desc' }],
        chartType,
        chartConfig: {
          xAxis: groupBy[0],
          yAxis: ['value'],
          series: groupBy.slice(1),
        },
      }),
    });

    await loadReports();
  };

  const runPreview = async (reportId?: string) => {
    const targetId = reportId || activeReportId;
    if (!targetId) return;
    setPreviewLoading(true);
    const response = await apiFetch(`/api/reports/custom/${targetId}/run`, { method: 'POST' });
    const payload = await response.json();
    setPreviewRows(payload.rows || []);
    setPreviewLoading(false);
  };

  const scheduleReport = async () => {
    if (!activeReportId) return;

    await apiFetch(`/api/reports/custom/${activeReportId}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...schedule,
        recipients: scheduleRecipients
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean),
        format: exportFormat,
      }),
    });

    setScheduleModalOpen(false);
  };

  const exportReport = async () => {
    if (!activeReportId) return;

    const response = await apiFetch(`/api/reports/custom/${activeReportId}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: exportFormat }),
    });

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${activeReportId}.${exportFormat}`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const applyTemplate = (templateName: string) => {
    const template = templateSeeds.find((entry) => entry.name === templateName);
    if (!template) return;
    setName(template.name);
    setDataSource(template.dataSource as DataSource);
    setGroupBy([...template.groupBy]);
    setSelectedFields([...template.groupBy, template.aggField]);
  };

  const onDropToCanvas = (field: string) => {
    setSelectedFields((prev) => (prev.includes(field) ? prev : [...prev, field]));
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Visual Report Builder</h1>
          <p className="page-subtitle">
            Build multi-module custom reports with filters, grouping, charts, exports, and
            schedules.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="rounded bg-blue-600 px-3 py-2 text-sm text-white" onClick={saveReport}>
            Save report
          </button>
          <button
            className="rounded bg-neutral-200 px-3 py-2 text-sm dark:bg-neutral-800"
            onClick={() => setScheduleModalOpen(true)}
            disabled={!activeReportId}
          >
            Schedule
          </button>
          <button
            className="rounded bg-neutral-200 px-3 py-2 text-sm dark:bg-neutral-800"
            onClick={exportReport}
            disabled={!activeReportId}
          >
            Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <aside className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="mb-3 text-sm font-semibold">Available fields</h2>
          <select
            className="mb-3 w-full rounded border p-2 text-sm"
            value={dataSource}
            onChange={(e) => setDataSource(e.target.value as DataSource)}
          >
            {Object.keys(availableFieldsBySource)
              .filter((source) => source !== 'custom')
              .map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
          </select>
          <div className="space-y-2">
            {availableFields.map((field) => (
              <div
                key={field}
                draggable
                onDragStart={(event) => event.dataTransfer.setData('text/plain', field)}
                className="cursor-move rounded border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-700"
              >
                {field}
              </div>
            ))}
          </div>
        </aside>

        <main
          className="rounded border border-dashed border-blue-300 p-4 dark:border-blue-700"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            onDropToCanvas(event.dataTransfer.getData('text/plain'));
          }}
        >
          <h2 className="mb-2 text-sm font-semibold">Report canvas</h2>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mb-3 w-full rounded border p-2 text-sm"
            placeholder="Report name"
          />
          <div className="mb-3 flex flex-wrap gap-2">
            {selectedFields.length ? (
              selectedFields.map((field) => (
                <span
                  key={field}
                  className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
                >
                  {field}
                </span>
              ))
            ) : (
              <span className="text-xs text-[var(--text-muted)]">Drag fields here</span>
            )}
          </div>

          <h3 className="text-xs font-semibold uppercase text-[var(--text-muted)]">
            Filter builder
          </h3>
          <div className="mt-2 space-y-2">
            {filters.map((filter, index) => (
              <div key={`${filter.field}-${index}`} className="grid grid-cols-3 gap-2">
                <select
                  value={filter.field}
                  onChange={(event) =>
                    setFilters((prev) =>
                      prev.map((row, i) =>
                        i === index ? { ...row, field: event.target.value } : row,
                      ),
                    )
                  }
                  className="rounded border p-2 text-xs"
                >
                  {availableFields.map((field) => (
                    <option key={field} value={field}>
                      {field}
                    </option>
                  ))}
                </select>
                <select
                  value={filter.operator}
                  onChange={(event) =>
                    setFilters((prev) =>
                      prev.map((row, i) =>
                        i === index
                          ? { ...row, operator: event.target.value as ReportFilter['operator'] }
                          : row,
                      ),
                    )
                  }
                  className="rounded border p-2 text-xs"
                >
                  <option value="equals">equals</option>
                  <option value="notEquals">not equals</option>
                  <option value="greaterThan">&gt;</option>
                  <option value="greaterThanOrEqual">&gt;=</option>
                  <option value="lessThan">&lt;</option>
                  <option value="lessThanOrEqual">&lt;=</option>
                  <option value="contains">contains</option>
                </select>
                <input
                  value={String(filter.value ?? '')}
                  onChange={(event) =>
                    setFilters((prev) =>
                      prev.map((row, i) =>
                        i === index ? { ...row, value: event.target.value } : row,
                      ),
                    )
                  }
                  className="rounded border p-2 text-xs"
                />
              </div>
            ))}
            <button className="rounded border px-2 py-1 text-xs" onClick={addFilter}>
              + Add filter
            </button>
          </div>

          <div className="mt-4">
            <button
              className="rounded bg-blue-600 px-3 py-2 text-xs text-white"
              disabled={!activeReportId}
              onClick={() => runPreview()}
            >
              Run preview
            </button>
          </div>
        </main>

        <aside className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="mb-3 text-sm font-semibold">Configuration</h2>
          <label className="mb-1 block text-xs text-[var(--text-muted)]">Group by</label>
          <select
            className="mb-3 w-full rounded border p-2 text-sm"
            value={groupBy[0] || ''}
            onChange={(event) => setGroupBy(event.target.value ? [event.target.value] : [])}
          >
            <option value="">None</option>
            {selectedFields.map((field) => (
              <option key={field} value={field}>
                {field}
              </option>
            ))}
          </select>

          <label className="mb-1 block text-xs text-[var(--text-muted)]">Chart selector</label>
          <select
            className="mb-3 w-full rounded border p-2 text-sm"
            value={chartType}
            onChange={(event) => setChartType(event.target.value as Report['chartType'])}
          >
            <option value="bar">bar</option>
            <option value="line">line</option>
            <option value="pie">pie</option>
            <option value="table">table</option>
          </select>

          <label className="mb-1 block text-xs text-[var(--text-muted)]">Export format</label>
          <select
            className="w-full rounded border p-2 text-sm"
            value={exportFormat}
            onChange={(event) => setExportFormat(event.target.value as ReportFormat)}
          >
            <option value="csv">CSV</option>
            <option value="xlsx">Excel</option>
            <option value="pdf">PDF</option>
          </select>

          <div className="mt-6">
            <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--text-muted)]">
              Pre-built templates
            </h3>
            <div className="space-y-2">
              {templateSeeds.map((template) => (
                <button
                  key={template.name}
                  className="block w-full rounded border px-2 py-1 text-left text-xs"
                  onClick={() => applyTemplate(template.name)}
                >
                  {template.name}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <section className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Saved reports library</h2>
          <button className="rounded border px-2 py-1 text-xs" onClick={loadReports}>
            Refresh
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {reports.map((report) => (
            <button
              key={report.id}
              className={`rounded border p-2 text-left ${activeReportId === report.id ? 'border-blue-600' : 'border-neutral-200 dark:border-neutral-700'}`}
              onClick={() => {
                setActiveReportId(report.id);
                setName(report.name);
                setDataSource(report.dataSource);
                setSelectedFields((report.fields || []).map((field) => field.field));
                setGroupBy(report.groupBy || []);
                setChartType(report.chartType || 'table');
                setFilters(report.filters || []);
                void runPreview(report.id);
              }}
            >
              <p className="text-sm font-medium">{report.name}</p>
              <p className="text-xs text-[var(--text-muted)]">
                {report.dataSource} · {report.chartType || 'table'}
              </p>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-2 text-sm font-semibold">Preview panel</h2>
        {previewLoading ? (
          <p className="text-xs text-[var(--text-muted)]">Loading preview...</p>
        ) : previewRows.length ? (
          <div className="max-h-80 overflow-auto rounded border">
            <table className="min-w-full text-xs">
              <thead className="bg-neutral-100 dark:bg-neutral-900">
                <tr>
                  {Object.keys(previewRows[0]).map((key) => (
                    <th key={key} className="px-2 py-1 text-left">
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, index) => (
                  <tr key={index} className="border-t border-neutral-200 dark:border-neutral-800">
                    {Object.keys(previewRows[0]).map((key) => (
                      <td key={key} className="px-2 py-1">
                        {String(row[key] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">Run a report to preview live data.</p>
        )}
      </section>

      {scheduleModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded bg-white p-4 dark:bg-neutral-950">
            <h2 className="mb-3 text-base font-semibold">Schedule report delivery</h2>
            <div className="grid grid-cols-2 gap-3">
              <select
                className="rounded border p-2 text-sm"
                value={schedule.frequency}
                onChange={(event) =>
                  setSchedule((prev) => ({
                    ...prev,
                    frequency: event.target.value as ReportSchedule['frequency'],
                  }))
                }
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <input
                type="time"
                className="rounded border p-2 text-sm"
                value={schedule.time}
                onChange={(event) => setSchedule((prev) => ({ ...prev, time: event.target.value }))}
              />
              <input
                className="rounded border p-2 text-sm"
                placeholder="Timezone"
                value={schedule.timezone}
                onChange={(event) =>
                  setSchedule((prev) => ({ ...prev, timezone: event.target.value }))
                }
              />
              <input
                className="rounded border p-2 text-sm"
                placeholder="Recipients comma separated"
                value={scheduleRecipients}
                onChange={(event) => setScheduleRecipients(event.target.value)}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded border px-3 py-2 text-sm"
                onClick={() => setScheduleModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="rounded bg-blue-600 px-3 py-2 text-sm text-white"
                onClick={scheduleReport}
              >
                Save schedule
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
