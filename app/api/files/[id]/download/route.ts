import { getCurrentUser } from '@/app/api/admin/_utils';
import { FileManager } from '@/lib/files/file-manager';
import {
  downloadRefusal,
  mintProtectedDownloadUrl,
  protectedDownloadError,
  protectedDownloadResponse,
  type Disposition,
} from '@/lib/storage/protected-download';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Download (or, with ?disposition=inline, preview) one managed file.
 *
 * P0-07: this route signed a URL for ANY member of the tenant, although every managed
 * file carries a visibility/allowedRoles/allowedUsers ACL. It now enforces that ACL
 * (FileManager.canAccessFile), keeps the deleted-file and cross-tenant 404, and mints a
 * URL that lives for minutes. `?format=json` returns the URL for the preview modal; a plain
 * navigation is redirected.
 */
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) return downloadRefusal(401, 'Unauthorized');

    // getFileById() already returns null for another tenant's file and a deleted one.
    const file = await FileManager.getFileById(params.id, session.tenantId);
    if (!file) return downloadRefusal(404, 'File not found');
    if (!FileManager.canAccessFile(file, session)) return downloadRefusal(403, 'Forbidden');

    const disposition: Disposition =
      new URL(request.url).searchParams.get('disposition') === 'inline' ? 'inline' : 'attachment';

    const minted = await mintProtectedDownloadUrl({
      storagePath: file.storagePath,
      tenantId: session.tenantId,
      allowedRoots: [`tenants/${session.tenantId}/files/${file.id}/`],
      fileName: file.name,
      disposition,
      ...(disposition === 'inline' && file.mimeType ? { contentType: file.mimeType } : {}),
    });
    return protectedDownloadResponse(request, minted);
  } catch (error) {
    return protectedDownloadError(error, 'managed-files');
  }
}
