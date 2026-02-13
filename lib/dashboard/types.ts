export type DashboardWidgetType =
  | "revenue_chart"
  | "invoice_status"
  | "task_summary"
  | "top_clients"
  | "recent_activity"
  | "time_tracking"
  | "leave_calendar"
  | "project_status";

export type DashboardWidgetTemplateId =
  | "revenue-overview"
  | "finance-health"
  | "execution-overview"
  | "team-ops";

export type WidgetSize = { w: number; h: number; minW?: number; minH?: number; maxW?: number; maxH?: number };

export type DashboardWidget = {
  id: string;
  tenantId: string;
  userId: string;
  type: DashboardWidgetType;
  title: string;
  config: Record<string, unknown>;
  dataSource: string;
  createdAt?: string;
  updatedAt?: string;
};

export type DashboardWidgetLayoutItem = {
  widgetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type DashboardLayout = {
  id: string;
  tenantId: string;
  userId: string;
  items: DashboardWidgetLayoutItem[];
  updatedAt?: string;
  createdAt?: string;
};

export type WidgetDefinition = {
  type: DashboardWidgetType;
  title: string;
  description: string;
  defaultSize: WidgetSize;
  dataSource: string;
  defaultConfig: Record<string, unknown>;
};

export type WidgetTemplate = {
  id: DashboardWidgetTemplateId;
  name: string;
  description: string;
  widgets: Array<{ type: DashboardWidgetType; x: number; y: number; w?: number; h?: number; title?: string; config?: Record<string, unknown> }>;
};

export type WidgetDataEnvelope = {
  widgetId: string;
  type: DashboardWidgetType;
  generatedAt: string;
  refreshIntervalMs: number;
  data: Record<string, unknown>;
};
