/**
 * S4: canonical tenant-scoped Firebase Storage paths.
 *
 * Storage objects were previously written to flat, global prefixes
 * (`projects/...`, `employees/...`, `client-files/...`). Those paths contain no
 * tenant, so Firebase Storage rules had no way to enforce tenant isolation: any
 * authenticated user in any tenant could address any other tenant's object.
 *
 * Every object now lives under `tenants/{tenantId}/...`, which lets Storage rules
 * compare the tenant segment of the path against the caller's `tenantId` custom
 * claim. The tenant is read from the caller's own ID token — never from user input.
 */
export const TENANT_STORAGE_ROOT = 'tenants';

/**
 * Reads the caller's tenantId from their Firebase ID token custom claims.
 * Fails closed: a session without a tenant claim cannot upload.
 */
export async function getCurrentTenantId(): Promise<string> {
  // Imported lazily so that the pure path builders below carry no Firebase
  // dependency and remain testable in a plain Node environment.
  const { getFirebaseAuth } = await import('@/lib/firebaseClient');
  const auth = await getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You are not signed in.');
  }
  const token = await user.getIdTokenResult();
  const tenantId = String((token.claims as Record<string, unknown>)?.tenantId || '').trim();
  if (!tenantId) {
    throw new Error('Your account is missing a tenant assignment. Contact your administrator.');
  }
  return tenantId;
}

/**
 * Rejects segments that could escape the tenant prefix via traversal or injection.
 */
function safeSegment(value: string, label: string): string {
  const clean = String(value ?? '').trim();
  if (!clean || clean.includes('/') || clean.includes('\\') || clean.includes('..')) {
    throw new Error(`Invalid ${label}.`);
  }
  return clean;
}

/**
 * S5 (server-side): confirms a client-supplied storagePath actually lives inside the
 * caller's own tenant prefix.
 *
 * The upload APIs persist a storagePath taken straight from the request body. Without
 * this check a caller in tenant A can store a record pointing at
 * `tenants/B/...`, or at a legacy flat path, or escape the prefix via traversal.
 * Storage rules block the *object* access; this blocks the *reference* being written.
 */
export function isTenantStoragePath(storagePath: string, tenantId: string): boolean {
  const cleanPath = String(storagePath ?? '').trim();
  const cleanTenant = String(tenantId ?? '').trim();
  if (!cleanPath || !cleanTenant) return false;
  if (cleanPath.startsWith('/')) return false;
  if (cleanPath.includes('..')) return false;
  if (cleanPath.includes('\\')) return false;
  return cleanPath.startsWith(`${TENANT_STORAGE_ROOT}/${cleanTenant}/`);
}

/** tenants/{tenantId}/projects/{projectId}/{category}/{fileId}_{safeName} */
export function tenantProjectFilePath(args: {
  tenantId: string;
  projectId: string;
  category: string;
  fileId: string;
  safeName: string;
}): string {
  return [
    TENANT_STORAGE_ROOT,
    safeSegment(args.tenantId, 'tenant'),
    'projects',
    safeSegment(args.projectId, 'project'),
    safeSegment(args.category, 'category'),
    `${safeSegment(args.fileId, 'file id')}_${safeSegment(args.safeName, 'file name')}`,
  ].join('/');
}

/** tenants/{tenantId}/client-files/{projectId}/{fileId}_{safeName} */
export function tenantClientFilePath(args: {
  tenantId: string;
  projectId: string;
  fileId: string;
  safeName: string;
}): string {
  return [
    TENANT_STORAGE_ROOT,
    safeSegment(args.tenantId, 'tenant'),
    'client-files',
    safeSegment(args.projectId, 'project'),
    `${safeSegment(args.fileId, 'file id')}_${safeSegment(args.safeName, 'file name')}`,
  ].join('/');
}

/** tenants/{tenantId}/employees/{userId}/{docType}/{docId}_{safeName} */
export function tenantEmployeeFilePath(args: {
  tenantId: string;
  userId: string;
  docType: string;
  docId: string;
  safeName: string;
}): string {
  return [
    TENANT_STORAGE_ROOT,
    safeSegment(args.tenantId, 'tenant'),
    'employees',
    safeSegment(args.userId, 'employee'),
    safeSegment(args.docType, 'document type'),
    `${safeSegment(args.docId, 'document id')}_${safeSegment(args.safeName, 'file name')}`,
  ].join('/');
}

/** tenants/{tenantId}/employee-documents/{userId}/{docId}_{safeName} */
export function tenantEmployeeDocumentPath(args: {
  tenantId: string;
  userId: string;
  docId: string;
  safeName: string;
}): string {
  return [
    TENANT_STORAGE_ROOT,
    safeSegment(args.tenantId, 'tenant'),
    'employee-documents',
    safeSegment(args.userId, 'employee'),
    `${safeSegment(args.docId, 'document id')}_${safeSegment(args.safeName, 'file name')}`,
  ].join('/');
}
