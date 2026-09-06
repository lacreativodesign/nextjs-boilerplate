import { POST as updateEmployee } from '../../../../hr/employees/update/route';

export const runtime = 'nodejs';

/**
 * Backwards-compatible path adapter.
 *
 * This route was a second, divergent copy of the employee-update implementation. It
 * wrote `users/{uid}.role` from the request body with no canonical role check, no
 * `ManageRoles` assertion, no tenant `rolesEnabled` allow-list, no staff-seat
 * reservation on a client -> staff conversion and no Firebase claim sync, so an HR
 * actor could promote any tenant identity — including their own — to `admin`, and a
 * platform Super Admin could mint `super_admin` from a tenant surface. It also wrote
 * `status` directly, stepping around the dedicated deactivate/reactivate endpoints
 * where Firebase Auth is disabled, live sessions are revoked and the plan's seat
 * ceiling is re-checked.
 *
 * The application has one canonical employee-update implementation at
 * `/api/hr/employees/update`. Preserve the legacy URL for callers, but execute exactly
 * the same policy — the same resolution PR4 applied to the duplicated admin
 * user-update path.
 */
export async function POST(req: Request) {
  return updateEmployee(req);
}
