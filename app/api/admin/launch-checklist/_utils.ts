import { isSuperAdmin, requireAdminOrSuperAdmin } from '../_utils';

/** Global launch controls affect every tenant and therefore belong to platform governance only. */
export async function requireLaunchChecklistSuperAdmin() {
  const auth = await requireAdminOrSuperAdmin();
  if (!auth.ok) return auth;

  if (!isSuperAdmin(auth.user.role)) {
    return { ok: false as const, status: 403, error: 'Forbidden' };
  }

  return auth;
}
