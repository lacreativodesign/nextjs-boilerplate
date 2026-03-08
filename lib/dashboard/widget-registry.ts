import type { DashboardWidgetType, WidgetDefinition, WidgetTemplate } from "@/lib/dashboard/types";

const registry = new Map<DashboardWidgetType, WidgetDefinition>();

export function registerWidget(definition: WidgetDefinition) {
  registry.set(definition.type, definition);
}

export function getWidgetDefinition(type: DashboardWidgetType) {
  return registry.get(type) ?? null;
}

export function listWidgetDefinitions() {
  return Array.from(registry.values());
}

registerWidget({
  type: "revenue_chart",
  title: "Revenue Chart",
  description: "Monthly revenue trend",
  defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
  dataSource: "invoices",
  defaultConfig: { months: 6 },
});
registerWidget({
  type: "invoice_status",
  title: "Invoice Status",
  description: "Paid / pending / overdue split",
  defaultSize: { w: 4, h: 4, minW: 3, minH: 3 },
  dataSource: "invoices",
  defaultConfig: {},
});
registerWidget({
  type: "task_summary",
  title: "Task Summary",
  description: "Upcoming and completed tasks",
  defaultSize: { w: 4, h: 4, minW: 3, minH: 3 },
  dataSource: "tasks",
  defaultConfig: { lookAheadDays: 14 },
});
registerWidget({
  type: "top_clients",
  title: "Top Clients",
  description: "Revenue by client",
  defaultSize: { w: 6, h: 5, minW: 4, minH: 4 },
  dataSource: "invoices",
  defaultConfig: { limit: 5 },
});
registerWidget({
  type: "recent_activity",
  title: "Recent Activity",
  description: "Latest system events",
  defaultSize: { w: 6, h: 5, minW: 4, minH: 4 },
  dataSource: "activities",
  defaultConfig: { limit: 10 },
});
registerWidget({
  type: "time_tracking",
  title: "Time Tracking",
  description: "Hours logged this week",
  defaultSize: { w: 4, h: 4, minW: 3, minH: 3 },
  dataSource: "time_entries",
  defaultConfig: {},
});
registerWidget({
  type: "leave_calendar",
  title: "Leave Calendar",
  description: "Team leave overview",
  defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
  dataSource: "leaves",
  defaultConfig: { limit: 8 },
});
registerWidget({
  type: "project_status",
  title: "Project Status",
  description: "Projects by status",
  defaultSize: { w: 4, h: 4, minW: 3, minH: 3 },
  dataSource: "projects",
  defaultConfig: {},
});

export const DASHBOARD_TEMPLATES: WidgetTemplate[] = [
  {
    id: "revenue-overview",
    name: "Revenue Overview",
    description: "Finance-focused dashboard with revenue and invoice indicators",
    widgets: [
      { type: "revenue_chart", x: 0, y: 0, w: 8, h: 4 },
      { type: "invoice_status", x: 8, y: 0, w: 4, h: 4 },
      { type: "top_clients", x: 0, y: 4, w: 8, h: 4 },
      { type: "recent_activity", x: 8, y: 4, w: 4, h: 4 },
    ],
  },
  {
    id: "finance-health",
    name: "Finance Health",
    description: "Cash flow and payment operations overview",
    widgets: [
      { type: "revenue_chart", x: 0, y: 0 },
      { type: "invoice_status", x: 6, y: 0 },
      { type: "time_tracking", x: 0, y: 4 },
      { type: "top_clients", x: 4, y: 4 },
    ],
  },
  {
    id: "execution-overview",
    name: "Execution Overview",
    description: "Projects, tasks, and delivery status",
    widgets: [
      { type: "project_status", x: 0, y: 0 },
      { type: "task_summary", x: 4, y: 0 },
      { type: "leave_calendar", x: 8, y: 0, w: 4, h: 4 },
      { type: "recent_activity", x: 0, y: 4, w: 12, h: 4 },
    ],
  },
  {
    id: "team-ops",
    name: "Team Ops",
    description: "People activity and utilization",
    widgets: [
      { type: "time_tracking", x: 0, y: 0 },
      { type: "leave_calendar", x: 4, y: 0, w: 8, h: 4 },
      { type: "task_summary", x: 0, y: 4 },
      { type: "recent_activity", x: 4, y: 4, w: 8, h: 4 },
    ],
  },
];
