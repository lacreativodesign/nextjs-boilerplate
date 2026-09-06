import { DEFAULT_ROLES } from '@/lib/tenant/constants';

/**
 * S6: fails closed. This previously returned `value !== false`, so a module KEY THAT
 * WAS ABSENT counted as enabled — meaning a tenant with no module map (or a map that
 * simply omitted `finance`) was treated as having every module switched on. A module
 * must now be explicitly true.
 */
export function isModuleEnabled(
  modulesEnabled: Record<string, boolean>,
  moduleKey: string,
): boolean {
  return modulesEnabled?.[moduleKey] === true;
}

export type TenantRoleKey = keyof typeof DEFAULT_ROLES;
export type TenantRoleMap = Record<TenantRoleKey, boolean>;

/**
 * Normalizes the tenant role allow-list without turning malformed/partial data into
 * privilege. A completely missing map is treated as the historical default (all
 * canonical tenant roles enabled) so legacy tenants keep working. Once a map exists,
 * however, every role must be explicitly true; omitted or non-boolean values fail
 * closed.
 */
export function resolveTenantRoles(rolesEnabled: unknown): TenantRoleMap {
  if (rolesEnabled === undefined || rolesEnabled === null) {
    return { ...DEFAULT_ROLES };
  }

  if (typeof rolesEnabled !== 'object' || Array.isArray(rolesEnabled)) {
    return Object.keys(DEFAULT_ROLES).reduce((acc, key) => {
      acc[key as TenantRoleKey] = false;
      return acc;
    }, {} as TenantRoleMap);
  }

  const input = rolesEnabled as Record<string, unknown>;
  return Object.keys(DEFAULT_ROLES).reduce((acc, key) => {
    acc[key as TenantRoleKey] = input[key] === true;
    return acc;
  }, {} as TenantRoleMap);
}

export function isRoleEnabled(rolesEnabled: Record<string, boolean>, role: string): boolean {
  if (role === 'super_admin') {
    return true;
  }

  return rolesEnabled?.[role] === true;
}

export function getEnabledModules(modulesEnabled: Record<string, boolean>): string[] {
  return Object.keys(modulesEnabled || {}).filter((key) => isModuleEnabled(modulesEnabled, key));
}

export function getEnabledRoles(rolesEnabled: Record<string, boolean>): string[] {
  const enabledRoles = Object.keys(rolesEnabled || {}).filter((key) =>
    isRoleEnabled(rolesEnabled, key),
  );

  if (!enabledRoles.includes('super_admin')) {
    enabledRoles.push('super_admin');
  }

  return enabledRoles;
}
