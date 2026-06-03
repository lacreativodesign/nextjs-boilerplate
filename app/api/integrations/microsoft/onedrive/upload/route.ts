import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/settings/_utils";
import { ensureOneDriveFolderMapping, listOneDriveFolders, shareOneDriveFile, uploadFileToOneDrive } from "@/lib/integrations/onedrive";
import { validateFile } from "@/lib/files/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      fileName?: string;
      base64Content?: string;
      oneDriveFolderId?: string;
      bizostoFolderId?: string;
      folderName?: string;
      parentOneDriveFolderId?: string;
      fileId?: string;
      shareType?: "view" | "edit" | "embed";
      parentFolderId?: string;
    };

    const action = String(body.action || "upload");

    if (action === "upload") {
      if (!body.fileName || !body.base64Content) {
        return NextResponse.json({ ok: false, error: "fileName and base64Content are required." }, { status: 400 });
      }

      const sizeBytes = Math.ceil(String(body.base64Content).length * 3 / 4);
      const fileValidation = validateFile(String(body.fileName), sizeBytes);
      if (!fileValidation.valid) {
        return NextResponse.json({ ok: false, error: fileValidation.error }, { status: 400 });
      }

      const uploaded = await uploadFileToOneDrive({
        tenantId: auth.user.tenantId,
        fileName: String(body.fileName),
        base64Content: String(body.base64Content),
        oneDriveFolderId: body.oneDriveFolderId ? String(body.oneDriveFolderId) : undefined,
      });
      return NextResponse.json({ ok: true, action, file: uploaded });
    }

    if (action === "sync_folder") {
      if (!body.bizostoFolderId || !body.folderName) {
        return NextResponse.json({ ok: false, error: "bizostoFolderId and folderName are required." }, { status: 400 });
      }

      const mapping = await ensureOneDriveFolderMapping({
        tenantId: auth.user.tenantId,
        bizostoFolderId: String(body.bizostoFolderId),
        folderName: String(body.folderName),
        parentOneDriveFolderId: body.parentOneDriveFolderId ? String(body.parentOneDriveFolderId) : undefined,
      });
      return NextResponse.json({ ok: true, action, mapping });
    }

    if (action === "share") {
      if (!body.fileId) return NextResponse.json({ ok: false, error: "fileId is required." }, { status: 400 });
      const shared = await shareOneDriveFile({
        tenantId: auth.user.tenantId,
        fileId: String(body.fileId),
        type: body.shareType,
      });
      return NextResponse.json({ ok: true, action, file: shared });
    }

    if (action === "list_folders") {
      const folders = await listOneDriveFolders({
        tenantId: auth.user.tenantId,
        parentFolderId: body.parentFolderId ? String(body.parentFolderId) : undefined,
      });
      return NextResponse.json({ ok: true, action, folders: folders.folders });
    }

    return NextResponse.json({ ok: false, error: "Unsupported OneDrive action." }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "OneDrive operation failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
