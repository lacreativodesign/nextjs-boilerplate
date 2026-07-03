export function isModuleEnabled(
  modulesEnabled: Record<string, boolean>,
  moduleKey: string,
): boolean {
  const value = modulesEnabled?.[moduleKey];
  return value !== false;
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
