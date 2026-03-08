import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { getValidGoogleAccessToken } from "@/lib/integrations/google-auth";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";

async function driveRequest<T>(tenantId: string, path: string, init: RequestInit = {}) {
  const token = await getValidGoogleAccessToken(tenantId);
  const response = await fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(data?.error?.message || "Google Drive request failed.");
  return data;
}

export async function ensureDriveFolderMapping(params: {
  tenantId: string;
  bizostoFolderId: string;
  folderName: string;
  parentDriveFolderId?: string;
}) {
  const mapRef = adminDb
    .collection("tenants")
    .doc(params.tenantId)
    .collection("integrations")
    .doc("googleWorkspace")
    .collection("driveFolderMap")
    .doc(params.bizostoFolderId);
  const existing = await mapRef.get();
  if (existing.exists && existing.data()?.driveFolderId) {
    return { driveFolderId: existing.data()?.driveFolderId as string, created: false };
  }

  const created = await driveRequest<{ id: string }>(params.tenantId, "/files?fields=id", {
    method: "POST",
    body: JSON.stringify({
      name: params.folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: params.parentDriveFolderId ? [params.parentDriveFolderId] : undefined,
    }),
  });

  await mapRef.set(
    {
      bizostoFolderId: params.bizostoFolderId,
      driveFolderId: created.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { driveFolderId: created.id, created: true };
}

export async function uploadFileToGoogleDrive(params: {
  tenantId: string;
  fileName: string;
  mimeType: string;
  base64Content: string;
  driveFolderId?: string;
}) {
  const token = await getValidGoogleAccessToken(params.tenantId);
  const metadata = {
    name: params.fileName,
    parents: params.driveFolderId ? [params.driveFolderId] : undefined,
  };

  const boundary = `bizosto-${Date.now()}`;
  const payload = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${params.mimeType}`,
    "Content-Transfer-Encoding: base64",
    "",
    params.base64Content,
    `--${boundary}--`,
  ].join("\r\n");

  const response = await fetch(`${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,name,webViewLink,webContentLink`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: payload,
  });

  const data = (await response.json().catch(() => ({}))) as any;
  if (!response.ok || !data?.id) {
    throw new Error(data?.error?.message || "Google Drive upload failed.");
  }

  return {
    fileId: data.id,
    name: data.name,
    webViewLink: data.webViewLink || null,
    webContentLink: data.webContentLink || null,
  };
}

export async function shareDriveFile(params: { tenantId: string; fileId: string; email?: string; role?: "reader" | "commenter" | "writer" }) {
  const role = params.role || "reader";
  const body = params.email ? { type: "user", role, emailAddress: params.email } : { type: "anyone", role };
  await driveRequest(params.tenantId, `/files/${encodeURIComponent(params.fileId)}/permissions`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return driveRequest<{ webViewLink?: string }>(params.tenantId, `/files/${encodeURIComponent(params.fileId)}?fields=webViewLink`);
}

export async function listDriveFolders(tenantId: string) {
  return driveRequest<{ files?: Array<{ id: string; name: string }> }>(
    tenantId,
    "/files?q=mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id,name)&pageSize=1000"
  );
}
