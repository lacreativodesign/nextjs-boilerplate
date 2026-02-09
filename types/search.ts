export type FilterOperator =
  | "equals"
  | "notEquals"
  | "contains"
  | "notContains"
  | "startsWith"
  | "endsWith"
  | "greaterThan"
  | "lessThan"
  | "greaterThanOrEqual"
  | "lessThanOrEqual"
  | "between"
  | "in"
  | "notIn"
  | "isNull"
  | "isNotNull";

export type SearchModule =
  | "invoices"
  | "customers"
  | "products"
  | "users"
  | "audit_logs"
  | "payments"
  | "expenses"
  | "clients";

export interface SearchFilter {
  field: string;
  operator: FilterOperator;
  value: unknown;
}
