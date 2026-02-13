import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { getValidMicrosoftAccessToken } from "@/lib/integrations/microsoft-auth";

const GRAPH_API = "https://graph.microsoft.com/v1.0";

async function oneDriveRequest<T>(tenantId: string, path: string, init: RequestInit = {}): Promise<T> {
  const token = await getValidMicrosoftAccessToken(tenantId);
  const response = await fetch(`${GRAPH_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || "OneDrive request failed.");
  return data;
}

export async function ensureOneDriveFolderMapping(params: {
  tenantId: string;
  bizostoFolderId: string;
  folderName: string;
  parentOneDriveFolderId?: string;
}) {
  const mapRef = adminDb
    .collection("tenants")
    .doc(params.tenantId)
    .collection("integrations")
    .doc("microsoft365")
    .collection("oneDriveFolderMap")
    .doc(params.bizostoFolderId);

  const existing = await mapRef.get();
  const oneDriveFolderId = existing.data()?.oneDriveFolderId as string | undefined;
  if (existing.exists && oneDriveFolderId) {
    return { oneDriveFolderId, created: false };
  }

  const parentPath = params.parentOneDriveFolderId ? `/me/drive/items/${encodeURIComponent(params.parentOneDriveFolderId)}/children` : "/me/drive/root/children";
  const created = await oneDriveRequest<{ id: string; name?: string }>(params.tenantId, parentPath, {
    method: "POST",
    body: JSON.stringify({
      name: params.folderName,
      folder: {},
      "@microsoft.graph.conflictBehavior": "rename",
    }),
  });

  await mapRef.set(
    {
      bizostoFolderId: params.bizostoFolderId,
      oneDriveFolderId: created.id,
      oneDriveFolderName: created.name || params.folderName,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { oneDriveFolderId: created.id, created: true };
}

export async function uploadFileToOneDrive(params: {
  tenantId: string;
  fileName: string;
  base64Content: string;
  oneDriveFolderId?: string;
}) {
  const token = await getValidMicrosoftAccessToken(params.tenantId);
  const targetPath = params.oneDriveFolderId
    ? `/me/drive/items/${encodeURIComponent(params.oneDriveFolderId)}:/${encodeURIComponent(params.fileName)}:/content`
    : `/me/drive/root:/${encodeURIComponent(params.fileName)}:/content`;

  const response = await fetch(`${GRAPH_API}${targetPath}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
    },
    body: Buffer.from(params.base64Content, "base64"),
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    webUrl?: string;
    "@microsoft.graph.downloadUrl"?: string;
    error?: { message?: string };
  };
  if (!response.ok || !data.id) {
    throw new Error(data.error?.message || "OneDrive upload failed.");
  }

  return {
    fileId: data.id,
    name: data.name || params.fileName,
    webUrl: data.webUrl || null,
    downloadUrl: data["@microsoft.graph.downloadUrl"] || null,
  };
}

export async function shareOneDriveFile(params: { tenantId: string; fileId: string; type?: "view" | "edit" | "embed" }) {
  const shared = await oneDriveRequest<{ link?: { webUrl?: string } }>(
    params.tenantId,
    `/me/drive/items/${encodeURIComponent(params.fileId)}/createLink`,
    {
      method: "POST",
      body: JSON.stringify({
        type: params.type || "view",
        scope: "organization",
      }),
    }
  );

  return { webUrl: shared.link?.webUrl || null };
}

export async function listOneDriveFolders(params: { tenantId: string; parentFolderId?: string }) {
  const path = params.parentFolderId
    ? `/me/drive/items/${encodeURIComponent(params.parentFolderId)}/children?$top=200&$select=id,name,folder,webUrl`
    : "/me/drive/root/children?$top=200&$select=id,name,folder,webUrl";

  const data = await oneDriveRequest<{ value?: Array<{ id?: string; name?: string; webUrl?: string; folder?: { childCount?: number } }> }>(
    params.tenantId,
    path
  );

  return {
    folders:
      data.value
        ?.filter((entry) => Boolean(entry.folder))
        .map((entry) => ({
          id: entry.id || "",
          name: entry.name || "",
          webUrl: entry.webUrl || null,
          childCount: entry.folder?.childCount || 0,
        })) || [],
  };
}
