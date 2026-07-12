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

export function isRoleEnabled(rolesEnabled: Record<string, boolean>, role: string): boolean {
  if (role === 'super_admin') {
    return true;
  }

  const value = rolesEnabled?.[role];
  return value !== false;
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
