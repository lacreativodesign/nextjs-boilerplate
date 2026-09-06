export const USER_ROLE_VALUES = [
  'super_admin',
  'admin',
  'sales_manager',
  'sales',
  'am_manager',
  'am',
  'production_manager',
  'production',
  'hr',
  'finance',
  'client',
] as const;

export type UserRole = (typeof USER_ROLE_VALUES)[number];

// Tenant-facing staff controls must never offer the platform-only `super_admin`
// role. Platform administration uses USER_ROLE_VALUES / dedicated Super Admin UI.
export const INTERNAL_ROLE_OPTIONS = [
  'admin',
  'sales_manager',
  'sales',
  'am_manager',
  'am',
  'production_manager',
  'production',
  'hr',
  'finance',
] as const;

export type InternalRole = (typeof INTERNAL_ROLE_OPTIONS)[number];

export const USER_DEPARTMENT_VALUES = [
  'admin',
  'sales',
  'am',
  'production',
  'hr',
  'finance',
] as const;

export type UserDepartment = (typeof USER_DEPARTMENT_VALUES)[number];

const DEFAULT_DEPARTMENT_BY_ROLE: Record<InternalRole, UserDepartment> = {
  admin: 'admin',
  sales_manager: 'sales',
  sales: 'sales',
  am_manager: 'am',
  am: 'am',
  production_manager: 'production',
  production: 'production',
  hr: 'hr',
  finance: 'finance',
};

export function getDefaultDepartmentForRole(role: string) {
  if (role in DEFAULT_DEPARTMENT_BY_ROLE) {
    return DEFAULT_DEPARTMENT_BY_ROLE[role as InternalRole];
  }
  return null;
}
