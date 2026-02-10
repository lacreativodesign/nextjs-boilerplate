import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminOrSuper } from "@/app/api/admin/_utils";
import { StorageService } from "@/lib/storage/storage-service";
import type { Document } from "@/types/documents";

export const runtime = "nodejs";

function hasDocumentAccess(document: Document, user: { uid: string; role: string }) {
  if (document.visibility === "public" || document.visibility === "team") {
    return true;
  }
  if (document.uploadedBy === user.uid) {
    return true;
  }
  if (document.sharedWith?.includes(user.uid)) {
    return true;
  }
  if (document.allowedRoles?.includes(user.role)) {
    return true;
  }
  return isAdminOrSuper(user.role);
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const doc = await adminDb.collection("documents").doc(params.id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const document = doc.data() as Document;
    if (document.tenantId !== session.tenantId || !hasDocumentAccess(document, session)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const downloadUrl = await StorageService.getDownloadUrl(params.id);

    return NextResponse.json({ downloadUrl });
  } catch (error) {
    console.error("Error generating download URL:", error);
    return NextResponse.json({ error: "Failed to generate download URL" }, { status: 500 });
  }
}
