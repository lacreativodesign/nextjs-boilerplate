import { getCurrentUser, normalizeRole } from '@/app/api/admin/_utils';
import { requireClient } from '@/app/api/client/_utils';
import { authorizeProjectFileDownload } from '@/lib/files/project-file-access';
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
 * P0-07 — download one project file (`files` collection: project deliverables, briefs and
 * client uploads).
 *
 * Replaces the Firebase `downloadUrl` these records used to carry. The route re-derives
 * the caller from the session, applies the same per-role project ACL the list routes use
 * (lib/files/project-file-access.ts), and only then mints a signed URL that expires in
 * minutes. Nothing about the URL is stored.
 */
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  try {
    const me = await getCurrentUser();
    if (!me) return downloadRefusal(401, 'Unauthorized');

    // A client's clientId is resolved from their portal profile, exactly as every
    // /api/client/* route resolves it — never from the request.
    let clientId: string | null = null;
    if (normalizeRole(me.role) === 'client') {
      const auth = await requireClient();
      if (!auth.ok) return downloadRefusal(auth.status, auth.error);
      clientId = auth.clientId;
    }

    const access = await authorizeProjectFileDownload(
      { uid: me.uid, role: me.role, tenantId: me.tenantId, clientId },
      id,
    );
    if (!access.ok) return downloadRefusal(access.status, access.error, access.code);

    const minted = await mintProtectedDownloadUrl({
      storagePath: access.record.storagePath,
      tenantId: access.record.tenantId,
      // Deliverables live under projects/{projectId}/, client uploads under
      // client-files/{projectId}/ — of THIS record's project, nothing else.
      allowedRoots: [
        surfaceStorageRoot('project', access.record.tenantId, access.record.projectId),
        surfaceStorageRoot('client', access.record.tenantId, access.record.projectId),
      ],
      fileName: access.record.fileName,
    });
    return protectedDownloadResponse(request, minted);
  } catch (error) {
    return protectedDownloadError(error, 'project-files');
  }
}
