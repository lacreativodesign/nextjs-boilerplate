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
  | "clients"
  | "documents";

export interface SearchFilter {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

export type GlobalSearchModule =
  | "users"
  | "customers"
  | "projects"
  | "invoices"
  | "documents"
  | "payments"
  | "expenses"
  | "inventory"
  | "search_index";

export interface GlobalSearchResult {
  id: string;
  module: GlobalSearchModule;
  title: string;
  subtitle: string;
  status?: string;
  date?: string;
  href: string;
  score: number;
  highlights: string[];
}
