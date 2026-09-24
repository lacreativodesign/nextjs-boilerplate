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

/**
 * P0-07: the tenant prefix a browser-direct upload surface is allowed to register, bound
 * to the resource the record is for.
 *
 * Once downloads are minted server-side from a record's `storagePath`, that path is what
 * the download authorizes — so it has to be the object the record is actually about. A
 * tenant-prefix check alone would let an HR user register an `employeeDocuments` record
 * naming `tenants/{t}/projects/{p}/brief.pdf` and then download a project file through
 * the HR route, or let a production user register a record on a project they are
 * assigned to that names a file on one they are not. Binding the prefix to the surface
 * AND to the project/employee closes both: the only objects a caller can register are
 * ones under the resource the route has just authorized them for.
 */
export type StorageSurface = 'project' | 'client' | 'employee' | 'employee-document';

const SURFACE_PREFIX: Record<StorageSurface, string> = {
  project: 'projects',
  client: 'client-files',
  employee: 'employees',
  'employee-document': 'employee-documents',
};

/** `tenants/{tenantId}/{surface-prefix}/{resourceId}/` — the only valid registration root. */
export function surfaceStorageRoot(
  surface: StorageSurface,
  tenantId: string,
  resourceId: string,
): string | null {
  const tenant = String(tenantId ?? '').trim();
  const resource = String(resourceId ?? '').trim();
  if (!tenant || !resource) return null;
  if (
    [tenant, resource].some((seg) => seg.includes('/') || seg.includes('\\') || seg.includes('..'))
  ) {
    return null;
  }
  return `${TENANT_STORAGE_ROOT}/${tenant}/${SURFACE_PREFIX[surface]}/${resource}/`;
}

/** True when `storagePath` is a tenant path under exactly this surface and resource. */
export function isSurfaceStoragePath(
  storagePath: string,
  tenantId: string,
  surface: StorageSurface,
  resourceId: string,
): boolean {
  const root = surfaceStorageRoot(surface, tenantId, resourceId);
  if (!root || !isTenantStoragePath(storagePath, tenantId)) return false;
  const clean = String(storagePath).trim();
  return clean.startsWith(root) && clean.length > root.length;
}
