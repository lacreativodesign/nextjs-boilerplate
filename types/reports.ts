import type { Timestamp } from "firebase-admin/firestore";

export type ReportCategory = "financial" | "sales" | "operations" | "inventory" | "hr" | "custom";

export type ReportType = "preset" | "custom";

export type DataSource =
  | "invoices"
  | "payments"
  | "expenses"
  | "customers"
  | "products"
  | "users"
  | "audit_logs"
  | "projects"
  | "deals"
  | "leads"
  | "opportunities"
  | "custom";

export type ChartType = "line" | "bar" | "pie" | "area" | "scatter" | "table" | "metric";

export type AggregationFunction = "sum" | "avg" | "count" | "min" | "max";

export interface ReportFilter {
  field: string;
  operator:
    | "equals"
    | "notEquals"
    | "greaterThan"
    | "greaterThanOrEqual"
    | "lessThan"
    | "lessThanOrEqual"
    | "between"
    | "in"
    | "notIn"
    | "contains"
    | "notContains"
    | "startsWith"
    | "endsWith"
    | "isNull"
    | "isNotNull";
  value: unknown;
}

export interface Aggregation {
  field: string;
  function: AggregationFunction;
  alias?: string;
}

export interface ReportSchedule {
  frequency: "daily" | "weekly" | "monthly";
  dayOfWeek?: number;
  dayOfMonth?: number;
  time: string;
  timezone: string;
  enabled: boolean;
}

export interface ChartConfiguration {
  xAxis?: string;
  yAxis?: string[];
  colors?: string[];
  showLegend?: boolean;
  showGrid?: boolean;
}

export interface Report {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  category: ReportCategory;
  type: ReportType;
  dataSource: DataSource;
  filters: ReportFilter[];
  groupBy?: string[];
  aggregations?: Aggregation[];
  chartType?: ChartType;
  chartConfig?: ChartConfiguration;
  isScheduled: boolean;
  schedule?: ReportSchedule;
  recipients?: string[];
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
  status: "success" | "failed";
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
