import { adminDb } from '@/lib/firebaseAdmin';
import { requireHrAccess } from '../../../_utils';
import { surfaceStorageRoot } from '@/lib/storage/paths';
import {
  downloadRefusal,
  mintProtectedDownloadUrl,
  protectedDownloadError,
  protectedDownloadResponse,
} from '@/lib/storage/protected-download';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * P0-07 — download one HR employee document (`employeeDocuments`).
 *
 * Contracts, passports and ID documents used to be served by a Firebase `downloadUrl`
 * stored on the record and rendered as a plain link — a permanent bearer URL for the
 * most sensitive files the product holds. Access now matches the two HR document lists
 * that expose these records (/api/hr/documents/list and /api/admin/hr/documents/list):
 * requireHrAccess() — hr, admin or super_admin, with the `hr` plan module — in the
 * caller's own tenant, for a record that is not deleted. Only then is a signed URL
 * minted, and it expires in minutes.
 */
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  try {
    const access = await requireHrAccess();
    if (!access.ok) return downloadRefusal(access.status, access.error);

    const docId = String(id || '').trim();
    if (!docId || docId.includes('/')) return downloadRefusal(404, 'Document not found');

    const snap = await adminDb.collection('employeeDocuments').doc(docId).get();
    const data = snap.exists ? snap.data() || {} : null;
    // Missing, another tenant's, or deleted: one indistinguishable 404.
    if (
      !data ||
      String(data.tenantId || '') !== String(access.user.tenantId || '') ||
      data.isDeleted === true
    ) {
      return downloadRefusal(404, 'Document not found');
    }
    if (data.virusScanStatus === 'infected') {
      return downloadRefusal(
        403,
        'This file was flagged as malicious by a virus scan and cannot be downloaded. ' +
          'Contact your administrator.',
        'file_infected',
      );
    }

    const tenantId = String(access.user.tenantId || '');
    const employeeId = String(data.userId || '');
    const minted = await mintProtectedDownloadUrl({
      storagePath: String(data.storagePath || ''),
      tenantId,
      // /hr/documents writes employee-documents/{userId}/, /admin/hr/documents writes
      // employees/{userId}/ — both for the employee this record names, nobody else.
      allowedRoots: [
        surfaceStorageRoot('employee-document', tenantId, employeeId),
        surfaceStorageRoot('employee', tenantId, employeeId),
      ],
      fileName: String(data.fileName || 'document'),
    });
    return protectedDownloadResponse(request, minted);
  } catch (error) {
    return protectedDownloadError(error, 'hr-documents');
  }
}
