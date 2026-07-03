import type { Timestamp } from 'firebase-admin/firestore';

export type ReportCategory = 'financial' | 'sales' | 'operations' | 'inventory' | 'hr' | 'custom';

export type ReportType = 'preset' | 'custom';

export type DataSource =
  | 'invoices'
  | 'payments'
  | 'expenses'
  | 'customers'
  | 'products'
  | 'users'
  | 'audit_logs'
  | 'projects'
  | 'deals'
  | 'leads'
  | 'opportunities'
  | 'time_entries'
  | 'budget_lines'
  | 'custom';

export type ChartType = 'line' | 'bar' | 'pie' | 'area' | 'scatter' | 'table' | 'metric';

export type AggregationFunction = 'sum' | 'avg' | 'count' | 'min' | 'max';

export type ReportFormat = 'pdf' | 'csv' | 'xlsx';

export interface ReportFieldSelection {
  field: string;
  label: string;
  alias?: string;
  type?: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
  selectedAt: number;
}

export interface ReportFilter {
  field: string;
  operator:
    | 'equals'
    | 'notEquals'
    | 'greaterThan'
    | 'greaterThanOrEqual'
    | 'lessThan'
    | 'lessThanOrEqual'
    | 'between'
    | 'in'
    | 'notIn'
    | 'contains'
    | 'notContains'
    | 'startsWith'
    | 'endsWith'
    | 'isNull'
    | 'isNotNull';
  value: unknown;
  logicalOperator?: 'and' | 'or';
}

export interface Aggregation {
  field: string;
  function: AggregationFunction;
  alias?: string;
}

export interface ReportSort {
  field: string;
  direction: 'asc' | 'desc';
}

export interface ReportSchedule {
  frequency: 'daily' | 'weekly' | 'monthly';
  dayOfWeek?: number;
  dayOfMonth?: number;
  time: string;
  timezone: string;
  enabled: boolean;
}

export interface ChartConfiguration {
  type?: ChartType;
  xAxis?: string;
  yAxis?: string[];
  series?: string[];
  colors?: string[];
  showLegend?: boolean;
  showGrid?: boolean;
  stacked?: boolean;
}

export interface Report {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  category: ReportCategory;
  type: ReportType;
  dataSource: DataSource;
  fields?: ReportFieldSelection[];
  filters: ReportFilter[];
  groupBy?: string[];
  aggregations?: Aggregation[];
  sorts?: ReportSort[];
  chartType?: ChartType;
  chartConfig?: ChartConfiguration;
  isScheduled: boolean;
  schedule?: ReportSchedule;
  recipients?: string[];
  snapshotRetentionDays?: number;
  createdBy: string;
  isPublic: boolean;
  sharedWith?: string[];
  lastRunAt?: Timestamp;
  lastRunDuration?: number;
  lastScheduledAt?: Timestamp;
  runCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ReportExecution {
  id: string;
  tenantId: string;
  reportId: string;
  executedBy: string;
  executedAt: Timestamp;
  duration: number;
  status: 'success' | 'failed';
  errorMessage?: string;
  rowCount: number;
  resultSize: number;
  resultUrl?: string;
  filters: ReportFilter[];
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface ReportSnapshot {
  id: string;
  tenantId: string;
  reportId: string;
  createdBy: string;
  rowCount: number;
  data: Record<string, unknown>[];
  metadata: {
    chartType?: ChartType;
    chartConfig?: ChartConfiguration;
    filters: ReportFilter[];
    groupBy?: string[];
    aggregations?: Aggregation[];
  };
  createdAt: Timestamp;
}

export interface ReportScheduleRecord {
  id: string;
  tenantId: string;
  reportId: string;
  schedule: ReportSchedule;
  recipients: string[];
  format: ReportFormat;
  nextRunAt: Timestamp;
  lastRunAt?: Timestamp;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
