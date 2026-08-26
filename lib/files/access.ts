import type { ManagedFile } from '@/types/files';

export type ManagedFileActor = {
  tenantId: string;
  uid: string;
  role?: string | null;
};

function normalizeRole(role?: string | null) {
  return String(role || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/^account_manager$/, 'am');
}

function isTenantAdministrator(role?: string | null) {
  const normalized = normalizeRole(role);
  return normalized === 'admin' || normalized === 'super_admin';
}

/**
 * Resource-level read authorization for the managed-file subsystem.
 * Tenant equality is always required; generic file routes never provide a
 * cross-tenant Super Admin bypass.
 */
export function canReadManagedFile(file: ManagedFile, actor: ManagedFileActor): boolean {
  if (!file || file.tenantId !== actor.tenantId || Boolean(file.deletedAt)) return false;
  if (isTenantAdministrator(actor.role) || file.uploadedBy === actor.uid) return true;

  const permissions = file.permissions;
  if (!permissions) return false;
  if (permissions.allowedUsers?.includes(actor.uid)) return true;

  const role = normalizeRole(actor.role);
  if (role && permissions.allowedRoles?.map(normalizeRole).includes(role)) return true;
  if (permissions.visibility === 'public') return true;
  if (permissions.visibility === 'team') return role !== '' && role !== 'client';
  return false;
}

/** Mutating, sharing, and version-restore actions remain owner/admin only. */
export function canManageManagedFile(file: ManagedFile, actor: ManagedFileActor): boolean {
  if (!file || file.tenantId !== actor.tenantId || Boolean(file.deletedAt)) return false;
  return file.uploadedBy === actor.uid || isTenantAdministrator(actor.role);
}
