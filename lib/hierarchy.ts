export const ELIGIBLE_MANAGER_ROLES: Record<string, string[]> = {
  sales: ['sales_manager', 'admin'],
  sales_manager: ['admin'],
  am: ['am_manager', 'admin'],
  am_manager: ['admin'],
  production: ['production_manager', 'admin'],
  production_manager: ['admin'],
  hr: ['admin'],
  finance: ['admin'],
  admin: [],
  super_admin: [],
};

export function eligibleManagerRolesFor(role: string): string[] {
  return ELIGIBLE_MANAGER_ROLES[role] ?? [];
}
