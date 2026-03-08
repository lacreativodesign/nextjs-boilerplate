export type TemplateFilterOperator =
  | 'equals'
  | 'contains'
  | 'greaterThan'
  | 'lessThan'
  | 'between'
  | 'in'
  | 'notEquals'
  | 'greaterThanOrEqual'
  | 'lessThanOrEqual';

export type TemplateFilterValue = string | number | boolean | null | Array<string | number>;

export interface SearchFilterTemplate {
  id: string;
  name: string;
  collection: string;
  logic: 'AND' | 'OR';
  filters: Array<{
    field: string;
    operator: TemplateFilterOperator;
    value: TemplateFilterValue;
  }>;
}

const now = new Date();
const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
const isoNow = now.toISOString();

export const FILTER_TEMPLATES: SearchFilterTemplate[] = [
  {
    id: 'overdue_invoices',
    name: 'Overdue invoices',
    collection: 'invoices',
    logic: 'AND',
    filters: [
      { field: 'status', operator: 'equals', value: 'unpaid' },
      { field: 'dueDate', operator: 'lessThan', value: isoNow },
    ],
  },
  {
    id: 'high_priority_tasks',
    name: 'High-priority tasks',
    collection: 'tasks',
    logic: 'AND',
    filters: [
      { field: 'priority', operator: 'equals', value: 'high' },
      { field: 'status', operator: 'notEquals', value: 'completed' },
    ],
  },
  {
    id: 'new_clients_this_month',
    name: 'New clients this month',
    collection: 'clients',
    logic: 'AND',
    filters: [{ field: 'createdAt', operator: 'greaterThanOrEqual', value: firstDayOfMonth }],
  },
  {
    id: 'employees_on_leave_today',
    name: 'Employees on leave today',
    collection: 'leave_requests',
    logic: 'AND',
    filters: [
      { field: 'leaveStartDate', operator: 'lessThanOrEqual', value: isoNow },
      { field: 'leaveEndDate', operator: 'greaterThanOrEqual', value: isoNow },
    ],
  },
  {
    id: 'projects_over_budget',
    name: 'Projects over budget',
    collection: 'projects',
    logic: 'AND',
    filters: [{ field: 'budgetVariance', operator: 'greaterThan', value: 0 }],
  },
];
