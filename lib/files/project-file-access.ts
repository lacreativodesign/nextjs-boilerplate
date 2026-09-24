import { adminDb } from '@/lib/firebaseAdmin';
import { normalizeRole } from '@/app/api/admin/_utils';
import { isOwnedByAm } from '@/app/api/am/_utils';
import { isAssignedToProduction } from '@/app/api/production/_utils';
import { checkModuleAccess } from '@/app/lib/plan-enforcement';

/**
 * P0-07 — who may download a `files` record (project deliverables and client uploads).
 *
 * These records used to carry a Firebase `downloadUrl` that every list route handed to
 * the browser, so "who may download" was simply "who has ever seen the list" — forever,
 * and to anyone they forwarded the link to. Downloads now go through
 * /api/project-files/[id]/download, and this function is the authorization it runs. It
 * is deliberately the UNION of the list routes that already expose each record, and
 * nothing wider, so no role loses a download it had and none gains one:
 *
 *   admin, super_admin, sales_manager   every record in their tenant
 *                                       (/api/admin/files/list, /api/admin/production/files/list)
 *   am                                  projects they own
 *                                       (/api/am/files/list, /api/admin/files/list)
 *   production, production_manager      projects they are assigned to
 *                                       (/api/production/files/list, /api/admin/files/list)
 *   client                              their own client's files and projects
 *                                       (/api/client/files/list, /api/client/projects/get)
 *   anyone else                         nothing
 *
 * A generic "same tenant may download" check would have been simpler and wrong: a
 * production user would reach every client's deliverables, and a client every other
 * client's uploads.
 *
 * Status codes follow the existing routes: a record in another tenant, a deleted record
 * and a missing record are all 404 (no existence oracle across tenants); a record in the
 * caller's tenant that the caller may not open is 403.
 */

export type ProjectFileCaller = {
  uid: string;
  role: string;
  tenantId?: string | null;
  clientId?: string | null;
};

export type ProjectFileRecord = {
  id: string;
  tenantId: string;
  projectId: string;
  clientId: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
};

export type ProjectFileAccess =
  | { ok: true; record: ProjectFileRecord }
  | { ok: false; status: number; error: string; code?: string };

const NOT_FOUND: ProjectFileAccess = { ok: false, status: 404, error: 'File not found.' };
const FORBIDDEN: ProjectFileAccess = { ok: false, status: 403, error: 'Forbidden' };

type ProjectDoc = {
  tenantId?: string;
  clientId?: string | null;
  isDeleted?: boolean;
  ownerAmUid?: string | null;
  ownerId?: string | null;
  amId?: string | null;
  createdByUid?: string | null;
  productionUid?: string | null;
  productionOwnerId?: string | null;
  assignedProductionIds?: string[] | null;
};

const text = (value: unknown) => String(value ?? '').trim();

/** AM ownership exactly as /api/am/files/list and /api/admin/files/list establish it. */
function amOwns(project: ProjectDoc, uid: string): boolean {
  if (isOwnedByAm(project, uid)) return true;
  // /api/admin/files/list also shows an AM the projects they created that have no owner.
  return !project.ownerAmUid && Boolean(project.createdByUid) && project.createdByUid === uid;
}

export async function authorizeProjectFileDownload(
  caller: ProjectFileCaller | null,
  fileId: string,
): Promise<ProjectFileAccess> {
  if (!caller?.uid) return { ok: false, status: 401, error: 'Unauthorized' };
  const tenantId = text(caller.tenantId);
  if (!tenantId) return { ok: false, status: 403, error: 'Tenant context missing.' };

  const id = text(fileId);
  if (!id || id.includes('/')) return NOT_FOUND;

  const snap = await adminDb.collection('files').doc(id).get();
  if (!snap.exists) return NOT_FOUND;
  const data = snap.data() || {};

  // Another tenant's record is indistinguishable from a missing one.
  if (text(data.tenantId) !== tenantId) return NOT_FOUND;
  // A soft-deleted record is gone for every role, including admin.
  if (data.isDeleted === true) return NOT_FOUND;

  // Same download-time gate as /api/documents/[id]/download: a definitive 'infected'
  // verdict is never served, whoever asks.
  if (data.virusScanStatus === 'infected') {
    return {
      ok: false,
      status: 403,
      code: 'file_infected',
      error:
        'This file was flagged as malicious by a virus scan and cannot be downloaded. ' +
        'Contact your administrator.',
    };
  }

  const record: ProjectFileRecord = {
    id,
    tenantId,
    projectId: text(data.projectId),
    clientId: text(data.clientId),
    fileName: text(data.fileName) || 'download',
    storagePath: text(data.storagePath),
    mimeType: text(data.mimeType),
  };

  const role = normalizeRole(caller.role);

  // Tenant-wide viewers: exactly the roles /api/admin/files/list does not narrow.
  if (role === 'admin' || role === 'super_admin' || role === 'sales_manager') {
    return { ok: true, record };
  }

  if (!['am', 'production', 'production_manager', 'client'].includes(role)) return FORBIDDEN;

  // Every narrower role is scoped by the project, so the project must exist, be live and
  // belong to this tenant.
  if (!record.projectId) return FORBIDDEN;
  const projectSnap = await adminDb.collection('projects').doc(record.projectId).get();
  if (!projectSnap.exists) return FORBIDDEN;
  const project = (projectSnap.data() || {}) as ProjectDoc;
  if (text(project.tenantId) !== tenantId || project.isDeleted === true) return FORBIDDEN;

  if (role === 'am') {
    // P-1: the same plan entitlement getAmUser() enforces on every /api/am/* route.
    const plan = await checkModuleAccess(tenantId, 'sales', caller.role);
    if (!plan.ok) return FORBIDDEN;
    return amOwns(project, caller.uid) ? { ok: true, record } : FORBIDDEN;
  }

  if (role === 'production' || role === 'production_manager') {
    const plan = await checkModuleAccess(tenantId, 'production', caller.role);
    if (!plan.ok) return FORBIDDEN;
    return isAssignedToProduction(
      {
        productionUid: project.productionUid ?? null,
        productionOwnerId: project.productionOwnerId ?? null,
        assignedProductionIds: project.assignedProductionIds ?? null,
      },
      caller.uid,
    )
      ? { ok: true, record }
      : FORBIDDEN;
  }

  // client
  const clientId = text(caller.clientId);
  if (!clientId) return FORBIDDEN;
  if (record.clientId === clientId || text(project.clientId) === clientId) {
    return { ok: true, record };
  }
  return FORBIDDEN;
}
