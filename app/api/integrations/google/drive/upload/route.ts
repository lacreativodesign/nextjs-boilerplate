import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/admin/settings/_utils';
import {
  ensureDriveFolderMapping,
  listDriveFolders,
  shareDriveFile,
  uploadFileToGoogleDrive,
} from '@/lib/integrations/google-drive';
import { validateAssembledFile } from '@/lib/files/validation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok)
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || 'upload');

    if (action === 'upload') {
      if (!body.fileName || !body.mimeType || !body.base64Content) {
        return NextResponse.json(
          { ok: false, error: 'fileName, mimeType and base64Content are required.' },
          { status: 400 },
        );
      }

      // Decode the payload and validate the ACTUAL bytes: the base64 length only yields
      // an estimated size, and the filename/MIME the caller sends are not evidence of
      // content. A magic-byte check on the decoded buffer blocks a renamed executable.
      const decoded = Buffer.from(String(body.base64Content), 'base64');
      const assembledCheck = validateAssembledFile(decoded, String(body.fileName), decoded.length);
      if (!assembledCheck.valid) {
        return NextResponse.json({ ok: false, error: assembledCheck.error }, { status: 400 });
      }

      const uploaded = await uploadFileToGoogleDrive({
        tenantId: auth.user.tenantId,
        fileName: String(body.fileName),
        mimeType: String(body.mimeType),
        base64Content: String(body.base64Content),
        driveFolderId: body.driveFolderId ? String(body.driveFolderId) : undefined,
      });
      return NextResponse.json({ ok: true, action, file: uploaded });
    }

    if (action === 'sync_folder') {
      if (!body.bizostoFolderId || !body.folderName) {
        return NextResponse.json(
          { ok: false, error: 'bizostoFolderId and folderName are required.' },
          { status: 400 },
        );
      }
      const mapping = await ensureDriveFolderMapping({
        tenantId: auth.user.tenantId,
        bizostoFolderId: String(body.bizostoFolderId),
        folderName: String(body.folderName),
        parentDriveFolderId: body.parentDriveFolderId
          ? String(body.parentDriveFolderId)
          : undefined,
      });
      return NextResponse.json({ ok: true, action, mapping });
    }

    if (action === 'share') {
      if (!body.fileId)
        return NextResponse.json({ ok: false, error: 'fileId is required.' }, { status: 400 });
      const shared = await shareDriveFile({
        tenantId: auth.user.tenantId,
        fileId: String(body.fileId),
        email: body.email ? String(body.email) : undefined,
        role: body.role,
      });
      return NextResponse.json({ ok: true, action, file: shared });
    }

    if (action === 'list_folders') {
      const folders = await listDriveFolders(auth.user.tenantId);
      return NextResponse.json({ ok: true, action, folders: folders.files || [] });
    }

    return NextResponse.json({ ok: false, error: 'Unsupported Drive action.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Drive operation failed.' },
      { status: 500 },
    );
  }
}
