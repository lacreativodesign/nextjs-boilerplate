import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminOrSuper } from "@/app/api/admin/_utils";
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

export async function GET(request: Request) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get("folderId");
    const category = searchParams.get("category");
    const relatedResourceId = searchParams.get("relatedResourceId");
    const tag = searchParams.get("tag");
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10), 1), 100);

    let query: FirebaseFirestore.Query = adminDb
      .collection("documents")
      .where("tenantId", "==", session.tenantId)
      .where("deletedAt", "==", null);

    if (folderId) {
      query = query.where("folderId", "==", folderId);
    }

    if (category) {
      query = query.where("category", "==", category);
    }

    if (relatedResourceId) {
      query = query.where("relatedResourceId", "==", relatedResourceId);
    }

    if (tag) {
      query = query.where("tags", "array-contains", tag);
    }

    query = query.orderBy("createdAt", "desc");

    const snapshot = await query.get();
    const documents = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() } as Document))
      .filter((doc) => hasDocumentAccess(doc, session))
      .filter((doc) => !doc.deletedAt);

    const offset = (page - 1) * limit;
    const paged = documents.slice(offset, offset + limit);

    return NextResponse.json({
      documents: paged,
      pagination: {
        page,
        limit,
        total: documents.length,
      },
    });
  } catch (error) {
    console.error("Error fetching documents:", error);
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
  }
}
