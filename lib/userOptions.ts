export const USER_ROLE_VALUES = [
  "super_admin",
  "admin",
  "sales_manager",
  "sales",
  "account_manager",
  "production",
  "hr",
  "finance",
  "client",
] as const;

export type UserRole = (typeof USER_ROLE_VALUES)[number];

export const INTERNAL_ROLE_OPTIONS = [
  "super_admin",
  "admin",
  "sales_manager",
  "sales",
  "account_manager",
  "production",
  "hr",
  "finance",
] as const;

export type InternalRole = (typeof INTERNAL_ROLE_OPTIONS)[number];

export const USER_DEPARTMENT_VALUES = [
  "admin",
  "sales",
  "account_manager",
  "production",
  "hr",
  "finance",
] as const;

export type UserDepartment = (typeof USER_DEPARTMENT_VALUES)[number];

const DEFAULT_DEPARTMENT_BY_ROLE: Record<InternalRole, UserDepartment> = {
  super_admin: "admin",
  admin: "admin",
  sales_manager: "sales",
  sales: "sales",
  account_manager: "account_manager",
  production: "production",
  hr: "hr",
  finance: "finance",
};

export function getDefaultDepartmentForRole(role: string) {
  if (role in DEFAULT_DEPARTMENT_BY_ROLE) {
    return DEFAULT_DEPARTMENT_BY_ROLE[role as InternalRole];
  }
  return null;
}
