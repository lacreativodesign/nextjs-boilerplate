import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireClient, toISO } from "../../_utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FileDoc = {
  projectId?: string;
  projectName?: string;
  clientId?: string;
  category?: string;
  fileName?: string;
  downloadUrl?: string;
  uploadedAt?: any;
  size?: number;
  isDeleted?: boolean;
};

export async function GET() {
  try {
    const auth = await requireClient();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const snap = await adminDb
      .collection("files")
      .where("clientId", "==", auth.clientId)
      .where("isDeleted", "==", false)
      .orderBy("uploadedAt", "desc")
      .limit(500)
      .get();

    const files = snap.docs.map((doc) => {
      const data = (doc.data() || {}) as FileDoc;
      return {
        id: doc.id,
        projectId: data.projectId || "",
        projectName: data.projectName || "",
        category: data.category || "Other",
        fileName: data.fileName || "",
        downloadUrl: data.downloadUrl || "",
        uploadedAt: toISO(data.uploadedAt),
        size: Number(data.size || 0),
      };
    });

    return NextResponse.json({ ok: true, files });
  } catch (err: any) {
    console.error("client/files list error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load files.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
