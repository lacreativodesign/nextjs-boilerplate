import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminOrSuper } from "../../../_utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FileDoc = {
  projectId?: string;
  category?: string;
  fileName?: string;
  downloadUrl?: string;
  uploadedByName?: string;
  uploadedAt?: any;
  isLatest?: boolean;
  isDeleted?: boolean;
};

function toISO(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

export async function GET(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdminOrSuper(me.role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = String(searchParams.get("projectId") || "").trim();

    const snap = await adminDb.collection("files").where("isDeleted", "==", false).limit(500).get();

    let files = snap.docs.map((doc) => {
      const data = doc.data() as FileDoc;
      return {
        id: doc.id,
        projectId: data.projectId || "",
        category: data.category || "Other",
        fileName: data.fileName || "",
        downloadUrl: data.downloadUrl || "",
        uploadedByName: data.uploadedByName || "",
        uploadedAt: toISO(data.uploadedAt),
        isLatest: data.isLatest ?? true,
      };
    });

    if (projectId) {
      files = files.filter((file) => file.projectId === projectId);
    }

    return NextResponse.json({ ok: true, files });
  } catch (err: any) {
    console.error("production/files list error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load files right now.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
