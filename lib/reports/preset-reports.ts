import type { Aggregation, ChartConfiguration, ChartType, DataSource, ReportCategory } from "@/types/reports";

export type PresetReport = {
  id: string;
  name: string;
  description?: string;
  category: ReportCategory;
  dataSource: DataSource;
  filters: Array<{ field: string; operator: string; value: unknown }>;
  groupBy?: string[];
  aggregations?: Aggregation[];
  chartType?: ChartType;
  chartConfig?: ChartConfiguration;
  type: "preset";
};

export const PRESET_REPORTS: Record<ReportCategory, PresetReport[]> = {
  financial: [
    {
      id: "revenue-by-month",
      name: "Revenue by Month",
      description: "Monthly revenue breakdown for the current year",
      category: "financial",
      type: "preset",
      dataSource: "invoices",
      aggregations: [{ field: "total", function: "sum", alias: "revenue" }],
      groupBy: ["month"],
      filters: [
        { field: "status", operator: "equals", value: "paid" },
        { field: "createdAt", operator: "greaterThanOrEqual", value: "CURRENT_YEAR_START" },
      ],
      chartType: "bar",
      chartConfig: {
        xAxis: "month",
        yAxis: ["revenue"],
        colors: ["#10b981"],
        showLegend: false,
      },
    },
    {
      id: "profit-loss",
      name: "Profit & Loss Statement",
      description: "Income vs expenses breakdown",
      category: "financial",
      type: "preset",
      dataSource: "custom",
      filters: [],
      chartType: "table",
    },
    {
      id: "accounts-receivable",
      name: "Accounts Receivable Aging",
      description: "Outstanding invoices by age",
      category: "financial",
      type: "preset",
      dataSource: "invoices",
      filters: [{ field: "status", operator: "in", value: ["pending", "overdue"] }],
      groupBy: ["ageGroup"],
      chartType: "pie",
      chartConfig: {
        xAxis: "ageGroup",
        yAxis: ["count"],
      },
      aggregations: [{ field: "id", function: "count", alias: "count" }],
    },
    {
      id: "cash-collection",
      name: "Cash Collection",
      description: "Payments collected by month",
      category: "financial",
      type: "preset",
      dataSource: "payments",
      filters: [{ field: "status", operator: "equals", value: "succeeded" }],
      groupBy: ["month"],
      aggregations: [{ field: "amount", function: "sum", alias: "totalCollected" }],
      chartType: "line",
      chartConfig: {
        xAxis: "month",
        yAxis: ["totalCollected"],
        colors: ["#2563eb"],
      },
    },
  ],
  sales: [
    {
      id: "sales-by-customer",
      name: "Sales by Customer",
      description: "Top customers by revenue",
      category: "sales",
      type: "preset",
      dataSource: "invoices",
      aggregations: [
        { field: "total", function: "sum", alias: "totalSales" },
        { field: "id", function: "count", alias: "invoiceCount" },
      ],
      groupBy: ["customerId"],
      filters: [{ field: "status", operator: "equals", value: "paid" }],
      chartType: "bar",
      chartConfig: {
        xAxis: "customerId",
        yAxis: ["totalSales"],
      },
    },
    {
      id: "sales-pipeline",
      name: "Sales Pipeline",
      description: "Deals by stage",
      category: "sales",
      type: "preset",
      dataSource: "opportunities",
      filters: [],
      groupBy: ["stage"],
      aggregations: [{ field: "id", function: "count", alias: "count" }],
      chartType: "bar",
      chartConfig: {
        xAxis: "stage",
        yAxis: ["count"],
      },
    },
    {
      id: "lead-conversion",
      name: "Lead Conversion",
      description: "Leads converted over the last 90 days",
      category: "sales",
      type: "preset",
      dataSource: "leads",
      filters: [
        { field: "status", operator: "equals", value: "converted" },
        { field: "createdAt", operator: "greaterThanOrEqual", value: "LAST_90_DAYS" },
      ],
      groupBy: ["month"],
      aggregations: [{ field: "id", function: "count", alias: "converted" }],
      chartType: "area",
      chartConfig: {
        xAxis: "month",
        yAxis: ["converted"],
      },
    },
  ],
  operations: [
    {
      id: "user-activity",
      name: "User Activity Report",
      description: "User actions and login frequency",
      category: "operations",
      type: "preset",
      dataSource: "audit_logs",
      aggregations: [{ field: "id", function: "count", alias: "actionCount" }],
      groupBy: ["userId"],
      filters: [],
      chartType: "table",
    },
    {
      id: "project-throughput",
      name: "Project Throughput",
      description: "Projects completed by month",
      category: "operations",
      type: "preset",
      dataSource: "projects",
      filters: [{ field: "status", operator: "equals", value: "completed" }],
      groupBy: ["month"],
      aggregations: [{ field: "id", function: "count", alias: "completed" }],
      chartType: "line",
      chartConfig: {
        xAxis: "month",
        yAxis: ["completed"],
      },
    },
    {
      id: "workload-by-owner",
      name: "Workload by Owner",
      description: "Active projects grouped by owner",
      category: "operations",
      type: "preset",
      dataSource: "projects",
      filters: [{ field: "status", operator: "notEquals", value: "completed" }],
      groupBy: ["ownerId"],
      aggregations: [{ field: "id", function: "count", alias: "activeProjects" }],
      chartType: "bar",
      chartConfig: {
        xAxis: "ownerId",
        yAxis: ["activeProjects"],
      },
    },
  ],
  inventory: [
    {
      id: "inventory-stock",
      name: "Inventory Stock Levels",
      description: "On-hand stock by product",
      category: "inventory",
      type: "preset",
      dataSource: "products",
      filters: [],
      groupBy: ["sku"],
      aggregations: [{ field: "stockOnHand", function: "sum", alias: "stockOnHand" }],
      chartType: "bar",
      chartConfig: {
        xAxis: "sku",
        yAxis: ["stockOnHand"],
      },
    },
  ],
  hr: [
    {
      id: "headcount-by-role",
      name: "Headcount by Role",
      description: "Active users grouped by role",
      category: "hr",
      type: "preset",
      dataSource: "users",
      filters: [{ field: "status", operator: "equals", value: "active" }],
      groupBy: ["role"],
      aggregations: [{ field: "id", function: "count", alias: "headcount" }],
      chartType: "pie",
      chartConfig: {
        xAxis: "role",
        yAxis: ["headcount"],
      },
    },
    {
      id: "new-hires",
      name: "New Hires",
      description: "New hires over the last 6 months",
      category: "hr",
      type: "preset",
      dataSource: "users",
      filters: [
        { field: "status", operator: "equals", value: "active" },
        { field: "createdAt", operator: "greaterThanOrEqual", value: "LAST_180_DAYS" },
      ],
      groupBy: ["month"],
      aggregations: [{ field: "id", function: "count", alias: "newHires" }],
      chartType: "area",
      chartConfig: {
        xAxis: "month",
        yAxis: ["newHires"],
      },
    },
  ],
  custom: [],
};

export const PRESET_REPORT_LIST = Object.values(PRESET_REPORTS).flat();

export function getPresetReportById(id: string) {
  return PRESET_REPORT_LIST.find((report) => report.id === id) || null;
}
